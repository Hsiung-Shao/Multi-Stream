// 收藏同步 review 修正：同名分類、重複頻道、時間格式、超出雲端限制、刪除先於寫入、換帳號先問
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mergeSync, type SyncData } from '../../../../src/features/favorites/cloudSync/merge';
import { favToRow, rowToFav, rowToCat, catToRow } from '../../../../src/features/favorites/cloudSync/wire';
import type { FavoriteCategory, FavoriteStream } from '../../../../src/features/favorites/types';

const fav = (id: string, over: Partial<FavoriteStream> = {}): FavoriteStream => ({
    id, url: `https://www.twitch.tv/${id}`, name: id, platform: 'twitch', channelId: id, videoId: null,
    categoryId: null, tagIds: [], addedAt: '2026-01-01T00:00:00.000Z', ...over,
});
const cat = (id: string, name: string): FavoriteCategory => ({ id, name, createdAt: '2026-01-01T00:00:00.000Z' });
const data = (p: Partial<SyncData> = {}): SyncData => ({ favorites: [], categories: [], tags: [], ...p });

describe('合併：避免撞雲端唯一限制與重複', () => {
    it('本機新分類與雲端分類同名時併到雲端那個，收藏改指雲端分類、不推本機分類', () => {
        const r = mergeSync(
            data({ categories: [cat('b1', 'VTuber')], favorites: [fav('x', { categoryId: 'b1' })] }),
            data({ categories: [cat('a1', 'VTuber')] }),
            null,
        );
        expect(r.local.categories.map(c => c.id)).toEqual(['a1']);
        expect(r.upsert.categories).toEqual([]);
        expect(r.local.favorites[0].categoryId).toBe('a1');
        expect(r.upsert.favorites.find(f => f.id === 'x')?.categoryId).toBe('a1');
    });

    it('兩台收藏同一個頻道（id 不同）只留雲端那筆，不產生重複', () => {
        const r = mergeSync(
            data({ favorites: [fav('local1', { channelId: 'kspksp', url: 'https://www.twitch.tv/kspksp' })] }),
            data({ favorites: [fav('cloud1', { channelId: 'kspksp', url: 'https://www.twitch.tv/kspksp' })] }),
            null,
        );
        expect(r.local.favorites.map(f => f.id)).toEqual(['cloud1']);
        expect(r.upsert.favorites).toEqual([]);
    });
});

describe('合併：刪掉分類又建同名（review 第 3 輪）', () => {
    it('雲端同名分類是本機剛刪掉的那個時不沿用它的 id，新分類與歸類保留', () => {
        const r = mergeSync(
            data({ categories: [cat('n', 'X')], favorites: [fav('f', { categoryId: 'n' })] }),
            data({ categories: [cat('o', 'X')], favorites: [fav('f')] }),
            data({ categories: [cat('o', 'X')], favorites: [fav('f')] }),
        );
        expect(r.local.categories.map(c => c.id)).toEqual(['n']);
        expect(r.local.favorites[0].categoryId).toBe('n');
        expect(r.remove.categories).toEqual(['o']);
        expect(r.upsert.categories.map(c => c.id)).toEqual(['n']);
    });
});

describe('欄位轉換：時間格式與雲端限制', () => {
    it('雲端回傳 +00:00 的時間統一成本機的 Z 格式，比對才會相等', () => {
        const f = rowToFav({ ...favToRow(fav('a'), 'u'), added_at: '2026-01-01T00:00:00+00:00' });
        expect(f.addedAt).toBe('2026-01-01T00:00:00.000Z');
        expect(rowToCat({ ...catToRow(cat('c', 'n'), 'u'), created_at: '2026-01-01T00:00:00.5+00:00' }).createdAt).toBe('2026-01-01T00:00:00.500Z');
    });

    it('超過雲端長度限制或缺值的收藏轉成合法的列', () => {
        const row = favToRow(fav('a', { name: 'n'.repeat(400), tagIds: Array.from({ length: 60 }, (_, i) => `t${i}`), addedAt: undefined as unknown as string }), 'u');
        expect(row.name.length).toBeLessThanOrEqual(300);
        expect(row.tag_client_ids.length).toBe(50);
        expect(Number.isNaN(Date.parse(row.added_at))).toBe(false);
        expect(favToRow(fav('b', { name: '   ' }), 'u').name.trim().length).toBeGreaterThan(0);
        expect(catToRow({ id: 'c', name: 'x'.repeat(250), createdAt: '' }, 'u').name.length).toBeLessThanOrEqual(200);
    });
});

describe('雲端寫入順序', () => {
    it('先刪除再寫入（刪掉分類又建同名時不撞唯一限制）', async () => {
        vi.resetModules();
        const calls: string[] = [];
        const chain = (table: string, op: string) => {
            const q: Record<string, unknown> = {};
            for (const m of ['eq', 'in']) q[m] = () => q;
            q.abortSignal = async () => { calls.push(`${op}:${table}`); return { error: null }; };
            return q;
        };
        vi.doMock('../../../../src/lib/supabase', () => ({
            getSupabase: async () => ({ from: (t: string) => ({ upsert: () => chain(t, 'upsert'), delete: () => chain(t, 'delete') }) }),
        }));
        const { applyChanges } = await import('../../../../src/features/favorites/cloudSync/remote');
        await applyChanges('u', data({ categories: [cat('n', 'X')] }), { favorites: [], categories: ['old'], tags: [] });
        expect(calls.indexOf('delete:user_favorite_categories')).toBeGreaterThanOrEqual(0);
        expect(calls.indexOf('delete:user_favorite_categories')).toBeLessThan(calls.indexOf('upsert:user_favorite_categories'));
        vi.doUnmock('../../../../src/lib/supabase');
    });
});

describe('換帳號：本機收藏屬於另一個帳號時先問', () => {
    beforeEach(() => { localStorage.clear(); vi.resetModules(); });
    afterEach(() => { vi.doUnmock('../../../../src/features/favorites/cloudSync/remote'); localStorage.clear(); });

    async function setup() {
        const fetchAll = vi.fn(async () => data({ favorites: [fav('cloudB')] }));
        const applyChanges = vi.fn(async () => true);
        vi.doMock('../../../../src/features/favorites/cloudSync/remote', () => ({ fetchAll, applyChanges }));
        const engine = await import('../../../../src/features/favorites/cloudSync/syncEngine');
        const { useAuthStore } = await import('../../../../src/features/auth/authStore');
        useAuthStore.setState({ status: 'authed', user: { id: 'userB', displayName: 'B', providers: [] } });
        localStorage.setItem('ms_cloud_sync_owner', 'userA');
        localStorage.setItem('favoriteStreams', JSON.stringify([fav('fromA')]));
        return { engine, applyChanges };
    }

    it('上一個同步的是別的帳號、本機有收藏時不自動合併，等使用者選', async () => {
        const { engine, applyChanges } = await setup();
        expect(await engine.syncNow()).toBe(false);
        expect(applyChanges).not.toHaveBeenCalled();
        expect(engine.useSyncStatus.getState().state).toBe('needs_choice');
    });

    it('選「改用雲端」：本機先備份，再換成雲端的收藏', async () => {
        const { engine } = await setup();
        await engine.syncNow();
        expect(await engine.resolveAccountSwitch('cloud')).toBe(true);
        expect((JSON.parse(localStorage.getItem('favoriteStreams')!) as FavoriteStream[]).map(f => f.id)).toEqual(['cloudB']);
        const backupKey = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).find(k => k.startsWith('backup_'));
        expect(backupKey && localStorage.getItem(backupKey)).toContain('fromA');
    });

    it('選「併進這個帳號」：照第一次同步聯集，之後本機算這個帳號的', async () => {
        const { engine, applyChanges } = await setup();
        await engine.syncNow();
        expect(await engine.resolveAccountSwitch('merge')).toBe(true);
        expect((JSON.parse(localStorage.getItem('favoriteStreams')!) as FavoriteStream[]).map(f => f.id).sort()).toEqual(['cloudB', 'fromA']);
        expect(applyChanges).toHaveBeenCalled();
        expect(localStorage.getItem('ms_cloud_sync_owner')).toBe('userB');
    });

    it('這台曾同步過的帳號再登入、但本機現在屬於別的帳號時也要先問（不可拿舊快照把雲端刪光）', async () => {
        const { engine, applyChanges } = await setup();
        localStorage.setItem('ms_cloud_sync:userB', JSON.stringify(data({ favorites: [fav('cloudB')] })));
        expect(await engine.syncNow()).toBe(false);
        expect(engine.useSyncStatus.getState().state).toBe('needs_choice');
        expect(applyChanges).not.toHaveBeenCalled();
        expect(await engine.resolveAccountSwitch('merge')).toBe(true);
        const [, , remove] = applyChanges.mock.calls[0] as unknown as [string, SyncData, { favorites: string[] }];
        expect(remove.favorites).toEqual([]);
    });

    it('選「改用雲端」時前一個帳號的自訂標籤也一起換掉', async () => {
        const { engine, applyChanges } = await setup();
        localStorage.setItem('preference_tags', JSON.stringify([{ id: 'tagA', name: 'A 的標籤', color: '#fff', order: 0 }]));
        await engine.syncNow();
        await engine.resolveAccountSwitch('cloud');
        const tags = JSON.parse(localStorage.getItem('preference_tags')!) as { id: string }[];
        expect(tags.map(t => t.id)).not.toContain('tagA');
        const [, upsert] = applyChanges.mock.calls[0] as unknown as [string, SyncData];
        expect(upsert.tags.map(t => t.id)).not.toContain('tagA');
    });
});
