import { describe, it, expect } from 'vitest';
import { mergeSync, type SyncData } from '../../../../src/features/favorites/cloudSync/merge';
import type { FavoriteCategory, FavoriteStream, Tag } from '../../../../src/features/favorites/types';

const fav = (id: string, over: Partial<FavoriteStream> = {}): FavoriteStream => ({
    id, url: `https://twitch.tv/${id}`, name: `name-${id}`, platform: 'twitch', channelId: id,
    videoId: null, categoryId: null, tagIds: [], addedAt: '2026-01-01T00:00:00.000Z', ...over,
});
const cat = (id: string, over: Partial<FavoriteCategory> = {}): FavoriteCategory => ({ id, name: `cat-${id}`, createdAt: '2026-01-01T00:00:00.000Z', ...over });
const tag = (id: string, over: Partial<Tag> = {}): Tag => ({ id, name: `tag-${id}`, color: '#ff0000', order: 0, ...over });
const data = (p: Partial<SyncData> = {}): SyncData => ({ favorites: [], categories: [], tags: [], ...p });
const ids = (xs: { id: string }[]) => xs.map(x => x.id).sort();

describe('mergeSync：第一次同步（無快照）', () => {
    it('S1 第一次同步只聯集不刪除', () => {
        const r = mergeSync(data({ favorites: [fav('A')] }), data({ favorites: [fav('B')] }), null);
        expect(ids(r.local.favorites)).toEqual(['A', 'B']);
        expect(ids(r.upsert.favorites)).toEqual(['A']);
        expect(r.remove).toEqual({ favorites: [], categories: [], tags: [] });
    });

    it('S1 分類與標籤同樣聯集不刪除', () => {
        const r = mergeSync(data({ categories: [cat('c1')], tags: [tag('t1')] }), data({ categories: [cat('c2')], tags: [tag('t2')] }), null);
        expect(ids(r.local.categories)).toEqual(['c1', 'c2']);
        expect(ids(r.local.tags)).toEqual(['t1', 't2']);
        expect(ids(r.upsert.categories)).toEqual(['c1']);
        expect(ids(r.upsert.tags)).toEqual(['t1']);
        expect(r.remove).toEqual({ favorites: [], categories: [], tags: [] });
    });

    it('S1 兩邊都有但內容不同取雲端，且不重複推送', () => {
        const r = mergeSync(data({ favorites: [fav('A', { name: 'local' })] }), data({ favorites: [fav('A', { name: 'cloud' })] }), null);
        expect(r.local.favorites).toHaveLength(1);
        expect(r.local.favorites[0].name).toBe('cloud');
        expect(r.upsert.favorites).toEqual([]);
    });
});

describe('mergeSync：有快照的三方合併', () => {
    it('S2 本機刪除且雲端沒改會刪雲端', () => {
        const a = fav('A');
        const r = mergeSync(data(), data({ favorites: [a] }), data({ favorites: [a] }));
        expect(r.remove.favorites).toContain('A');
        expect(ids(r.local.favorites)).not.toContain('A');
        expect(ids(r.upsert.favorites)).not.toContain('A');
    });

    it('S2 本機刪除但雲端已改過就不刪雲端', () => {
        const r = mergeSync(data(), data({ favorites: [fav('A', { name: 'cloud-new' })] }), data({ favorites: [fav('A')] }));
        expect(r.remove.favorites).not.toContain('A');
    });

    it('S2 分類與標籤的本機刪除也會刪雲端', () => {
        const r = mergeSync(data(), data({ categories: [cat('c1')], tags: [tag('t1')] }), data({ categories: [cat('c1')], tags: [tag('t1')] }));
        expect(r.remove.categories).toContain('c1');
        expect(r.remove.tags).toContain('t1');
    });

    it('S3 只有本機改則推上去並保留本機版', () => {
        const r = mergeSync(
            data({ favorites: [fav('A', { name: 'local-new' })] }),
            data({ favorites: [fav('A')] }),
            data({ favorites: [fav('A')] }),
        );
        expect(r.upsert.favorites.map(f => f.name)).toEqual(['local-new']);
        expect(r.local.favorites[0].name).toBe('local-new');
    });

    it('S3 只有雲端改則取雲端且不推送', () => {
        const r = mergeSync(
            data({ favorites: [fav('A')] }),
            data({ favorites: [fav('A', { name: 'cloud-new' })] }),
            data({ favorites: [fav('A')] }),
        );
        expect(r.local.favorites[0].name).toBe('cloud-new');
        expect(r.upsert.favorites).toEqual([]);
    });

    it('S3 兩邊都改以雲端為準', () => {
        const r = mergeSync(
            data({ favorites: [fav('A', { name: 'local-new' })] }),
            data({ favorites: [fav('A', { name: 'cloud-new' })] }),
            data({ favorites: [fav('A')] }),
        );
        expect(r.local.favorites[0].name).toBe('cloud-new');
        expect(r.upsert.favorites).toEqual([]);
    });

    it('只在本機新增的推上去、只在雲端新增的加進本機', () => {
        const r = mergeSync(
            data({ favorites: [fav('L')] }),
            data({ favorites: [fav('R')] }),
            data(),
        );
        expect(ids(r.local.favorites)).toEqual(['L', 'R']);
        expect(ids(r.upsert.favorites)).toEqual(['L']);
        expect(r.remove.favorites).toEqual([]);
    });

    it('S4 雲端刪了分類，收藏的 categoryId 歸零並重新推送', () => {
        const x = cat('X');
        const f = fav('F', { categoryId: 'X' });
        const r = mergeSync(
            data({ favorites: [f], categories: [x] }),
            data({ favorites: [f] }),
            data({ favorites: [f], categories: [x] }),
        );
        expect(r.local.categories).toEqual([]);
        expect(r.local.favorites[0].categoryId).toBeNull();
        expect(r.upsert.favorites.find(u => u.id === 'F')?.categoryId).toBeNull();
    });

    it('S4 收藏指向不存在的標籤時移除該 tagId', () => {
        const t1 = tag('t1');
        const f = fav('F', { tagIds: ['t1', 'ghost'] });
        const r = mergeSync(data({ favorites: [f], tags: [t1] }), data({ favorites: [f], tags: [t1] }), data({ favorites: [f], tags: [t1] }));
        expect(r.local.favorites[0].tagIds).toEqual(['t1']);
    });

    it('S5 雲端刪除且本機沒改就從本機移除', () => {
        const a = fav('A');
        const r = mergeSync(data({ favorites: [a, fav('B')] }), data({ favorites: [fav('B')] }), data({ favorites: [a, fav('B')] }));
        expect(ids(r.local.favorites)).toEqual(['B']);
        expect(ids(r.upsert.favorites)).not.toContain('A');
        expect(r.remove.favorites).not.toContain('A');
    });

    it('S5 雲端刪除的分類與標籤也從本機移除', () => {
        const r = mergeSync(
            data({ categories: [cat('c1')], tags: [tag('t1')] }),
            data(),
            data({ categories: [cat('c1')], tags: [tag('t1')] }),
        );
        expect(r.local.categories).toEqual([]);
        expect(r.local.tags).toEqual([]);
    });

    it('S6 取雲端版本時保留本機的開台狀態', () => {
        const r = mergeSync(
            data({ favorites: [fav('A', { isLive: true, viewerCount: 50, liveTitle: 'live now' })] }),
            data({ favorites: [fav('A', { name: 'cloud-new' })] }),
            data({ favorites: [fav('A')] }),
        );
        const a = r.local.favorites[0];
        expect(a.name).toBe('cloud-new');
        expect(a.isLive).toBe(true);
        expect(a.viewerCount).toBe(50);
        expect(a.liveTitle).toBe('live now');
    });

    it('S6 只有開台狀態不同不算改動、不推送', () => {
        const r = mergeSync(
            data({ favorites: [fav('A', { isLive: true, viewerCount: 9 })] }),
            data({ favorites: [fav('A')] }),
            data({ favorites: [fav('A')] }),
        );
        expect(r.upsert.favorites).toEqual([]);
        expect(r.local.favorites[0].isLive).toBe(true);
    });
});
