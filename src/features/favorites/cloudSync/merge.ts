/**
 * 收藏三方合併（純函式）：本機、雲端、上次同步快照。
 * 本機資料沒有修改時間，所以靠快照判斷「誰改過、誰刪了」：
 * 只有一邊改就取那邊；雲端有改一律取雲端（本機改動 3 秒內就會推上去，兩邊同時改很少見）。
 * 第一次同步（沒有快照）只聯集、不刪任何東西。
 */
import type { FavoriteCategory, FavoriteStream, Tag } from '../types';

export interface SyncData { favorites: FavoriteStream[]; categories: FavoriteCategory[]; tags: Tag[] }
export interface MergeResult {
    local: SyncData;
    upsert: SyncData;
    remove: { favorites: string[]; categories: string[]; tags: string[] };
}

const favKey = (f: FavoriteStream) => JSON.stringify([f.id, f.url, f.name, f.platform, f.channelId ?? null, f.videoId ?? null, f.categoryId ?? null, f.tagIds ?? [], f.addedAt]);
const catKey = (c: FavoriteCategory) => JSON.stringify([c.id, c.name, c.createdAt]);
const tagKey = (t: Tag) => JSON.stringify([t.id, t.name, t.color, t.order]);

interface Part<T> { local: T[]; upsert: T[]; remove: string[] }

function merge3<T extends { id: string }>(
    local: T[], remote: T[], snapshot: T[] | null, key: (x: T) => string, fromRemote: (r: T, l: T | undefined) => T,
): Part<T> {
    const L = new Map(local.map(x => [x.id, x]));
    const R = new Map(remote.map(x => [x.id, x]));
    const S = snapshot ? new Map(snapshot.map(x => [x.id, x])) : null;
    const out: Part<T> = { local: [], upsert: [], remove: [] };
    const same = (a: T | undefined, b: T | undefined) => !!a && !!b && key(a) === key(b);
    // 順序：本機原有順序在前，雲端新增的接在後面
    const ids = [...new Set([...L.keys(), ...R.keys(), ...(S ? S.keys() : [])])];
    for (const id of ids) {
        const l = L.get(id), r = R.get(id), s = S?.get(id);
        if (!S || !s) {
            // 第一次同步，或快照之後才出現：不刪，兩邊都有取雲端
            if (r) out.local.push(fromRemote(r, l));
            else if (l) { out.local.push(l); out.upsert.push(l); }
            continue;
        }
        if (!l && !r) continue;
        if (!l) {
            // 本機刪了：雲端沒改就刪雲端；雲端改過就留雲端版本
            if (same(r, s)) out.remove.push(id); else out.local.push(fromRemote(r!, undefined));
            continue;
        }
        if (!r) {
            // 雲端刪了：本機沒改就跟著刪；本機改過就推回去
            if (!same(l, s)) { out.local.push(l); out.upsert.push(l); }
            continue;
        }
        if (!same(r, s)) out.local.push(fromRemote(r, l));
        else { out.local.push(l); if (!same(l, s)) out.upsert.push(l); }
    }
    return out;
}

// 取雲端版本時，保留本機的開台狀態等非同步欄位
const keepLocalExtras = <T extends object>(r: T, l: T | undefined): T => (l ? { ...l, ...r } : r);

export function mergeSync(local: SyncData, remote: SyncData, snapshot: SyncData | null): MergeResult {
    const cats = merge3(local.categories, remote.categories, snapshot?.categories ?? null, catKey, keepLocalExtras);
    const tags = merge3(local.tags, remote.tags, snapshot?.tags ?? null, tagKey, keepLocalExtras);
    const favs = merge3(local.favorites, remote.favorites, snapshot?.favorites ?? null, favKey, keepLocalExtras);

    // 參照清理：分類被刪→收藏歸類為無；標籤被刪→從收藏拿掉。有變的收藏要推上去
    const catIds = new Set(cats.local.map(c => c.id));
    const tagIds = new Set(tags.local.map(t => t.id));
    const upsertIds = new Set(favs.upsert.map(f => f.id));
    favs.local = favs.local.map(f => {
        const categoryId = f.categoryId && !catIds.has(f.categoryId) ? null : f.categoryId;
        const nextTags = f.tagIds?.filter(id => tagIds.has(id));
        if (categoryId === f.categoryId && (nextTags?.length ?? 0) === (f.tagIds?.length ?? 0)) return f;
        const fixed = { ...f, categoryId, ...(f.tagIds ? { tagIds: nextTags } : {}) };
        if (!upsertIds.has(f.id)) upsertIds.add(f.id);
        favs.upsert = [...favs.upsert.filter(u => u.id !== f.id), fixed];
        return fixed;
    });

    return {
        local: { favorites: favs.local, categories: cats.local, tags: tags.local },
        upsert: { favorites: favs.upsert, categories: cats.upsert, tags: tags.upsert },
        remove: { favorites: favs.remove, categories: cats.remove, tags: tags.remove },
    };
}
