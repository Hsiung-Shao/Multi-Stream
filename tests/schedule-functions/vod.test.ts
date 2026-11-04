// VOD 對帳（結束場次的回放連結）：Twitch 依實況主分組查 helix、YouTube 逐支查 oEmbed，以及 snapshot 輸出
// V 編號對應計畫〈VOD 連結〉的測試規格表
import { describe, expect, it, vi } from 'vitest';
import {
  VOD_MISSING_AFTER_MS,
  VOD_TWITCH_USERS_PER_RUN,
  VOD_YT_PER_RUN,
  reconcileTwitchVods,
  reconcileYouTubeVods,
  type VodPending,
} from '../../supabase/functions/_shared/vod.ts';
import { buildSnapshot, type SnapshotSourceRow } from '../../supabase/functions/_shared/snapshot.ts';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

const tw = (id: string, over: Partial<VodPending> = {}): VodPending => ({
  id,
  platform: 'twitch',
  external_id: `stream-${id}`,
  actual_end: iso(NOW - 2 * HOUR),
  broadcaster_id: 'b1',
  ...over,
});
const yt = (id: string, over: Partial<VodPending> = {}): VodPending => ({
  id,
  platform: 'youtube',
  external_id: `yt${id}`,
  actual_end: iso(NOW - 2 * HOUR),
  broadcaster_id: null,
  ...over,
});

describe('reconcileTwitchVods', () => {
  it('V1 helix 回傳的 stream_id 對上 external_id → ok 並帶 video id；請求網址依實況主查封存', async () => {
    const helix = vi.fn(async (_url: string) => ({ data: [{ id: 'v999', stream_id: 'other' }, { id: 'v123', stream_id: 'stream-s1' }] }));
    const r = await reconcileTwitchVods([tw('s1')], helix, NOW);
    expect(r.results).toHaveLength(1);
    expect(r.results[0]).toMatchObject({ id: 's1', vod_id: 'v123', vod_status: 'ok', vod_checked_at: iso(NOW) });
    expect(r.calls).toBe(1);
    expect(r.deferred).toBe(0);
    expect(helix.mock.calls[0][0]).toContain('helix/videos?user_id=b1&type=archive&first=20');
  });

  it('V1 同一位實況主多場只呼叫一次 helix，各場各自對上自己的 video', async () => {
    const helix = vi.fn(async (_url: string) => ({ data: [{ id: 'vA', stream_id: 'stream-s1' }, { id: 'vB', stream_id: 'stream-s2' }] }));
    const r = await reconcileTwitchVods([tw('s1'), tw('s2')], helix, NOW);
    expect(helix).toHaveBeenCalledTimes(1);
    expect(r.calls).toBe(1);
    const byId = Object.fromEntries(r.results.map((x) => [x.id, x.vod_id]));
    expect(byId).toEqual({ s1: 'vA', s2: 'vB' });
  });

  it('V1 不同實況主各呼叫一次，網址帶各自的 user_id', async () => {
    const helix = vi.fn(async (_url: string) => ({ data: [] }));
    await reconcileTwitchVods([tw('s1'), tw('s2', { broadcaster_id: 'b2' })], helix, NOW);
    const urls = helix.mock.calls.map((c) => c[0]);
    expect(urls).toHaveLength(2);
    expect(urls.some((u) => u.includes('user_id=b1&'))).toBe(true);
    expect(urls.some((u) => u.includes('user_id=b2&'))).toBe(true);
  });

  it('V2 沒對到且結束超過 24 小時 → missing（vod_id 為 null）', async () => {
    const helix = async (_url: string) => ({ data: [{ id: 'vX', stream_id: 'unrelated' }] });
    const r = await reconcileTwitchVods([tw('s1', { actual_end: iso(NOW - 25 * HOUR) })], helix, NOW);
    expect(r.results[0]).toMatchObject({ id: 's1', vod_status: 'missing', vod_checked_at: iso(NOW) });
    expect(r.results[0].vod_id ?? null).toBeNull();
  });

  it('V2 沒對到但結束不到 24 小時 → unknown，只更新檢查時間', async () => {
    const helix = async (_url: string) => ({ data: [] });
    const r = await reconcileTwitchVods([tw('s1', { actual_end: iso(NOW - 23 * HOUR) })], helix, NOW);
    expect(r.results[0]).toMatchObject({ id: 's1', vod_status: 'unknown', vod_checked_at: iso(NOW) });
    expect(r.results[0].vod_id ?? null).toBeNull();
  });

  it('V2 24 小時邊界：剛好 24 小時仍是 unknown，多 1 毫秒才 missing', async () => {
    expect(VOD_MISSING_AFTER_MS).toBe(24 * HOUR);
    const helix = async (_url: string) => ({ data: [] });
    const exact = await reconcileTwitchVods([tw('s1', { actual_end: iso(NOW - 24 * HOUR) })], helix, NOW);
    expect(exact.results[0].vod_status).toBe('unknown');
    const over = await reconcileTwitchVods([tw('s1', { actual_end: iso(NOW - 24 * HOUR - 1) })], helix, NOW);
    expect(over.results[0].vod_status).toBe('missing');
  });

  it('V3 helix 回 null（錯誤或限速）→ 該組不寫結果、全算 deferred', async () => {
    const helix = vi.fn(async (_url: string) => null);
    const r = await reconcileTwitchVods([tw('s1'), tw('s2')], helix, NOW);
    expect(r.results).toEqual([]);
    expect(r.deferred).toBe(2);
  });

  it('V3 一組失敗不影響其他組', async () => {
    const helix = async (url: string) => (url.includes('user_id=b1&') ? null : { data: [{ id: 'vZ', stream_id: 'stream-s2' }] });
    const r = await reconcileTwitchVods([tw('s1'), tw('s2', { broadcaster_id: 'b2' })], helix, NOW);
    expect(r.results.map((x) => x.id)).toEqual(['s2']);
    expect(r.deferred).toBe(1);
  });

  it('V3 超過每次 20 位實況主 → 只查 20 位，其餘整組 deferred 且不呼叫', async () => {
    expect(VOD_TWITCH_USERS_PER_RUN).toBe(20);
    const pending = Array.from({ length: 25 }, (_, i) => tw(`s${i}`, { broadcaster_id: `b${i}` }));
    const helix = vi.fn(async (_url: string) => ({ data: [] }));
    const r = await reconcileTwitchVods(pending, helix, NOW);
    expect(helix).toHaveBeenCalledTimes(20);
    expect(r.calls).toBe(20);
    expect(r.results).toHaveLength(20);
    expect(r.deferred).toBe(5);
  });

  it('V3 broadcaster_id 為 null 的場次直接 deferred、不呼叫 helix', async () => {
    const helix = vi.fn(async (_url: string) => ({ data: [] }));
    const r = await reconcileTwitchVods([tw('s1', { broadcaster_id: null })], helix, NOW);
    expect(helix).not.toHaveBeenCalled();
    expect(r.results).toEqual([]);
    expect(r.deferred).toBe(1);
  });
});

describe('reconcileYouTubeVods', () => {
  const res = (status: number) => new Response('{}', { status });
  const asFetch = (fn: (url: string) => Promise<Response>) => fn as unknown as typeof fetch;

  it('V4 HTTP 200 → ok，vod_id 等於 external_id；請求打 oEmbed', async () => {
    const fetchFn = vi.fn(async (_url: string) => res(200));
    const r = await reconcileYouTubeVods([yt('1')], asFetch(fetchFn), NOW);
    expect(r.results[0]).toMatchObject({ id: '1', vod_id: 'yt1', vod_status: 'ok', vod_checked_at: iso(NOW) });
    expect(r.throttled).toBe(false);
    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toContain('https://www.youtube.com/oembed');
    expect(url).toContain('yt1');
    expect(url).toContain('format=json');
  });

  it.each([401, 403, 404])('V5 HTTP %i 且結束超過 24 小時 → missing', async (code) => {
    const r = await reconcileYouTubeVods([yt('1', { actual_end: iso(NOW - 30 * HOUR) })], asFetch(async () => res(code)), NOW);
    expect(r.results[0]).toMatchObject({ id: '1', vod_status: 'missing' });
    expect(r.results[0].vod_id ?? null).toBeNull();
    expect(r.throttled).toBe(false);
  });

  it.each([401, 403, 404])('V5 HTTP %i 但結束不到 24 小時 → unknown（YouTube 還在處理）', async (code) => {
    const r = await reconcileYouTubeVods([yt('1', { actual_end: iso(NOW - 3 * HOUR) })], asFetch(async () => res(code)), NOW);
    expect(r.results[0]).toMatchObject({ id: '1', vod_status: 'unknown', vod_checked_at: iso(NOW) });
    expect(r.results[0].vod_id ?? null).toBeNull();
  });

  it.each([429, 500, 503])('V6 HTTP %i → throttled，全部 deferred 不寫結果', async (code) => {
    const pending = ['1', '2', '3', '4', '5'].map((i) => yt(i));
    const r = await reconcileYouTubeVods(pending, asFetch(async () => res(code)), NOW);
    expect(r.throttled).toBe(true);
    expect(r.results).toEqual([]);
    expect(r.deferred).toBe(5);
  });

  it('V6 fetch 拋錯 → throttled，不當成 missing', async () => {
    const fetchFn = async () => {
      throw new Error('network down');
    };
    const r = await reconcileYouTubeVods([yt('1', { actual_end: iso(NOW - 48 * HOUR) })], asFetch(fetchFn), NOW);
    expect(r.throttled).toBe(true);
    expect(r.results).toEqual([]);
    expect(r.deferred).toBe(1);
  });

  it('V6 被限速後不再繼續打剩下的場次', async () => {
    const pending = Array.from({ length: 30 }, (_, i) => yt(String(i)));
    const fetchFn = vi.fn(async (_url: string) => res(429));
    await reconcileYouTubeVods(pending, asFetch(fetchFn), NOW);
    // 並發上限 4：第一輪最多 4 支，限速後不再開新的
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('V6 限速的那一筆不會有結果（即使其他筆成功）', async () => {
    const fetchFn = async (url: string) => {
      if (url.includes('ytbad')) throw new Error('boom');
      return res(200);
    };
    const r = await reconcileYouTubeVods([yt('1'), yt('bad'), yt('2')], asFetch(fetchFn), NOW);
    expect(r.throttled).toBe(true);
    expect(r.results.find((x) => x.id === 'bad')).toBeUndefined();
  });

  it('V7 每次最多 40 筆：50 筆只查 40，其餘 deferred', async () => {
    expect(VOD_YT_PER_RUN).toBe(40);
    const pending = Array.from({ length: 50 }, (_, i) => yt(String(i)));
    const fetchFn = vi.fn(async (_url: string) => res(200));
    const r = await reconcileYouTubeVods(pending, asFetch(fetchFn), NOW);
    expect(fetchFn).toHaveBeenCalledTimes(40);
    expect(r.results).toHaveLength(40);
    expect(r.checked).toBe(40);
    expect(r.deferred).toBe(10);
    expect(r.throttled).toBe(false);
  });

  it('V7 混合結果各自歸類', async () => {
    const fetchFn = async (url: string) => (url.includes('ytgone') ? res(404) : res(200));
    const r = await reconcileYouTubeVods([yt('good'), yt('gone', { actual_end: iso(NOW - 48 * HOUR) })], asFetch(fetchFn), NOW);
    const byId = Object.fromEntries(r.results.map((x) => [x.id, x.vod_status]));
    expect(byId).toEqual({ good: 'ok', gone: 'missing' });
  });
});

describe('buildSnapshot：VOD 欄位', () => {
  const base = (over: Record<string, unknown>) =>
    ({
      id: 'a',
      vtuber_id: 'v1',
      channel_id: 'c1',
      platform: 'twitch',
      source: 'twitch_live',
      external_id: '111',
      status: 'ended',
      title: '歌回',
      category: null,
      scheduled_start: null,
      actual_start: iso(NOW - 4 * HOUR),
      actual_end: iso(NOW - 2 * HOUR),
      fetched_at: iso(NOW - 2 * HOUR),
      is_schedule_frame: false,
      ...over,
    }) as unknown as SnapshotSourceRow;
  const vtubers = [{ id: 'v1', name: '一號', img_url: null, nationality: 'TW', group_id: null, youtube_channel_id: 'UC1', twitch_channel_id: 'one' }];
  const recentOf = (rows: SnapshotSourceRow[]) => buildSnapshot(rows, vtubers, new Map(), NOW, null).recent[0] as unknown as Record<string, unknown>;

  it('V8 ok 且有 vod_id → recent 項目帶 vod_status 與 vod_id', () => {
    const item = recentOf([base({ vod_status: 'ok', vod_id: '2345' })]);
    expect(item.vod_status).toBe('ok');
    expect(item.vod_id).toBe('2345');
  });

  it('V8 missing → 帶 vod_status，不帶 vod_id', () => {
    const item = recentOf([base({ vod_status: 'missing', vod_id: null })]);
    expect(item.vod_status).toBe('missing');
    expect('vod_id' in item).toBe(false);
  });

  it('V8 unknown 或沒有 vod_status → 兩欄都不出現', () => {
    for (const over of [{ vod_status: 'unknown', vod_id: null }, { vod_status: null, vod_id: null }, {}]) {
      const item = recentOf([base(over)]);
      expect('vod_status' in item).toBe(false);
      expect('vod_id' in item).toBe(false);
    }
  });

  it('V8 live／upcoming 項目永遠沒有 vod 欄位', () => {
    const live = base({ id: 'l', external_id: 'L1', status: 'live', actual_end: null, vod_status: 'ok', vod_id: '9' });
    const up = base({ id: 'u', external_id: 'U1', status: 'scheduled', actual_start: null, actual_end: null, scheduled_start: iso(NOW + 2 * HOUR), vod_status: 'ok', vod_id: '9' });
    const snap = buildSnapshot([live, up], vtubers, new Map(), NOW, null);
    for (const item of [snap.live[0], snap.upcoming[0]] as unknown as Record<string, unknown>[]) {
      expect(item).toBeDefined();
      expect('vod_status' in item).toBe(false);
      expect('vod_id' in item).toBe(false);
    }
  });
});
