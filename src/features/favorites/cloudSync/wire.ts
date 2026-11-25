/** 本機收藏資料 ⇄ 雲端資料表列（只含同步欄位；開台狀態只留本機） */
import type { FavoriteCategory, FavoriteStream, Tag } from '../types';

export interface FavoriteRow { user_id: string; client_id: string; url: string; name: string; platform: string; channel_id: string | null; video_id: string | null; category_client_id: string | null; tag_client_ids: string[]; added_at: string }
export interface CategoryRow { user_id: string; client_id: string; name: string; created_at: string }
export interface TagRow { user_id: string; client_id: string; name: string; color: string; sort_order: number }

const PLATFORMS = ['twitch', 'youtube', 'other'] as const;
const clampOrder = (n: unknown) => Math.min(9999, Math.max(0, Math.trunc(Number(n) || 0)));
/** 時間一律轉成 toISOString 格式：雲端回 +00:00、本機存 Z，不統一的話同一筆永遠比對不相等 */
const iso = (v: unknown) => { const t = Date.parse(String(v ?? '')); return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString(); };
/** 文字欄位截到雲端 CHECK 的長度；空白就用備用值（任何一列不合規都會讓整批寫入失敗） */
const text = (v: unknown, max: number, fallback: string) => (String(v ?? '').trim() || fallback).slice(0, max);

export const favToRow = (f: FavoriteStream, userId: string): FavoriteRow => ({
    user_id: userId,
    client_id: f.id,
    url: text(f.url, 2048, f.id),
    name: text(f.name, 300, f.channelId || f.videoId || f.url || f.id),
    platform: (PLATFORMS as readonly string[]).includes(f.platform) ? f.platform : 'other',
    channel_id: f.channelId ? f.channelId.slice(0, 128) : null,
    video_id: f.videoId ? f.videoId.slice(0, 128) : null,
    category_client_id: f.categoryId ? f.categoryId.slice(0, 128) : null,
    tag_client_ids: (f.tagIds ?? []).slice(0, 50),
    added_at: iso(f.addedAt),
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
    addedAt: iso(r.added_at),
});

export const catToRow = (c: FavoriteCategory, userId: string): CategoryRow => ({ user_id: userId, client_id: c.id, name: text(c.name, 200, c.id), created_at: iso(c.createdAt) });
export const rowToCat = (r: CategoryRow): FavoriteCategory => ({ id: r.client_id, name: r.name, createdAt: iso(r.created_at) });

export const tagToRow = (t: Tag, userId: string): TagRow => ({ user_id: userId, client_id: t.id, name: text(t.name, 100, t.id), color: text(t.color, 32, '#888888'), sort_order: clampOrder(t.order) });
export const rowToTag = (r: TagRow): Tag => ({ id: r.client_id, name: r.name, color: r.color, order: clampOrder(r.sort_order) });
