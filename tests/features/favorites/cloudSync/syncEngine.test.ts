import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FavoriteStream } from '../../../../src/features/favorites/types';
import type { SyncData } from '../../../../src/features/favorites/cloudSync/merge';

vi.mock('../../../../src/features/favorites/cloudSync/remote', () => ({
    fetchAll: vi.fn(),
    applyChanges: vi.fn(),
}));

import { fetchAll, applyChanges } from '../../../../src/features/favorites/cloudSync/remote';
import { syncNow, notifyLocalChange } from '../../../../src/features/favorites/cloudSync/syncEngine';
import { useAuthStore } from '../../../../src/features/auth/authStore';

const fav = (id: string, over: Partial<FavoriteStream> = {}): FavoriteStream => ({
    id, url: `https://twitch.tv/${id}`, name: `name-${id}`, platform: 'twitch', channelId: id,
    videoId: null, categoryId: null, tagIds: [], addedAt: '2026-01-01T00:00:00.000Z', ...over,
});
const empty: SyncData = { favorites: [], categories: [], tags: [] };
const SNAP = 'ms_cloud_sync:u1';

const login = () => useAuthStore.setState({ status: 'authed', user: { id: 'u1', displayName: 'U', providers: [] } });
const setLocal = (d: SyncData) => {
    localStorage.setItem('favoriteStreams', JSON.stringify(d.favorites));
    localStorage.setItem('favoriteCategories', JSON.stringify(d.categories));
    localStorage.setItem('preference_tags', JSON.stringify(d.tags));
};
const readIds = (key: string) => (JSON.parse(localStorage.getItem(key) ?? '[]') as { id: string }[]).map(x => x.id).sort();

beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchAll).mockReset();
    vi.mocked(applyChanges).mockReset();
    vi.mocked(applyChanges).mockResolvedValue(true);
});
afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    useAuthStore.setState({ status: 'anon', user: null });
    localStorage.clear();
});

describe('syncEngine', () => {
    it('E1 登入後同步寫回本機並存快照', async () => {
        login();
        setLocal({ ...empty, favorites: [fav('A')] });
        vi.mocked(fetchAll).mockResolvedValue({ ...empty, favorites: [fav('B')] });

        expect(await syncNow()).toBe(true);

        expect(readIds('favoriteStreams')).toEqual(['A', 'B']);
        expect(localStorage.getItem('favoriteCategories')).not.toBeNull();
        expect(localStorage.getItem('preference_tags')).not.toBeNull();
        const snap = localStorage.getItem(SNAP);
        expect(snap).not.toBeNull();
        expect(snap).toContain('"A"');
        expect(snap).toContain('"B"');
        expect(applyChanges).toHaveBeenCalledTimes(1);
        const [uid, upsert, remove] = vi.mocked(applyChanges).mock.calls[0];
        expect(uid).toBe('u1');
        expect(upsert.favorites.map(f => f.id)).toEqual(['A']);
        expect(remove).toEqual({ favorites: [], categories: [], tags: [] });
    });

    it('E1 未登入不同步也不碰雲端', async () => {
        useAuthStore.setState({ status: 'anon', user: null });
        setLocal({ ...empty, favorites: [fav('A')] });
        await syncNow();
        expect(fetchAll).not.toHaveBeenCalled();
        expect(applyChanges).not.toHaveBeenCalled();
        expect(localStorage.getItem(SNAP)).toBeNull();
    });

    it('E1 讀不到雲端資料時不動本機也不推送', async () => {
        login();
        setLocal({ ...empty, favorites: [fav('A')] });
        vi.mocked(fetchAll).mockResolvedValue(null);
        expect(await syncNow()).toBe(false);
        expect(readIds('favoriteStreams')).toEqual(['A']);
        expect(applyChanges).not.toHaveBeenCalled();
        expect(localStorage.getItem(SNAP)).toBeNull();
    });

    it('E2 本機變動只推差異不拉雲端', async () => {
        login();
        const snapshot: SyncData = { ...empty, favorites: [fav('A')] };
        localStorage.setItem(SNAP, JSON.stringify(snapshot));
        setLocal({ ...empty, favorites: [fav('A'), fav('N')] });
        vi.useFakeTimers();

        notifyLocalChange();
        await vi.advanceTimersByTimeAsync(2900);
        expect(applyChanges).not.toHaveBeenCalled(); // 去抖未到

        await vi.advanceTimersByTimeAsync(200);
        expect(applyChanges).toHaveBeenCalledTimes(1);
        expect(fetchAll).not.toHaveBeenCalled();
        const [uid, upsert, remove] = vi.mocked(applyChanges).mock.calls[0];
        expect(uid).toBe('u1');
        expect(upsert.favorites.map(f => f.id)).toEqual(['N']);
        expect(remove.favorites).toEqual([]);
    });

    it('E2 連續多次變動只推一次', async () => {
        login();
        localStorage.setItem(SNAP, JSON.stringify(empty));
        setLocal({ ...empty, favorites: [fav('N')] });
        vi.useFakeTimers();

        notifyLocalChange();
        await vi.advanceTimersByTimeAsync(1000);
        notifyLocalChange();
        await vi.advanceTimersByTimeAsync(1000);
        notifyLocalChange();
        await vi.advanceTimersByTimeAsync(3100);

        expect(applyChanges).toHaveBeenCalledTimes(1);
    });

    it('E2 本機刪除會推刪除清單', async () => {
        login();
        localStorage.setItem(SNAP, JSON.stringify({ ...empty, favorites: [fav('A')] }));
        setLocal(empty);
        vi.useFakeTimers();

        notifyLocalChange();
        await vi.advanceTimersByTimeAsync(3100);

        expect(vi.mocked(applyChanges).mock.calls[0]?.[2].favorites).toEqual(['A']);
    });

    it('E3 推送失敗不更新快照', async () => {
        login();
        const old = JSON.stringify({ ...empty, favorites: [fav('A')] });
        localStorage.setItem(SNAP, old);
        setLocal({ ...empty, favorites: [fav('A')] });
        vi.mocked(fetchAll).mockResolvedValue({ ...empty, favorites: [fav('A'), fav('B')] });
        vi.mocked(applyChanges).mockResolvedValue(false);

        await syncNow();

        expect(applyChanges).toHaveBeenCalled();
        expect(localStorage.getItem(SNAP)).toBe(old);
    });

    it('E3 第一次同步推送失敗也不留快照', async () => {
        login();
        setLocal({ ...empty, favorites: [fav('A')] });
        vi.mocked(fetchAll).mockResolvedValue(empty);
        vi.mocked(applyChanges).mockResolvedValue(false);

        await syncNow();

        expect(localStorage.getItem(SNAP)).toBeNull();
    });
});
