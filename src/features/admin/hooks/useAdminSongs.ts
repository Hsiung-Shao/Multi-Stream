/**
 * 歌回（song_videos＋song_segments）後台 hooks — 對應 functions/api/admin/songs.js
 *
 * 與公告分頁共用 apiFetch（X-Admin-Token、15 秒逾時）。公開目錄 /api/songs/catalog 有 10 分鐘 edge 快取，
 * 發布後最晚約 10 分鐘才出現在 /songs。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError, formatAdminAnnouncementError } from './useAdminAnnouncements';
import type { SegmentIssueCode } from '../../songs/lib/segmentValidation';
import { resolveRestConfig, restGet } from '../../schedule/restClient';

export const SONG_VIDEOS_KEY = 'admin-song-videos';
const SONG_VIDEO_KEY = 'admin-song-video';

export type SongVideoStatus = 'draft' | 'published';

export interface SongVideoRecord {
    id: string;
    video_id: string;
    vtuber_id: string | null;
    title: string;
    streamed_at: string | null;
    duration_seconds: number | null;
    status: SongVideoStatus;
    created_at: string;
    updated_at: string;
}

export interface SongVideoListItem extends SongVideoRecord {
    segment_count: number;
}

export interface SongSegmentRecord {
    id: string;
    code: string;
    video_ref: string;
    start_seconds: number;
    end_seconds: number;
    title: string;
    original_artist: string | null;
    position: number;
}

export interface SongSegmentInput {
    id?: string;
    start_seconds: number;
    end_seconds: number | null;
    title: string;
    original_artist: string | null;
}

export interface SongVideoWriteInput {
    video_id: string;
    title: string;
    vtuber_id: string | null;
    streamed_at: string | null;
    duration_seconds: number | null;
    status: SongVideoStatus;
    segments: SongSegmentInput[];
}

export interface SongVideoDetail {
    video: SongVideoRecord;
    segments: SongSegmentRecord[];
}

export const SONG_STATUS_LABEL: Record<SongVideoStatus, string> = {
    draft: '草稿',
    published: '已發布',
};

export const SEGMENT_ISSUE_LABEL: Record<SegmentIssueCode, string> = {
    missing_end: '缺結束時間',
    end_before_start: '結束要晚於開始',
    overlap: '與其他片段重疊',
    exceeds_duration: '超過影片長度',
    empty_title: '請填歌名',
    title_too_long: '歌名最多 200 字',
    artist_too_long: '原唱最多 200 字',
};

// 對齊 functions/api/admin/songs.js 與 functions/lib/songs.js 會回的錯誤碼；
// 共通錯誤（id_required、not_found、create_failed…）由 formatAdminAnnouncementError 處理
const SONG_ERRORS: Record<string, string> = {
    invalid_video_id: 'YouTube 影片 ID 格式錯誤',
    invalid_segments: '片段有錯誤，請看表格中標紅的列',
    invalid_payload: '欄位格式錯誤（標題 1～200 字、時間要是整數秒）',
    video_exists: '這支影片已經建立過了，請改用編輯',
    video_not_found: '找不到這支歌回（可能已被刪除），請返回列表重新整理',
    unknown_segment_id: '片段資料已過期，請重新載入這支歌回再編輯',
};

export function formatSongError(err: unknown): string {
    const code = err instanceof ApiError ? err.payload?.error : undefined;
    if (typeof code === 'string' && SONG_ERRORS[code]) return SONG_ERRORS[code];
    return formatAdminAnnouncementError(err);
}

/** 400 invalid_segments 時伺服器回的逐列問題（index 為送出時的片段順序） */
export function segmentIssuesFromError(err: unknown): { index: number; code: SegmentIssueCode }[] {
    if (!(err instanceof ApiError)) return [];
    const issues: unknown = err.payload?.issues;
    if (!Array.isArray(issues)) return [];
    return issues.filter(
        (i): i is { index: number; code: SegmentIssueCode } =>
            !!i && typeof i.index === 'number' && typeof i.code === 'string' && i.code in SEGMENT_ISSUE_LABEL,
    );
}

const noRetryOn401 = (count: number, err: unknown) => !(err instanceof ApiError && err.status === 401) && count < 3;

export function useAdminSongVideos() {
    return useQuery({
        queryKey: [SONG_VIDEOS_KEY],
        queryFn: async (): Promise<SongVideoListItem[]> => {
            const data = await apiFetch<{ ok: true; videos: SongVideoListItem[] }>('/api/admin/songs');
            return data.videos ?? [];
        },
        staleTime: 30_000,
        retry: noRetryOn401,
    });
}

export function useAdminSongVideo(id: string | null) {
    return useQuery({
        queryKey: [SONG_VIDEO_KEY, id],
        enabled: !!id,
        queryFn: async (): Promise<SongVideoDetail> => {
            const data = await apiFetch<{ ok: true } & SongVideoDetail>(`/api/admin/songs?id=${encodeURIComponent(id!)}`);
            return { video: data.video, segments: data.segments ?? [] };
        },
        staleTime: 0,
        retry: noRetryOn401,
    });
}

/** 新增（id 為 null）或更新；成功回傳伺服器上的最新影片與片段（含 code） */
export function useSaveSongVideo() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, input }: { id: string | null; input: SongVideoWriteInput }): Promise<SongVideoDetail> => {
            const data = await apiFetch<{ ok: true } & SongVideoDetail>(
                id ? `/api/admin/songs?id=${encodeURIComponent(id)}` : '/api/admin/songs',
                { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) },
            );
            return { video: data.video, segments: data.segments ?? [] };
        },
        onSuccess: (detail) => {
            qc.invalidateQueries({ queryKey: [SONG_VIDEOS_KEY] });
            qc.setQueryData([SONG_VIDEO_KEY, detail.video.id], detail);
        },
    });
}

export function useDeleteSongVideo() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await apiFetch<{ ok: true }>(`/api/admin/songs?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        },
        onSuccess: (_d, id) => {
            qc.invalidateQueries({ queryKey: [SONG_VIDEOS_KEY] });
            qc.removeQueries({ queryKey: [SONG_VIDEO_KEY, id] });
        },
    });
}

// ---------- VTuber 查詢（vtubers 公開可讀；沿用週表的 anon PostgREST 連線，不載 supabase-js） ----------

export interface VtuberOption {
    id: string;
    name: string;
    img_url: string | null;
}

const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const VTUBER_COLS = 'id,name,img_url';

/** 依名稱模糊搜尋（PostgREST 的萬用字元與分隔符先拿掉，避免使用者輸入改到查詢語法） */
export async function searchVtubers(query: string, signal?: AbortSignal): Promise<VtuberOption[]> {
    const q = query.replace(/[*%,()"\\]/g, ' ').trim();
    if (!q) return [];
    const cfg = await resolveRestConfig({ signal });
    return restGet<VtuberOption[]>(cfg, `vtubers?select=${VTUBER_COLS}&name=ilike.*${encodeURIComponent(q)}*&order=name.asc&limit=8`, { signal });
}

/** 依 id 批次取名稱（列表與編輯器顯示用）；不合法的 id 略過 */
export async function fetchVtubersByIds(ids: string[], signal?: AbortSignal): Promise<VtuberOption[]> {
    const valid = [...new Set(ids.filter((id) => UUID_RE.test(id)))];
    if (valid.length === 0) return [];
    const cfg = await resolveRestConfig({ signal });
    return restGet<VtuberOption[]>(cfg, `vtubers?select=${VTUBER_COLS}&id=in.(${valid.join(',')})`, { signal });
}

export function useVtuberNames(ids: string[]) {
    const key = [...new Set(ids)].sort();
    return useQuery({
        queryKey: ['admin-song-vtuber-names', key],
        enabled: key.length > 0,
        queryFn: async ({ signal }) => {
            const rows = await fetchVtubersByIds(key, signal);
            return new Map(rows.map((r) => [r.id, r]));
        },
        staleTime: 5 * 60_000,
        retry: 1,
    });
}

// ---------- 週表場次帶入（新增歌回時，用影片 ID 找週表裡的同一場，補 VTuber／標題／開台時間） ----------

export interface StreamPrefill {
    title: string | null;
    vtuberId: string | null;
    streamedAt: string | null;
}

interface StreamRow {
    vtuber_id: string | null;
    title: string | null;
    actual_start: string | null;
    scheduled_start: string | null;
}

/** 週表 streams 公開可讀；找不到回 null。開台時間取實際開台，沒有就用預定時間 */
export async function fetchStreamByVideoId(videoId: string, signal?: AbortSignal): Promise<StreamPrefill | null> {
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
    const cfg = await resolveRestConfig({ signal });
    const rows = await restGet<StreamRow[]>(
        cfg,
        `streams?select=vtuber_id,title,actual_start,scheduled_start&platform=eq.youtube&external_id=eq.${encodeURIComponent(videoId)}&limit=1`,
        { signal },
    );
    const row = rows[0];
    if (!row) return null;
    return {
        title: row.title || null,
        vtuberId: row.vtuber_id || null,
        streamedAt: row.actual_start ?? row.scheduled_start ?? null,
    };
}
