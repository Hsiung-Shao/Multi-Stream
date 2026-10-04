// 直播狀態共享表的前端讀取（路線圖階段 1）
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSupabase } = vi.hoisted(() => ({ getSupabase: vi.fn() }));
vi.mock('../../../src/lib/supabase', () => ({ getSupabase }));

import {
    fetchLiveStatuses,
    isLiveStatusFresh,
    toLiveStatusResult,
    LIVE_STATUS_FRESH_MS,
    LIVE_STATUS_FRESH_LIVE_MS,
    autoFreshMaxAge,
    type LiveStatusRow,
} from '../../../src/features/favorites/liveStatusRepository';

const NOW = Date.UTC(2026, 8, 23, 12);
const id = (n: number) => 'UC' + String(n).padStart(22, '0');

const row = (over: Partial<LiveStatusRow> = {}): LiveStatusRow => ({
    channel_id: id(1),
    is_live: false,
    is_upcoming: false,
    is_schedule_frame: false,
    video_id: null,
    channel_title: 'Ch',
    scheduled_start_at: null,
    checked_at: new Date(NOW).toISOString(),
    ...over,
});

/** 假的 supabase query builder：記錄每次 .in() 的值 */
function fakeClient(respond: (ids: string[]) => { data: unknown; error: unknown } | Promise<never>) {
    const inCalls: string[][] = [];
    const client = {
        from: () => ({
            select: () => ({
                in: (_col: string, ids: string[]) => {
                    inCalls.push(ids);
                    return { abortSignal: () => respond(ids) };
                },
            }),
        }),
    };
    return { client, inCalls };
}

beforeEach(() => {
    getSupabase.mockReset();
});

describe('isLiveStatusFresh', () => {
    it('22 分鐘內 → 新鮮；超過 → 過期（配合週表排程 schedule-live 每 20 分鐘更新）', () => {
        expect(LIVE_STATUS_FRESH_MS).toBe(22 * 60_000);
        expect(isLiveStatusFresh(row(), NOW + LIVE_STATUS_FRESH_MS - 1)).toBe(true);
        expect(isLiveStatusFresh(row(), NOW + LIVE_STATUS_FRESH_MS)).toBe(false);
    });

    it('自動輪詢門檻：直播中的列 62 分鐘（排程每小時重查直播中頻道），其他 22 分鐘', () => {
        expect(LIVE_STATUS_FRESH_LIVE_MS).toBe(62 * 60_000);
        expect(autoFreshMaxAge(row({ is_live: true }))).toBe(LIVE_STATUS_FRESH_LIVE_MS);
        expect(autoFreshMaxAge(row({ is_live: false, is_upcoming: true }))).toBe(LIVE_STATUS_FRESH_MS);
    });

    it('使用者時鐘比伺服器慢（checked_at 在未來）→ 視窗內仍算新鮮，超出視窗算過期', () => {
        expect(isLiveStatusFresh(row(), NOW - 60_000)).toBe(true);
        expect(isLiveStatusFresh(row(), NOW - LIVE_STATUS_FRESH_MS - 1)).toBe(false);
    });

    it('checked_at 無法解析 → 過期', () => {
        expect(isLiveStatusFresh(row({ checked_at: 'garbage' }), NOW)).toBe(false);
    });
});

describe('toLiveStatusResult', () => {
    it('與端點回應同形（finalUrl、liveVideoId、scheduledStartTime 為 epoch 秒）', () => {
        const r = toLiveStatusResult(row({
            is_upcoming: true,
            video_id: 'abcdefghijk',
            scheduled_start_at: '2026-09-24T00:00:00.000Z',
        }));
        expect(r).toEqual({
            isLive: false,
            liveVideoId: 'abcdefghijk',
            finalUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
            isUpcoming: true,
            scheduledStartTime: String(Date.UTC(2026, 8, 24) / 1000),
            channelTitle: 'Ch',
        });
    });

    it('沒有 video_id → 不產生連結', () => {
        const r = toLiveStatusResult(row());
        expect(r.finalUrl).toBeUndefined();
        expect(r.liveVideoId).toBeUndefined();
    });
});

describe('fetchLiveStatuses', () => {
    it('超過 100 個頻道時分批讀取、去重', async () => {
        const ids = Array.from({ length: 150 }, (_, i) => id(i));
        const { client, inCalls } = fakeClient(batch => ({ data: batch.map(c => row({ channel_id: c })), error: null }));
        getSupabase.mockResolvedValue(client);
        const result = await fetchLiveStatuses([...ids, ids[0]]);
        expect(inCalls.map(c => c.length)).toEqual([100, 50]);
        expect(result.size).toBe(150);
    });

    it('Supabase 未設定 → 空結果', async () => {
        getSupabase.mockResolvedValue(null);
        expect((await fetchLiveStatuses([id(1)])).size).toBe(0);
    });

    it('查詢回錯誤或丟例外 → 空結果（呼叫端會退回打端點），不丟錯', async () => {
        const { client } = fakeClient(() => ({ data: null, error: { message: 'boom' } }));
        getSupabase.mockResolvedValue(client);
        expect((await fetchLiveStatuses([id(1)])).size).toBe(0);

        const { client: throwing } = fakeClient(() => Promise.reject(new Error('network')));
        getSupabase.mockResolvedValue(throwing);
        expect((await fetchLiveStatuses([id(1)])).size).toBe(0);
    });

    it('沒有要查的頻道 → 不初始化 Supabase', async () => {
        await fetchLiveStatuses([]);
        expect(getSupabase).not.toHaveBeenCalled();
    });
});
