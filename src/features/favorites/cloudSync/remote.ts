/** 雲端收藏的讀寫（Supabase；RLS 限制只能碰自己的列） */
import { getSupabase } from '../../../lib/supabase';
import type { SyncData } from './merge';
import { favToRow, rowToFav, catToRow, rowToCat, tagToRow, rowToTag, type FavoriteRow, type CategoryRow, type TagRow } from './wire';

const TIMEOUT_MS = 15_000;
const CHUNK = 500;

const FAV_COLS = 'client_id,url,name,platform,channel_id,video_id,category_client_id,tag_client_ids,added_at';
const CAT_COLS = 'client_id,name,created_at';
const TAG_COLS = 'client_id,name,color,sort_order';

const timeout = () => AbortSignal.timeout(TIMEOUT_MS);
const chunks = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK));

export async function fetchAll(userId: string): Promise<SyncData | null> {
    const sb = await getSupabase();
    if (!sb) return null;
    try {
        const [f, c, t] = await Promise.all([
            sb.from('user_favorites').select(FAV_COLS).eq('user_id', userId).abortSignal(timeout()),
            sb.from('user_favorite_categories').select(CAT_COLS).eq('user_id', userId).abortSignal(timeout()),
            sb.from('user_favorite_tags').select(TAG_COLS).eq('user_id', userId).abortSignal(timeout()),
        ]);
        if (f.error || c.error || t.error) return null;
        return {
            favorites: (f.data as unknown as FavoriteRow[]).map(rowToFav),
            categories: (c.data as unknown as CategoryRow[]).map(rowToCat),
            tags: (t.data as unknown as TagRow[]).map(rowToTag),
        };
    } catch {
        return null;
    }
}

/** 先寫分類與標籤（收藏會參照它們），再寫收藏；刪除反過來先刪收藏 */
export async function applyChanges(
    userId: string,
    upsert: SyncData,
    remove: { favorites: string[]; categories: string[]; tags: string[] },
): Promise<boolean> {
    const sb = await getSupabase();
    if (!sb) return false;
    const up = async (table: string, rows: object[]) => {
        for (const part of chunks(rows)) {
            const { error } = await sb.from(table).upsert(part, { onConflict: 'user_id,client_id' }).abortSignal(timeout());
            if (error) return false;
        }
        return true;
    };
    const del = async (table: string, ids: string[]) => {
        for (const part of chunks(ids)) {
            const { error } = await sb.from(table).delete().eq('user_id', userId).in('client_id', part).abortSignal(timeout());
            if (error) return false;
        }
        return true;
    };
    try {
        return await up('user_favorite_categories', upsert.categories.map(c => catToRow(c, userId)))
            && await up('user_favorite_tags', upsert.tags.map(t => tagToRow(t, userId)))
            && await up('user_favorites', upsert.favorites.map(f => favToRow(f, userId)))
            && await del('user_favorites', remove.favorites)
            && await del('user_favorite_categories', remove.categories)
            && await del('user_favorite_tags', remove.tags);
    } catch {
        return false;
    }
}
