// Admin 分類審核 hooks(對齊 useAdminAnnouncements 慣例:含 timeout、formatError)
// Endpoint: /api/admin/categories/review (GET / POST,皆需 aal2)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '../../../lib/supabase';

const AUTH_TIMEOUT_MS = 2000;
const FETCH_TIMEOUT_MS = 15_000;
const LIST_KEY = 'admin-categories';

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
        p.then(
            (v) => { clearTimeout(t); resolve(v); },
            (e) => { clearTimeout(t); reject(e); },
        );
    });
}

async function getAuthHeader(): Promise<Record<string, string>> {
    try {
        const supabase = await withTimeout(getSupabase(), AUTH_TIMEOUT_MS, 'get_supabase');
        if (!supabase) return {};
        const { data } = await withTimeout(supabase.auth.getSession(), AUTH_TIMEOUT_MS, 'get_session');
        const token = data?.session?.access_token;
        if (token) return { Authorization: `Bearer ${token}` };
    } catch (e) {
        console.warn('[admin categories] getAuthHeader failed', (e as Error)?.message);
    }
    return {};
}

class ApiError extends Error {
    constructor(public status: number, public payload: any) {
        super(payload?.error || `HTTP ${status}`);
        this.name = 'ApiError';
    }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const auth = await getAuthHeader();
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
        res = await fetch(path, {
            ...init,
            credentials: 'same-origin',
            signal: controller.signal,
            headers: {
                ...(init.body ? { 'Content-Type': 'application/json' } : {}),
                ...auth,
                ...(init.headers || {}),
            },
        });
    } catch (e) {
        if ((e as Error)?.name === 'AbortError') {
            throw new ApiError(0, { error: 'request_timeout' });
        }
        throw e;
    } finally {
        clearTimeout(abortTimer);
    }
    let payload: any = null;
    try { payload = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok || payload?.ok === false) {
        throw new ApiError(res.status, payload);
    }
    return payload as T;
}

export function formatAdminCategoryError(err: unknown): string {
    if (err instanceof ApiError) {
        const code = err.payload?.error;
        const map: Record<string, string> = {
            request_timeout: '請求逾時,請稍後再試',
            unauthenticated: '請先登入',
            mfa_required: '需要二次驗證(2FA)',
            forbidden: '權限不足',
            banned: '帳號已被限制',
            not_found: '找不到資料',
            not_pending: '此分類已被審核過',
            invalid_id: 'ID 無效',
            invalid_action: '動作無效',
            invalid_status: '狀態無效',
            invalid_notes: '備註格式錯誤',
            notes_too_long: '備註過長',
            invalid_content_type: 'Content-Type 必須為 application/json',
            invalid_json: 'JSON 格式錯誤',
            body_too_large: '請求過大',
            update_failed: '更新失敗',
            fetch_failed: '讀取失敗',
            server_misconfigured: '伺服器設定錯誤',
        };
        if (typeof code === 'string' && map[code]) return map[code];
        if (err.status === 401) return '請先登入(或 session 已過期)';
        if (err.status === 403) return '權限不足或需要 2FA';
        if (err.status === 404) return '找不到資料';
        if (err.status === 409) return '狀態衝突';
        return code || `操作失敗 (HTTP ${err.status})`;
    }
    if (err instanceof Error) return err.message;
    return '未知錯誤';
}

export type CategoryStatus = 'pending' | 'approved' | 'rejected' | 'archived';

export interface AdminCategoryRecord {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    status: CategoryStatus;
    proposed_by: string | null;
    reviewer_notes: string | null;
    reviewed_at: string | null;
    created_at: string;
}

export function useAdminCategories(status: CategoryStatus | 'all' = 'pending') {
    return useQuery({
        queryKey: [LIST_KEY, status],
        queryFn: async (): Promise<AdminCategoryRecord[]> => {
            const data = await apiFetch<{ ok: true; categories: AdminCategoryRecord[] }>(
                `/api/admin/categories/review?status=${status}`,
            );
            return data.categories ?? [];
        },
        staleTime: 30_000,
    });
}

export function useReviewCategory() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (
            input: { id: string; action: 'approve' | 'reject'; notes?: string },
        ): Promise<AdminCategoryRecord> => {
            const data = await apiFetch<{ ok: true; category: AdminCategoryRecord }>(
                '/api/admin/categories/review',
                { method: 'POST', body: JSON.stringify(input) },
            );
            return data.category;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: [LIST_KEY] });
            // 同步 invalidate public categories list(approved 後立刻可見)
            qc.invalidateQueries({ queryKey: ['recommendation-categories'] });
        },
    });
}
