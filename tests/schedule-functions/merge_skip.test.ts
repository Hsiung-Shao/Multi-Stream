// applyMerges 的輸入指紋（schedule_merge_check／schedule_merge_mark）：沒變就不讀全部場次，結果必須與不跳過時相同。
// 只攔 fetch（PostgREST），不 mock 自家模組。
import { describe, expect, it } from 'vitest';
import { Db } from '../../supabase/functions/_shared/db.ts';
import { applyMerges } from '../../supabase/functions/_shared/sweep.ts';
import { emptyStats } from '../../supabase/functions/_shared/types.ts';

const NOW = Date.parse('2026-10-09T12:00:00Z');

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function fakeDb(check: { changed: boolean; fingerprint: string }, active: unknown[]) {
  const calls: Call[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = decodeURIComponent(String(input));
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (method === 'POST' && url.includes('/rpc/schedule_merge_check')) return new Response(JSON.stringify(check), { status: 200 });
    if (method === 'GET' && url.includes('status=in.(scheduled,live)')) return new Response(JSON.stringify(active), { status: 200 });
    if (method === 'GET') return new Response('[]', { status: 200 });
    return new Response('', { status: 200, headers: { 'content-range': '0-0/1' } });
  }) as unknown as typeof fetch;
  return { db: new Db({ url: 'http://db', serviceRoleKey: 'k', fetch: fetchFn }), calls };
}

const row = (id: string, p: Record<string, unknown>) => ({
  id, vtuber_id: 'v1', platform: 'youtube', source: 'yt_waiting_room', status: 'scheduled',
  scheduled_start: '2026-10-09T14:00:00Z', actual_start: null, is_schedule_frame: false, merged_with: null, ...p,
});
// YouTube 待機室＋同時段 Twitch 週表 → Twitch 那場應併入 YouTube
const yt = row('a', {});
const tw = row('b', { platform: 'twitch', source: 'twitch_schedule', scheduled_start: '2026-10-09T14:10:00Z' });
const isRpc = (c: Call, fn: string) => c.method === 'POST' && c.url.includes(`/rest/v1/rpc/${fn}`);

describe('applyMerges 輸入指紋', () => {
  it('指紋沒變：只發 schedule_merge_check（帶 3 小時前的 ended 下限），不讀 streams、不寫入、不 mark', async () => {
    const { db, calls } = fakeDb({ changed: false, fingerprint: 'fp' }, [yt, tw]);
    const stats = emptyStats('live', NOW);
    await applyMerges(db, stats, NOW);
    expect(calls).toHaveLength(1);
    expect(isRpc(calls[0], 'schedule_merge_check')).toBe(true);
    expect(calls[0].body).toEqual({ p_ended_since: new Date(NOW - 3 * 3_600_000).toISOString() });
    expect(stats.merges_skipped).toBe(true);
    expect(stats.merges_changed).toBe(0);
  });

  it('指紋變了、算完有要改的列：照舊讀兩支查詢並寫 merged_with，這輪不 mark（下一輪確認穩定才記）', async () => {
    const { db, calls } = fakeDb({ changed: true, fingerprint: 'fp2' }, [yt, tw]);
    const stats = emptyStats('live', NOW);
    await applyMerges(db, stats, NOW);
    expect(calls.filter((c) => c.method === 'GET' && c.url.includes('/rest/v1/streams?'))).toHaveLength(2);
    const patch = calls.find((c) => c.method === 'PATCH' && c.url.includes('/rest/v1/streams?'));
    expect(patch?.url).toContain('id=in.("b")');
    expect(patch?.body).toEqual({ merged_with: 'a' });
    expect(stats.merges_changed).toBe(1);
    expect(calls.some((c) => isRpc(c, 'schedule_merge_mark'))).toBe(false);
  });

  it('指紋變了、算完沒有要改的列（已是穩定狀態）：mark 這次的指紋', async () => {
    const { db, calls } = fakeDb({ changed: true, fingerprint: 'fp3' }, [yt, { ...tw, merged_with: 'a' }]);
    const stats = emptyStats('live', NOW);
    await applyMerges(db, stats, NOW);
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    const mark = calls.filter((c) => isRpc(c, 'schedule_merge_mark'));
    expect(mark).toHaveLength(1);
    expect(mark[0].body).toEqual({ p_fingerprint: 'fp3' });
  });
});
