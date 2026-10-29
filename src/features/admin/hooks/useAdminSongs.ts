/**
 * 歌回（song_videos＋song_segments）後台 hooks — 對應 functions/api/admin/songs.js
 *
 * 與公告分頁共用 apiFetch（X-Admin-Token、15 秒逾時）。公開目錄 /api/songs/catalog 有 10 分鐘 edge 快取，
 * 發布後最晚約 10 分鐘才出現在 /songs。
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError, formatAdminAnnouncementError } from './useAdminAnnouncements';
import type { SegmentIssueCode } from '../../songs/lib/segmentValidation';

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
    /** 是否鎖定社群編輯；舊後端沒有這個欄位 */
    community_locked?: boolean;
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
    /** 版本備註；舊後端沒有這個欄位 */
    version_note?: string | null;
    /** 所屬歌曲（songs.id）；舊後端沒有這個欄位 */
    song_id?: number;
    position: number;
}

export interface SongSegmentInput {
    id?: string;
    start_seconds: number;
    end_seconds: number | null;
    title: string;
    original_artist: string | null;
    /** 版本備註（trim 後，空白為 null） */
    version_note: string | null;
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
    note_too_long: '備註最多 30 字',
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

export const noRetryOn401 = (count: number, err: unknown) => !(err instanceof ApiError && err.status === 401) && count < 3;

/** 列表每頁筆數（後端只接受這幾種，見 functions/api/admin/songs.js 的 PAGE_SIZES） */
export const SONG_PAGE_SIZES = [15, 25, 50, 100] as const;
export type SongPageSize = (typeof SONG_PAGE_SIZES)[number];

export interface SongVideoListParams {
    page: number;
    pageSize: SongPageSize;
    /** 建立時間下限（含，ISO） */
    createdFrom?: string;
    /** 建立時間上限（不含，ISO） */
    createdTo?: string;
}

export function useAdminSongVideos(params: SongVideoListParams) {
    return useQuery({
        queryKey: [SONG_VIDEOS_KEY, params],
        queryFn: async (): Promise<{ videos: SongVideoListItem[]; total: number; page: number }> => {
            const qs = new URLSearchParams({ page: String(params.page), page_size: String(params.pageSize) });
            if (params.createdFrom) qs.set('created_from', params.createdFrom);
            if (params.createdTo) qs.set('created_to', params.createdTo);
            const data = await apiFetch<{ ok: true; videos: SongVideoListItem[]; total?: number }>(`/api/admin/songs?${qs}`);
            const videos = data.videos ?? [];
            return { videos, total: data.total ?? videos.length, page: params.page };
        },
        // 換頁時先留著上一頁，避免表格閃成「載入中」
        placeholderData: keepPreviousData,
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

// ---------- 社群修改紀錄（functions/api/admin/song-submissions.js） ----------
// 社群投稿改為立即生效（community_save_song_video）；這裡是事後的修改紀錄、還原與鎖定。

export const SONG_SUBMISSIONS_KEY = 'admin-song-submissions';

export type SongEditKind = 'new' | 'revision';
export type SongEditStatus = 'applied' | 'reverted';

export interface SongEditSummary {
    added: number;
    changed: number;
    /** 影片欄位的改動：title／vtuber_id／streamed_at */
    fields: string[];
}

export interface SongEditRecord {
    id: string;
    kind: SongEditKind;
    video_id: string;
    /** 使用者輸入，畫面上只能當純文字顯示（不轉連結） */
    title: string;
    status: SongEditStatus;
    created_at: string;
    reverted_at: string | null;
    target_video_ref: string | null;
    summary: SongEditSummary;
}

const SUBMISSION_ERRORS: Record<string, string> = {
    not_applied: '這筆修改已經還原過了，請重新整理列表',
    submission_not_found: '找不到這筆修改紀錄，請重新整理列表',
    invalid_id: '無效的紀錄 ID',
};

export function formatSubmissionError(err: unknown): string {
    const code = err instanceof ApiError ? err.payload?.error : undefined;
    if (typeof code === 'string' && SUBMISSION_ERRORS[code]) return SUBMISSION_ERRORS[code];
    return formatSongError(err);
}

/** 最近 50 筆社群修改紀錄 */
export function useAdminSongSubmissions() {
    return useQuery({
        queryKey: [SONG_SUBMISSIONS_KEY],
        queryFn: async (): Promise<SongEditRecord[]> => {
            const data = await apiFetch<{ ok: true; submissions: SongEditRecord[] }>('/api/admin/song-submissions');
            return data.submissions ?? [];
        },
        staleTime: 30_000,
        retry: noRetryOn401,
    });
}

/** 還原到這次修改之前（之後的修改一併還原） */
export function useRevertSongEdit() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await apiFetch<{ ok: true }>('/api/admin/song-submissions?action=revert', { method: 'POST', body: JSON.stringify({ id }) });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: [SONG_SUBMISSIONS_KEY] });
            qc.invalidateQueries({ queryKey: [SONG_VIDEOS_KEY] });
            qc.invalidateQueries({ queryKey: [SONG_VIDEO_KEY] });
        },
    });
}

/** 鎖定／解鎖歌回的社群編輯 */
export function useLockSongVideo() {
    return useMutation({
        mutationFn: async ({ videoRef, locked }: { videoRef: string; locked: boolean }) => {
            await apiFetch<{ ok: true }>('/api/admin/song-submissions?action=lock', { method: 'POST', body: JSON.stringify({ videoRef, locked }) });
        },
    });
}
