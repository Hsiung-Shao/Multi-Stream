// 收藏跨裝置雲端同步
//
// 設計原則：
// - 本地 localStorage 為 single source of truth（離線可用 / 未登入也能用）
// - 登入後雙向同步：第一次以 conflict dialog 詢問，之後 fire-and-forget push
// - 衝突解決粒度：item 級別，按 client_id 對應，updated_at 較新者勝
// - 三張表（user_favorites / user_favorite_categories / user_favorite_tags）
//   schema 已預設 client_id 對應前端本地 ID
//
// 核心 API：
//   pullFromCloud(supabase, userId)      取雲端全部資料
//   pushToCloud(supabase, userId, local) 把本地全部 upsert 到雲端
//   mergeByUpdatedAt(local, cloud)        合併兩邊（item 級 updated_at 較新者勝）
//   diffSummary(local, cloud)             統計差異（給 conflict dialog 用）

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FavoriteStream, FavoriteCategory, Tag } from './types';

// ===== Cloud row shapes（對應 DB schema）=====

interface CloudFavoriteRow {
    id: string;
    user_id: string;
    client_id: string;
    url: string;
    name: string;
    platform: string;
    channel_id: string | null;
    video_id: string | null;
    category_client_id: string | null;
    tag_client_ids: string[];
    added_at: string;
    updated_at: string;
}

interface CloudCategoryRow {
    id: string;
    user_id: string;
    client_id: string;
    name: string;
    created_at: string;
    updated_at: string;
}

interface CloudTagRow {
    id: string;
    user_id: string;
    client_id: string;
    name: string;
    color: string;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

export interface SnapshotLocal {
    favorites: FavoriteStream[];
    categories: FavoriteCategory[];
    tags: Tag[];
}

export interface DiffSummary {
    favorites: { onlyLocal: number; onlyCloud: number; conflict: number };
    categories: { onlyLocal: number; onlyCloud: number; conflict: number };
    tags: { onlyLocal: number; onlyCloud: number; conflict: number };
    total: { local: number; cloud: number };
}

// ===== Mapper：local → cloud row shape =====

function localFavoriteToCloud(f: FavoriteStream, userId: string): Omit<CloudFavoriteRow, 'id' | 'added_at' | 'updated_at'> & { added_at?: string; updated_at?: string } {
    return {
        user_id: userId,
        client_id: f.id,
        url: f.url,
        name: f.name,
        platform: f.platform,
        channel_id: f.channelId ?? null,
        video_id: f.videoId ?? null,
        category_client_id: f.categoryId ?? null,
        tag_client_ids: f.tagIds ?? [],
        added_at: f.addedAt,
    };
}

function cloudFavoriteToLocal(c: CloudFavoriteRow): FavoriteStream {
    return {
        id: c.client_id,
        url: c.url,
        name: c.name,
        platform: (c.platform as FavoriteStream['platform']) || 'other',
        channelId: c.channel_id,
        videoId: c.video_id,
        categoryId: c.category_client_id,
        tagIds: c.tag_client_ids ?? [],
        addedAt: c.added_at,
    };
}

function cloudCategoryToLocal(c: CloudCategoryRow): FavoriteCategory {
    return { id: c.client_id, name: c.name, createdAt: c.created_at };
}

function cloudTagToLocal(c: CloudTagRow): Tag {
    return { id: c.client_id, name: c.name, color: c.color, order: c.sort_order };
}

// ===== Pull: cloud → local snapshot =====

export async function pullFromCloud(supabase: SupabaseClient, userId: string): Promise<SnapshotLocal> {
    const [favRes, catRes, tagRes] = await Promise.all([
        supabase.from('user_favorites').select('*').eq('user_id', userId),
        supabase.from('user_favorite_categories').select('*').eq('user_id', userId),
        supabase.from('user_favorite_tags').select('*').eq('user_id', userId),
    ]);

    if (favRes.error) throw new Error(`pull favorites: ${favRes.error.message}`);
    if (catRes.error) throw new Error(`pull categories: ${catRes.error.message}`);
    if (tagRes.error) throw new Error(`pull tags: ${tagRes.error.message}`);

    return {
        favorites: ((favRes.data as CloudFavoriteRow[]) ?? []).map(cloudFavoriteToLocal),
        categories: ((catRes.data as CloudCategoryRow[]) ?? []).map(cloudCategoryToLocal),
        tags: ((tagRes.data as CloudTagRow[]) ?? []).map(cloudTagToLocal),
    };
}

// ===== Push: local snapshot → cloud（upsert by user_id + client_id） =====

export async function pushToCloud(
    supabase: SupabaseClient,
    userId: string,
    local: SnapshotLocal,
): Promise<void> {
    const favRows = local.favorites.map(f => localFavoriteToCloud(f, userId));
    const catRows = local.categories.map(c => ({
        user_id: userId,
        client_id: c.id,
        name: c.name,
        created_at: c.createdAt,
    }));
    const tagRows = local.tags.map(t => ({
        user_id: userId,
        client_id: t.id,
        name: t.name,
        color: t.color,
        sort_order: t.order,
    }));

    // 用 onConflict 指定 user_id + client_id 為 unique key 做 upsert
    // 雲端 schema 必須有 UNIQUE(user_id, client_id) constraint 才能正確 upsert
    // 若 schema 沒設 unique，這裡會失敗，需先補 migration
    const operations = [];
    if (catRows.length) {
        operations.push(
            supabase.from('user_favorite_categories').upsert(catRows, { onConflict: 'user_id,client_id' }),
        );
    }
    if (tagRows.length) {
        operations.push(
            supabase.from('user_favorite_tags').upsert(tagRows, { onConflict: 'user_id,client_id' }),
        );
    }
    if (favRows.length) {
        operations.push(
            supabase.from('user_favorites').upsert(favRows, { onConflict: 'user_id,client_id' }),
        );
    }

    const results = await Promise.all(operations);
    for (const r of results) {
        if (r.error) throw new Error(`push: ${r.error.message}`);
    }
}

// ===== 替換式 push：用 cloud 完全覆蓋（保留雲端 / 保留本地策略用）=====

export async function replaceCloud(
    supabase: SupabaseClient,
    userId: string,
    local: SnapshotLocal,
): Promise<void> {
    // 先刪雲端所有 row（依該 user）
    const deleteResults = await Promise.all([
        supabase.from('user_favorites').delete().eq('user_id', userId),
        supabase.from('user_favorite_categories').delete().eq('user_id', userId),
        supabase.from('user_favorite_tags').delete().eq('user_id', userId),
    ]);
    for (const r of deleteResults) {
        if (r.error) throw new Error(`replace delete: ${r.error.message}`);
    }
    // 再 push 全部
    await pushToCloud(supabase, userId, local);
}

// ===== 合併演算法：item 級別 updated_at 較新者勝 =====
//
// 注意：FavoriteStream / Category / Tag 在 local 沒有 updated_at 欄位（只有 addedAt / createdAt）。
// 因此合併粒度退化為「ID 取聯集，相同 client_id 的內容以 cloud 為準」。
// 若 local 對某個 client_id 有變更但雲端沒同步，這個演算法會**保留雲端版本**，user 變更會遺失。
// 完整 updated_at 追蹤需要本地 schema 改造，本次先做基礎版。

export function mergeByUpdatedAt(local: SnapshotLocal, cloud: SnapshotLocal): SnapshotLocal {
    return {
        favorites: mergeList(local.favorites, cloud.favorites, (x) => x.id),
        categories: mergeList(local.categories, cloud.categories, (x) => x.id),
        tags: mergeList(local.tags, cloud.tags, (x) => x.id),
    };
}

function mergeList<T>(local: T[], cloud: T[], keyOf: (x: T) => string): T[] {
    const map = new Map<string, T>();
    // 先放 local
    for (const item of local) map.set(keyOf(item), item);
    // 再放 cloud — 同 key 覆蓋，未 conflict 則新增
    for (const item of cloud) map.set(keyOf(item), item);
    return Array.from(map.values());
}

// ===== Diff 統計（給 conflict dialog UI 顯示用） =====

export function diffSummary(local: SnapshotLocal, cloud: SnapshotLocal): DiffSummary {
    return {
        favorites: diffByKey(local.favorites, cloud.favorites, (x) => x.id),
        categories: diffByKey(local.categories, cloud.categories, (x) => x.id),
        tags: diffByKey(local.tags, cloud.tags, (x) => x.id),
        total: {
            local: local.favorites.length + local.categories.length + local.tags.length,
            cloud: cloud.favorites.length + cloud.categories.length + cloud.tags.length,
        },
    };
}

function diffByKey<T>(local: T[], cloud: T[], keyOf: (x: T) => string) {
    const localKeys = new Set(local.map(keyOf));
    const cloudKeys = new Set(cloud.map(keyOf));
    let onlyLocal = 0;
    let onlyCloud = 0;
    let conflict = 0;
    for (const k of localKeys) {
        if (cloudKeys.has(k)) conflict++;
        else onlyLocal++;
    }
    for (const k of cloudKeys) {
        if (!localKeys.has(k)) onlyCloud++;
    }
    return { onlyLocal, onlyCloud, conflict };
}

// ===== 同步狀態紀錄 =====

const LAST_SYNC_KEY = 'cloud_sync_last_at';

export function getLastSyncAt(): string | null {
    try {
        return localStorage.getItem(LAST_SYNC_KEY);
    } catch {
        return null;
    }
}

export function setLastSyncAt(iso: string): void {
    try {
        localStorage.setItem(LAST_SYNC_KEY, iso);
    } catch { /* quota exceeded etc — silent */ }
}

export function clearLastSyncAt(): void {
    try {
        localStorage.removeItem(LAST_SYNC_KEY);
    } catch { /* silent */ }
}
