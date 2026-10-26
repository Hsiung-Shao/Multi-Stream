/**
 * 歌回（song_videos＋song_segments）後台 hooks — 對應 functions/api/admin/songs.js
 *
 * 與公告分頁共用 apiFetch（X-Admin-Token、15 秒逾時）。公開目錄 /api/songs/catalog 有 10 分鐘 edge 快取，
 * 發布後最晚約 10 分鐘才出現在 /songs。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

// ---------- 社群投稿的歌回時間軸（functions/api/admin/song-submissions.js） ----------

export const SONG_SUBMISSIONS_KEY = 'admin-song-submissions';
const SONG_SUBMISSION_KEY = 'admin-song-submission';

export type SongSubmissionKind = 'new' | 'revision';
export type SongSubmissionStatus = 'pending' | 'approved' | 'rejected';

/** 投稿者送來的片段（functions/lib/song-submissions.js 正規化後的格式） */
export interface SubmittedSegment {
    start: number;
    end: number;
    title: string;
    artist: string | null;
    endEstimated: boolean;
}

export interface SongSubmissionRecord {
    id: string;
    kind: SongSubmissionKind;
    video_id: string;
    target_video_ref: string | null;
    title: string;
    vtuber_id: string | null;
    streamed_at: string | null;
    /** 使用者輸入，畫面上只能當純文字顯示（不轉連結） */
    source_note: string | null;
    /** 使用者輸入，畫面上只能當純文字顯示（不轉連結） */
    submitter_contact: string | null;
    status: SongSubmissionStatus;
    reviewer_notes: string | null;
    result_video_ref: string | null;
    created_at: string;
    reviewed_at: string | null;
    /** 單筆查詢才有 */
    segments?: SubmittedSegment[];
}

export interface SongSubmissionDetail {
    submission: SongSubmissionRecord;
    /** 修正型：該影片目前的片段（依 start） */
    existing: SongSegmentRecord[] | null;
    /** 修正型：該影片目前的欄位（核准時沿用，不被投稿內容覆寫） */
    existingVideo: Pick<SongVideoRecord, 'id' | 'video_id' | 'title' | 'vtuber_id' | 'streamed_at' | 'duration_seconds' | 'status'> | null;
}

export interface ApproveSubmissionInput {
    video_ref: string | null;
    video: Omit<SongVideoWriteInput, 'segments'>;
    segments: SongSegmentInput[];
}

const SUBMISSION_ERRORS: Record<string, string> = {
    not_pending: '這筆投稿已經處理過了（可能有其他管理員同時審核），請重新整理',
    invalid_id: '無效的投稿 ID',
};

export function formatSubmissionError(err: unknown): string {
    const code = err instanceof ApiError ? err.payload?.error : undefined;
    if (typeof code === 'string' && SUBMISSION_ERRORS[code]) return SUBMISSION_ERRORS[code];
    return formatSongError(err);
}

export function useAdminSongSubmissions(status: SongSubmissionStatus = 'pending') {
    return useQuery({
        queryKey: [SONG_SUBMISSIONS_KEY, status],
        queryFn: async (): Promise<SongSubmissionRecord[]> => {
            const data = await apiFetch<{ ok: true; submissions: SongSubmissionRecord[] }>(`/api/admin/song-submissions?status=${status}`);
            return data.submissions ?? [];
        },
        staleTime: 30_000,
        retry: noRetryOn401,
    });
}

export function useAdminSongSubmission(id: string | null) {
    return useQuery({
        queryKey: [SONG_SUBMISSION_KEY, id],
        enabled: !!id,
        queryFn: async (): Promise<SongSubmissionDetail> => {
            const data = await apiFetch<{ ok: true; existing_video?: SongSubmissionDetail['existingVideo'] } & Omit<SongSubmissionDetail, 'existingVideo'>>(
                `/api/admin/song-submissions?id=${encodeURIComponent(id!)}`,
            );
            return { submission: data.submission, existing: data.existing ?? null, existingVideo: data.existing_video ?? null };
        },
        staleTime: 0,
        retry: noRetryOn401,
    });
}

export function useApproveSongSubmission() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, input }: { id: string; input: ApproveSubmissionInput }): Promise<{ video_ref: string }> => {
            const data = await apiFetch<{ ok: true; video_ref: string }>(
                `/api/admin/song-submissions?id=${encodeURIComponent(id)}&action=approve`,
                { method: 'POST', body: JSON.stringify(input) },
            );
            return { video_ref: data.video_ref };
        },
        onSuccess: (_d, { id }) => {
            qc.invalidateQueries({ queryKey: [SONG_SUBMISSIONS_KEY] });
            qc.invalidateQueries({ queryKey: [SONG_VIDEOS_KEY] });
            qc.removeQueries({ queryKey: [SONG_SUBMISSION_KEY, id] });
        },
    });
}

export function useRejectSongSubmission() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, notes }: { id: string; notes: string | null }) => {
            await apiFetch<{ ok: true }>(
                `/api/admin/song-submissions?id=${encodeURIComponent(id)}&action=reject`,
                { method: 'POST', body: JSON.stringify({ notes }) },
            );
        },
        onSuccess: (_d, { id }) => {
            qc.invalidateQueries({ queryKey: [SONG_SUBMISSIONS_KEY] });
            qc.removeQueries({ queryKey: [SONG_SUBMISSION_KEY, id] });
        },
    });
}
