// VTuber Functions endpoint client
// 投稿 / 活動建立 / Admin 審核都走 Cloudflare Pages Function 中介層
// （不直連 Supabase，由 Function 統一處理 rate limit / Turnstile / 權限驗證）

import { getSupabase } from '../../lib/supabase';

export class ApiError extends Error {
    constructor(public status: number, public payload: any) {
        super(payload?.error || `HTTP ${status}`);
        this.name = 'ApiError';
    }
}

async function getAuthHeader(): Promise<Record<string, string>> {
    // 取不到 session 一律視同匿名（不印 console，避免污染瀏覽器 console）
    try {
        const supabase = await getSupabase();
        if (!supabase) return {};
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) {
            return { Authorization: `Bearer ${token}` };
        }
    } catch { /* silent — 視同匿名 */ }
    return {};
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
    const authHeader = await getAuthHeader();
    const res = await fetch(path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...authHeader,
        },
        body: JSON.stringify(body),
    });
    let payload: any = null;
    try { payload = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) {
        throw new ApiError(res.status, payload);
    }
    return payload as T;
}

async function getJson<T>(path: string): Promise<T> {
    const authHeader = await getAuthHeader();
    const res = await fetch(path, {
        method: 'GET',
        headers: { ...authHeader },
    });
    let payload: any = null;
    try { payload = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) {
        throw new ApiError(res.status, payload);
    }
    return payload as T;
}

// ===== VTuber 投稿 =====

export interface VTuberContributeRequest {
    action: 'add' | 'edit' | 'delete';
    targetVtuberId?: string | null;
    payload: Record<string, unknown>;
    sourceUrls: string[];
    sourceNote?: string;
    contributorName?: string;
    contributorContact?: string;
    turnstileToken?: string;
}

export interface VTuberContributeResponse {
    success: boolean;
    id: string | null;
    anonymous: boolean;
}

export const submitVTuberContribution = (body: VTuberContributeRequest) =>
    postJson<VTuberContributeResponse>('/api/vtuber-contribute', body);

// ===== Event 建立 =====

export interface CreateEventRequest {
    title: string;
    description?: string;
    eventType: 'vtuber_event' | 'livestream' | 'community';
    vtuberId?: string | null;
    startTime: string;
    endTime?: string;
    location?: string;
    url?: string;
    imageUrl?: string;
    turnstileToken?: string;
}

export const createVTuberEvent = (body: CreateEventRequest) =>
    postJson<{ success: boolean; id: string | null }>('/api/vtuber-event-create', body);

// ===== Admin =====

export interface AdminCheckPermissionResponse {
    allowed: boolean;
    trust_level: string | null;
    reason?: string;
}

export const checkAdminPermission = () =>
    getJson<AdminCheckPermissionResponse>('/api/admin/check-permission');

export const reviewVTuberContribution = (body: { id: string; action: 'approve' | 'reject'; notes?: string }) =>
    postJson<{ success: boolean; status: string; vtuber_id: string | null }>(
        '/api/admin/review-contribution',
        body,
    );

export const reviewVTuberEvent = (body: { id: string; action: 'approve' | 'reject'; notes?: string }) =>
    postJson<{ success: boolean; status: string }>(
        '/api/admin/review-event',
        body,
    );

/**
 * 將 ApiError 轉為友善中文訊息
 */
export function formatApiError(err: unknown): string {
    if (err instanceof ApiError) {
        const payload = err.payload || {};
        if (err.status === 429) return payload.error || '操作次數已達上限，請稍後再試';
        if (err.status === 503) return payload.error || '功能暫停中，請稍後再試';
        if (err.status === 401) return payload.error || '請先登入';
        if (err.status === 403) return payload.error || '驗證失敗或無權限';
        if (err.status === 400) return payload.error || '請求格式錯誤';
        return payload.error || `操作失敗 (HTTP ${err.status})`;
    }
    if (err instanceof Error) return err.message;
    return '未知錯誤';
}
