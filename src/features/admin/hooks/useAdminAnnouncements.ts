// Admin announcements 資料 hooks（對齊 useFeedbacks 模式）
// 走 Cloudflare Pages Function（functions/api/admin/announcements.js）
// 認證走 Authorization: Bearer <access_token>，由 backend requireAdminTrust(aal=2) 把關
//
// 注意：所有 endpoint 在後端強制 admin trust + aal2，前端不重複檢查；
// 只負責把錯誤往上拋，由 UI 層顯示。

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '../../../lib/supabase';

// ---------- 共用型別 ----------

export type AnnouncementType = 'announcement' | 'poll' | 'survey';
export type AnnouncementStatus = 'draft' | 'published' | 'archived';
export type TargetSegment = 'all' | 'authenticated';

export interface PollOption {
    id: string;
    label: string;
}

export interface PollPayload {
    options: PollOption[];
    multi_select: boolean;
}

export type SurveyQuestionType = 'single' | 'multi' | 'text';

export interface SurveyQuestionOption {
    id: string;
    label: string;
}

export interface SurveyQuestion {
    id: string;
    label: string;
    type: SurveyQuestionType;
    options?: SurveyQuestionOption[];
}

export interface SurveyPayload {
    questions: SurveyQuestion[];
}

export type AnnouncementPayload = PollPayload | SurveyPayload | Record<string, unknown> | null;

export interface AnnouncementRecord {
    id: string;
    type: AnnouncementType;
    title: string;
    body: string | null;
    payload: AnnouncementPayload;
    target_segment: TargetSegment;
    priority: number;
    starts_at: string;
    ends_at: string | null;
    status: AnnouncementStatus;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface AnnouncementResponseRecord {
    id: string;
    user_id: string | null;
    device_id: string | null;
    choices: unknown;
    text_response: string | null;
    created_at: string;
}

export interface AnnouncementResponsesPayload {
    total: number;
    limit: number;
    truncated: boolean;
    responses: AnnouncementResponseRecord[];
}

// ---------- 共用 fetch helper ----------

class ApiError extends Error {
    constructor(public status: number, public payload: any) {
        super(payload?.error || `HTTP ${status}`);
        this.name = 'ApiError';
    }
}

async function getAuthHeader(): Promise<Record<string, string>> {
    try {
        const supabase = await getSupabase();
        if (!supabase) return {};
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) return { Authorization: `Bearer ${token}` };
    } catch { /* silent */ }
    return {};
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const auth = await getAuthHeader();
    const res = await fetch(path, {
        ...init,
        headers: {
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...auth,
            ...(init.headers || {}),
        },
    });
    let payload: any = null;
    try { payload = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok || payload?.ok === false) {
        throw new ApiError(res.status, payload);
    }
    return payload as T;
}

export function formatAdminAnnouncementError(err: unknown): string {
    if (err instanceof ApiError) {
        const code = err.payload?.error;
        // 友善訊息對照（盡量對齊 backend 回的 error code）
        const map: Record<string, string> = {
            unauthenticated: '請先登入',
            mfa_required: '需要二次驗證(2FA)',
            forbidden: '權限不足',
            not_found: '找不到資料',
            invalid_id: '無效 ID',
            invalid_type: '無效的公告類型',
            invalid_target_segment: '無效的目標族群',
            invalid_status: '無效的狀態',
            invalid_priority: '無效的優先度',
            invalid_starts_at: '開始時間格式錯誤',
            invalid_ends_at: '結束時間格式錯誤',
            invalid_payload: 'payload 格式錯誤',
            invalid_body_field: 'body 欄位格式錯誤',
            title_required: '請填寫標題',
            id_required: '缺少 ID',
            no_fields_to_update: '沒有可更新的欄位',
            invalid_json: 'JSON 格式錯誤',
            invalid_content_type: 'Content-Type 必須為 application/json',
            body_too_large: '請求內容過大',
            create_failed: '建立失敗',
            update_failed: '更新失敗',
            delete_failed: '刪除失敗',
            fetch_failed: '讀取失敗',
            server_misconfigured: '伺服器設定錯誤',
        };
        if (typeof code === 'string' && map[code]) return map[code];
        if (err.status === 401) return '請先登入(或 session 已過期)';
        if (err.status === 403) return '權限不足或需要 2FA';
        if (err.status === 404) return '找不到資料';
        return code || `操作失敗 (HTTP ${err.status})`;
    }
    if (err instanceof Error) return err.message;
    return '未知錯誤';
}

// ---------- Query keys ----------

const LIST_KEY = 'admin-announcements';
const RESPONSES_KEY = 'admin-announcement-responses';

// ---------- Hooks ----------

export function useAdminAnnouncements() {
    return useQuery({
        queryKey: [LIST_KEY],
        queryFn: async (): Promise<AnnouncementRecord[]> => {
            const data = await apiFetch<{ ok: true; announcements: AnnouncementRecord[] }>(
                '/api/admin/announcements',
            );
            return data.announcements ?? [];
        },
        // admin 後台不需要 background polling
        staleTime: 30_000,
    });
}

export interface AnnouncementWriteInput {
    type: AnnouncementType;
    title: string;
    body?: string | null;
    payload?: AnnouncementPayload;
    target_segment: TargetSegment;
    priority?: number;
    starts_at?: string | null;
    ends_at?: string | null;
    status: AnnouncementStatus;
}

export function useCreateAnnouncement() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: AnnouncementWriteInput): Promise<AnnouncementRecord> => {
            const data = await apiFetch<{ ok: true; announcement: AnnouncementRecord }>(
                '/api/admin/announcements',
                { method: 'POST', body: JSON.stringify(input) },
            );
            return data.announcement;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: [LIST_KEY] }),
    });
}

export function useUpdateAnnouncement() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (
            { id, updates }: { id: string; updates: Partial<AnnouncementWriteInput> },
        ): Promise<AnnouncementRecord> => {
            const data = await apiFetch<{ ok: true; announcement: AnnouncementRecord }>(
                `/api/admin/announcements?id=${encodeURIComponent(id)}`,
                { method: 'PUT', body: JSON.stringify(updates) },
            );
            return data.announcement;
        },
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: [LIST_KEY] });
            qc.invalidateQueries({ queryKey: [RESPONSES_KEY, variables.id] });
        },
    });
}

export function useDeleteAnnouncement() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string): Promise<void> => {
            await apiFetch<{ ok: true }>(
                `/api/admin/announcements?id=${encodeURIComponent(id)}`,
                { method: 'DELETE' },
            );
        },
        onSuccess: (_d, id) => {
            qc.invalidateQueries({ queryKey: [LIST_KEY] });
            qc.removeQueries({ queryKey: [RESPONSES_KEY, id] });
        },
    });
}

export function useAnnouncementResponses(id: string | null, enabled: boolean) {
    return useQuery({
        queryKey: [RESPONSES_KEY, id],
        enabled: enabled && !!id,
        queryFn: async (): Promise<AnnouncementResponsesPayload> => {
            return await apiFetch<AnnouncementResponsesPayload & { ok: true }>(
                `/api/admin/announcements/${encodeURIComponent(id!)}/responses`,
            );
        },
        staleTime: 10_000,
    });
}
