/** 本機收藏資料 ⇄ 雲端資料表列（只含同步欄位；開台狀態只留本機） */
import type { FavoriteCategory, FavoriteStream, Tag } from '../types';

export interface FavoriteRow { user_id: string; client_id: string; url: string; name: string; platform: string; channel_id: string | null; video_id: string | null; category_client_id: string | null; tag_client_ids: string[]; added_at: string }
export interface CategoryRow { user_id: string; client_id: string; name: string; created_at: string }
export interface TagRow { user_id: string; client_id: string; name: string; color: string; sort_order: number }

const PLATFORMS = ['twitch', 'youtube', 'other'] as const;
const clampOrder = (n: unknown) => Math.min(9999, Math.max(0, Math.trunc(Number(n) || 0)));

export const favToRow = (f: FavoriteStream, userId: string): FavoriteRow => ({
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
});

export const rowToFav = (r: FavoriteRow): FavoriteStream => ({
    id: r.client_id,
    url: r.url,
    name: r.name,
    platform: (PLATFORMS as readonly string[]).includes(r.platform) ? (r.platform as FavoriteStream['platform']) : 'other',
    channelId: r.channel_id,
    videoId: r.video_id,
    categoryId: r.category_client_id,
    tagIds: Array.isArray(r.tag_client_ids) ? r.tag_client_ids : [],
    addedAt: r.added_at,
});

export const catToRow = (c: FavoriteCategory, userId: string): CategoryRow => ({ user_id: userId, client_id: c.id, name: c.name, created_at: c.createdAt });
export const rowToCat = (r: CategoryRow): FavoriteCategory => ({ id: r.client_id, name: r.name, createdAt: r.created_at });

export const tagToRow = (t: Tag, userId: string): TagRow => ({ user_id: userId, client_id: t.id, name: t.name, color: t.color, sort_order: clampOrder(t.order) });
export const rowToTag = (r: TagRow): Tag => ({ id: r.client_id, name: r.name, color: r.color, order: clampOrder(r.sort_order) });
