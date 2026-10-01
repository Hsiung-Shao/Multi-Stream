// 個人週表資料層：slug 檢查、查無此人、合併場次掛到主場次、7 天／30 天分段、連線設定來源
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agencyOf, fetchPerson, resetPersonSourceCache, splitPersonStreams, type PersonStreamRow } from '../../../src/features/schedule/personSource';

const NOW = Date.parse('2026-09-29T04:00:00Z');

const row = (o: Partial<PersonStreamRow> & Pick<PersonStreamRow, 'id' | 'status'>): PersonStreamRow => ({
    platform: 'youtube', external_id: o.id, source: 'yt_waiting_room', title: null, category: null,
    scheduled_start: null, actual_start: null, actual_end: null, merged_with: null, ...o,
});

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('splitPersonStreams', () => {
    it('次要場次的主場次也在結果裡 → 掛成 also，不單獨輸出', () => {
        const out = splitPersonStreams('v1', [
            row({ id: 'yt', status: 'live', actual_start: '2026-09-29T03:00:00Z' }),
            row({ id: 'tw', status: 'live', platform: 'twitch', external_id: '999', source: 'twitch_live', merged_with: 'yt' }),
        ], NOW);
        expect(out.live).toHaveLength(1);
        expect(out.live[0].external_id).toBe('yt');
        expect(out.live[0].also).toEqual([{ platform: 'twitch', external_id: '999', source: 'twitch_live' }]);
    });

    it('主場次不在結果裡（例：已過期）→ 次要場次照常輸出', () => {
        const out = splitPersonStreams('v1', [
            row({ id: 'tw', status: 'scheduled', platform: 'twitch', source: 'twitch_schedule', merged_with: 'gone', scheduled_start: '2026-09-29T10:00:00Z' }),
        ], NOW);
        expect(out.upcoming.map((s) => s.external_id)).toEqual(['tw']);
        expect(out.upcoming[0].also).toBeUndefined();
    });

    it('接下來只收 7 天內並依時間排序；最近依結束時間新到舊；沒有結束時間的 ended 不列', () => {
        const out = splitPersonStreams('v1', [
            row({ id: 'late', status: 'scheduled', scheduled_start: '2026-10-09T00:00:00Z' }),
            row({ id: 'b', status: 'scheduled', scheduled_start: '2026-09-30T00:00:00Z' }),
            row({ id: 'a', status: 'scheduled', scheduled_start: '2026-09-29T10:00:00Z' }),
            row({ id: 'old', status: 'ended', actual_end: '2026-09-01T00:00:00Z' }),
            row({ id: 'new', status: 'ended', actual_end: '2026-09-28T00:00:00Z' }),
            row({ id: 'noend', status: 'ended' }),
        ], NOW);
        expect(out.upcoming.map((s) => s.external_id)).toEqual(['a', 'b']);
        expect(out.recent.map((s) => s.external_id)).toEqual(['new', 'old']);
    });

    it('預定時間已過 15 分鐘還沒開台的不列入接下來；寬限內的保留', () => {
        const out = splitPersonStreams('v1', [
            row({ id: 'past', status: 'scheduled', scheduled_start: '2026-09-29T03:44:00Z' }),
            row({ id: 'grace', status: 'scheduled', scheduled_start: '2026-09-29T03:50:00Z' }),
            row({ id: 'soon', status: 'scheduled', scheduled_start: '2026-09-29T04:01:00Z' }),
        ], NOW);
        expect(out.upcoming.map((s) => s.external_id)).toEqual(['grace', 'soon']);
    });

    it('null 欄位不輸出（與 snapshot 形狀一致）', () => {
        const out = splitPersonStreams('v1', [row({ id: 'a', status: 'scheduled', scheduled_start: '2026-09-29T10:00:00Z' })], NOW);
        expect(out.upcoming[0]).toEqual({
            vtuber_id: 'v1', platform: 'youtube', external_id: 'a', source: 'yt_waiting_room', status: 'scheduled', scheduled_start: '2026-09-29T10:00:00Z',
        });
    });
});

describe('agencyOf', () => {
    it('子團取所屬公司、企業勢本身取自己、社團與未查證沒有', () => {
        expect(agencyOf({ name: '瑟拉斯蒂歐', kind: 'agency', parent: { name: '春魚創意', kind: 'agency' } })).toBe('春魚創意');
        expect(agencyOf({ name: '子午計畫', kind: 'agency', parent: null })).toBe('子午計畫');
        expect(agencyOf({ name: '某社團', kind: 'circle', parent: null })).toBeNull();
        expect(agencyOf(null)).toBeNull();
    });
});

describe('fetchPerson', () => {
    beforeEach(() => resetPersonSourceCache());
    const env = { envUrl: 'http://127.0.0.1:57321/', envAnonKey: 'anon-test', now: NOW };

    it('slug 不合規則直接回 null，不發請求', async () => {
        const fetchFn = vi.fn();
        expect(await fetchPerson('Bad Slug!', { ...env, fetchFn })).toBeNull();
        expect(await fetchPerson('a', { ...env, fetchFn })).toBeNull();
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it('查無此人回 null', async () => {
        const fetchFn = vi.fn(async () => jsonResponse([]));
        expect(await fetchPerson('nobody', { ...env, fetchFn })).toBeNull();
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('查到人：帶 anon key、查 streams 帶常駐框過濾，組出頻道資訊', async () => {
        const fetchFn = vi.fn(async (url: string) => {
            if (url.includes('/rest/v1/vtubers')) {
                return jsonResponse([{
                    id: 'v1', name: '台一', img_url: 'https://yt3.ggpht.com/a', nationality: 'TW', youtube_channel_id: 'UC1', twitch_channel_id: 'taione',
                    slug: 'taione', schedule_indexable: true, vtuber_groups: { name: '子午計畫', kind: 'agency', parent: null },
                }]);
            }
            if (url.includes('status=in.')) return jsonResponse([row({ id: 'yt', status: 'live' })]);
            return jsonResponse([row({ id: 'e1', status: 'ended', actual_end: '2026-09-28T00:00:00Z' })]);
        });
        const p = await fetchPerson('taione', { ...env, fetchFn: fetchFn as unknown as typeof fetch });
        expect(p?.channel).toEqual({ name: '台一', nationality: 'TW', slug: 'taione', avatar: 'https://yt3.ggpht.com/a', group: '子午計畫', agency: '子午計畫', youtube: 'UC1', twitch: 'taione' });
        expect(p?.indexable).toBe(true);
        expect(p?.live).toHaveLength(1);
        expect(p?.recent.map((s) => s.external_id)).toEqual(['e1']);
        const [vtUrl, vtInit] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
        expect(vtUrl.startsWith('http://127.0.0.1:57321/rest/v1/vtubers?')).toBe(true);
        expect((vtInit.headers as Record<string, string>).apikey).toBe('anon-test');
        // 排定中／直播中與最近紀錄分兩支查，各自排序與上限（直播中的 Twitch 與最新紀錄不會被 limit 截掉）
        const [activeUrl, endedUrl] = [fetchFn.mock.calls[1][0], fetchFn.mock.calls[2][0]] as string[];
        for (const u of [activeUrl, endedUrl]) {
            expect(u).toContain('vtuber_id=eq.v1');
            expect(u).toContain('is_schedule_frame=eq.false');
        }
        expect(activeUrl).toContain('status=in.(scheduled,live)');
        expect(activeUrl).toContain('nullsfirst');
        expect(endedUrl).toContain('actual_end=gte.2026-08-30T04:00:00.000Z');
        expect(endedUrl).toContain('order=actual_end.desc');
    });

    it('沒有環境變數時改讀 /api/supabase-config，且只讀一次', async () => {
        const fetchFn = vi.fn(async (url: string) => {
            if (url === '/api/supabase-config') return jsonResponse({ url: 'https://x.supabase.co', anonKey: 'k' });
            return jsonResponse([]);
        });
        const opts = { envUrl: '', envAnonKey: '', fetchFn: fetchFn as unknown as typeof fetch, now: NOW };
        await fetchPerson('someone', opts);
        await fetchPerson('someone', opts);
        expect(fetchFn.mock.calls.filter((c) => c[0] === '/api/supabase-config')).toHaveLength(1);
        expect(fetchFn.mock.calls[1][0]).toMatch(/^https:\/\/x\.supabase\.co\/rest\/v1\/vtubers\?/);
    });

    it('團體新欄位還沒上線（PostgREST 400）時退回只查團名', async () => {
        const fetchFn = vi.fn(async (url: string) => {
            if (url.includes('/rest/v1/vtubers') && decodeURIComponent(url).includes('parent:parent_id')) return new Response('{"code":"42703"}', { status: 400 });
            if (url.includes('/rest/v1/vtubers')) {
                return jsonResponse([{ id: 'v1', name: '台一', img_url: null, nationality: 'TW', youtube_channel_id: 'UC1', twitch_channel_id: null, slug: 'taione', schedule_indexable: false, vtuber_groups: { name: '子午計畫' } }]);
            }
            return jsonResponse([]);
        });
        const p = await fetchPerson('taione', { ...env, fetchFn: fetchFn as unknown as typeof fetch });
        expect(p?.channel.group).toBe('子午計畫');
        expect(p?.channel.agency).toBeUndefined();
    });

    it('HTTP 錯誤丟出 SnapshotError（交給 TanStack Query 重試／顯示錯誤）', async () => {
        const fetchFn = vi.fn(async () => new Response('boom', { status: 500 }));
        await expect(fetchPerson('someone', { ...env, fetchFn })).rejects.toMatchObject({ name: 'SnapshotError', reason: 'http' });
    });
});
