/**
 * 歌曲整理（songs 本體）後台 hooks — 對應 functions/api/admin/song-library.js
 *
 * - 回應格式：成功 { ok: true, data }，失敗 { ok: false, error }（apiFetch 會把失敗轉成 ApiError）。
 * - 合併／拆開／改名會改變片段歸屬，成功後整批作廢歌曲整理的查詢（搜尋、疑似重複、明細、配對預覽）。
 * - 配對預覽（match）是只讀 RPC：編輯器 debounce 後才呼叫，失敗就不顯示標籤，不重試。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from './useAdminAnnouncements';
import { formatSongError, noRetryOn401 } from './useAdminSongs';
import type { SegmentMatch, SongBrief } from '../../songs/components/SegmentEditor';

export const SONG_LIBRARY_KEY = 'admin-song-library';
const ENDPOINT = '/api/admin/song-library';

export type { SongBrief };

export interface SongDuplicateGroup {
    title_key: string;
    songs: SongBrief[];
}

export interface SongVersionRecord {
    segment_id: string;
    code: string;
    title: string;
    original_artist: string | null;
    version_note: string | null;
    start_seconds: number;
    end_seconds: number;
    video: { id: string; video_id: string; title: string; streamed_at: string | null; status: string };
    vtuber: { id: string; name: string } | null;
}

export interface SongDetail {
    song: { id: number; title: string; artist: string | null; created_at: string; updated_at: string };
    keys: { title_key: string; artist_key: string }[];
    versions: SongVersionRecord[];
}

export interface SongMatchItem {
    segment_id?: string;
    title: string;
    original_artist: string | null;
}

export interface SongMatchResult {
    status: 'existing' | 'new' | 'similar';
    song_id: number | null;
    song: SongBrief | null;
    similar: SongBrief[];
}

// 對齊 song-library.js 的 ERROR_STATUS；其餘交給 formatSongError
const LIBRARY_ERRORS: Record<string, string> = {
    key_taken: '這個名稱已屬於另一首歌，請改用合併',
    already_single: '這首歌只剩一個版本，不需要拆開',
    same_song: '不能合併到同一首歌',
    artist_mismatch: '兩首歌的原唱不同，請勾選確認後再合併',
    song_not_found: '找不到這首歌（可能已被合併），請重新搜尋',
    segment_not_found: '找不到這個版本（可能已被刪除），請重新整理',
    invalid_title: '歌名要 1～200 字',
    invalid_query: '搜尋字串最多 200 字',
    library_failed: '歌曲整理失敗，請稍後再試',
};

export function formatLibraryError(err: unknown): string {
    const code = err instanceof ApiError ? err.payload?.error : undefined;
    if (typeof code === 'string' && LIBRARY_ERRORS[code]) return LIBRARY_ERRORS[code];
    return formatSongError(err);
}

/** RPC 結果 → 編輯器的配對標籤 */
export function toSegmentMatch(r: SongMatchResult): SegmentMatch {
    if (r.status === 'existing' && r.song) return { status: 'existing', song: r.song };
    if (r.status === 'similar' && r.similar.length > 0) return { status: 'similar', similar: r.similar };
    return { status: 'new' };
}

/** 搜尋歌名／原唱；query 為 null 時不查 */
export function useSongSearch(query: string | null) {
    return useQuery({
        queryKey: [SONG_LIBRARY_KEY, 'search', query],
        enabled: query !== null,
        queryFn: async (): Promise<SongBrief[]> => {
            const data = await apiFetch<{ ok: true; data: SongBrief[] }>(`${ENDPOINT}?q=${encodeURIComponent(query ?? '')}`);
            return data.data ?? [];
        },
        staleTime: 30_000,
        retry: noRetryOn401,
    });
}

/** 疑似重複（同名鍵分屬不同歌） */
export function useSongDuplicates(enabled: boolean) {
    return useQuery({
        queryKey: [SONG_LIBRARY_KEY, 'duplicates'],
        enabled,
        queryFn: async (): Promise<SongDuplicateGroup[]> => {
            const data = await apiFetch<{ ok: true; data: SongDuplicateGroup[] }>(`${ENDPOINT}?view=duplicates`);
            return data.data ?? [];
        },
        staleTime: 30_000,
        retry: noRetryOn401,
    });
}

export function useSongDetail(id: number | null) {
    return useQuery({
        queryKey: [SONG_LIBRARY_KEY, 'detail', id],
        enabled: id !== null,
        queryFn: async (): Promise<SongDetail> => {
            const data = await apiFetch<{ ok: true; data: SongDetail }>(`${ENDPOINT}?id=${encodeURIComponent(String(id))}`);
            return data.data;
        },
        staleTime: 0,
        retry: noRetryOn401,
    });
}

function useLibraryMutation<TInput>(action: 'merge' | 'split' | 'rename') {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: TInput) => {
            const data = await apiFetch<{ ok: true; data: unknown }>(`${ENDPOINT}?action=${action}`, {
                method: 'POST',
                body: JSON.stringify(input),
            });
            return data.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: [SONG_LIBRARY_KEY] });
        },
    });
}

export const useMergeSongs = () => useLibraryMutation<{ source: number; target: number; allow_artist_mismatch: boolean }>('merge');
export const useSplitSegment = () => useLibraryMutation<{ segment_id: string }>('split');
export const useRenameSong = () => useLibraryMutation<{ id: number; title: string; artist: string | null }>('rename');

/** 配對預覽：items 為 null 或空陣列時不查；key 用 items 的 JSON（內容沒變不重查） */
export function useSongMatch(items: SongMatchItem[] | null) {
    const json = items ? JSON.stringify(items) : null;
    return useQuery({
        queryKey: [SONG_LIBRARY_KEY, 'match', json],
        enabled: !!items && items.length > 0,
        queryFn: async (): Promise<SongMatchResult[]> => {
            const data = await apiFetch<{ ok: true; data: SongMatchResult[] }>(`${ENDPOINT}?action=match`, {
                method: 'POST',
                body: JSON.stringify({ items: items ?? [] }),
            });
            return Array.isArray(data.data) ? data.data : [];
        },
        staleTime: 30_000,
        retry: false,
    });
}
