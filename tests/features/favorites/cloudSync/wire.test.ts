import { describe, it, expect } from 'vitest';
import { favToRow, rowToFav, catToRow, rowToCat, tagToRow, rowToTag } from '../../../../src/features/favorites/cloudSync/wire';
import type { FavoriteStream } from '../../../../src/features/favorites/types';

const full: FavoriteStream = {
    id: 'f1', url: 'https://youtube.com/watch?v=abc', name: 'N', platform: 'youtube', channelId: 'UC1', videoId: 'abc',
    categoryId: 'c1', tagIds: ['t1', 't2'], addedAt: '2026-02-03T04:05:06.000Z',
};

describe('wire row 轉換', () => {
    it('S7 收藏轉 row 欄位對應正確', () => {
        expect(favToRow(full, 'u1')).toEqual({
            user_id: 'u1', client_id: 'f1', url: full.url, name: 'N', platform: 'youtube', channel_id: 'UC1', video_id: 'abc',
            category_client_id: 'c1', tag_client_ids: ['t1', 't2'], added_at: full.addedAt,
        });
    });

    it('S7 收藏來回轉換一致', () => {
        expect(rowToFav(favToRow(full, 'u1'))).toEqual(full);
    });

    it('S7 缺值轉成 null、tagIds 缺轉成空陣列', () => {
        const row = favToRow({ id: 'f2', url: 'u', name: 'n', platform: 'other', addedAt: '2026-01-01T00:00:00.000Z' }, 'u1');
        expect(row.channel_id).toBeNull();
        expect(row.video_id).toBeNull();
        expect(row.category_client_id).toBeNull();
        expect(row.tag_client_ids).toEqual([]);
    });

    it('S6 row 不含開台狀態欄位', () => {
        const row = favToRow({ ...full, isLive: true, viewerCount: 10, lastChecked: 'x', liveTitle: 't', gameName: 'g', liveVideoId: 'v', liveUrl: 'u' }, 'u1');
        const keys = Object.keys(row);
        for (const k of ['isLive', 'is_live', 'viewerCount', 'viewer_count', 'lastChecked', 'liveTitle', 'gameName', 'liveVideoId', 'liveUrl']) {
            expect(keys).not.toContain(k);
        }
        expect(keys.sort()).toEqual(['added_at', 'category_client_id', 'channel_id', 'client_id', 'name', 'platform', 'tag_client_ids', 'url', 'user_id', 'video_id']);
    });

    it('S7 分類 created_at 與 createdAt 互轉', () => {
        const c = { id: 'c1', name: '分類', createdAt: '2026-03-01T00:00:00.000Z' };
        const row = catToRow(c, 'u1');
        expect(row).toEqual({ user_id: 'u1', client_id: 'c1', name: '分類', created_at: c.createdAt });
        expect(rowToCat(row)).toEqual(c);
    });

    it('S7 標籤 order 與 sort_order 互轉', () => {
        const t = { id: 't1', name: 'T', color: '#00ff00', order: 5 };
        const row = tagToRow(t, 'u1');
        expect(row).toEqual({ user_id: 'u1', client_id: 't1', name: 'T', color: '#00ff00', sort_order: 5 });
        expect(rowToTag(row)).toEqual(t);
    });

    it('S7 sort_order 夾在 0–9999 的整數', () => {
        const so = (order: number) => tagToRow({ id: 't', name: 'T', color: '#000', order }, 'u1').sort_order;
        expect(so(-5)).toBe(0);
        expect(so(123456)).toBe(9999);
        expect(so(0)).toBe(0);
        expect(so(9999)).toBe(9999);
        expect(Number.isInteger(so(3.7))).toBe(true);
        expect(so(3.7)).toBeGreaterThanOrEqual(3);
        expect(so(3.7)).toBeLessThanOrEqual(4);
        expect(so(Date.now())).toBe(9999); // 以時間戳當 order 的舊資料不能撐爆欄位
    });
});
