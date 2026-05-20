// 推薦系統 API client(timeout + same-origin + console.warn diagnostic)
// 設計守則對齊 memory:
//   - error_client_fetch_needs_timeout: 必加 timeout
//   - error_dev_preview_credentials_omit_cors: 必用 same-origin
//
// 認證:已登入帶 Bearer access_token;未登入純 anon。

import { getSupabase } from '../../lib/supabase';

const AUTH_TIMEOUT_MS = 2000;
const FETCH_TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
        p.then(
            (v) => { clearTimeout(t); resolve(v); },
            (e) => { clearTimeout(t); reject(e); },
        );
    });
}

/**
 * Fallback:supabase getSession() 偶爾被 auth.lock mutex 卡住超過 timeout,
 * 此時直接從 localStorage 讀 access_token。
 *
 * supabase-js v2 storage:
 *   key:   sb-<projectRef>-auth-token
 *   value: 可能是純 JSON 或 base64-prefix encoded JSON('base64-' + atob(...))
 *          (同 lib/supabase.ts readRefreshTokenFromStorage 的處理)
 *
 * token 可能比 in-memory 略舊(尚未 refresh),但通常仍 valid;
 * 若真過期 backend 回 401,user 重登即可。
 */
function readSessionFromLocalStorage(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const key = Object.keys(window.localStorage).find(
            k => k.startsWith('sb-') && k.endsWith('-auth-token'),
        );
        if (!key) return null;
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;

        // supabase-js 某些版本會把 value 用 'base64-' prefix 包起來
        let parsed: any = null;
        if (raw.startsWith('base64-')) {
            try {
                parsed = JSON.parse(atob(raw.substring('base64-'.length)));
            } catch { /* fall through to JSON.parse */ }
        }
        if (!parsed) {
            try { parsed = JSON.parse(raw); } catch { /* ignore */ }
        }
        if (!parsed) return null;

        const token = parsed?.access_token
            || parsed?.currentSession?.access_token
            || parsed?.session?.access_token;
        if (typeof token === 'string' && token.length > 0) return token;
    } catch { /* ignore */ }
    return null;
}

async function authHeader(): Promise<Record<string, string>> {
    // 先 try async getSession(會自動 refresh 過期 token)
    let sessionSource: string = 'none';
    let sessionReturnedNull = false;
    try {
        const supabase = await withTimeout(getSupabase(), AUTH_TIMEOUT_MS, 'get_supabase');
        if (supabase) {
            const { data } = await withTimeout(supabase.auth.getSession(), AUTH_TIMEOUT_MS, 'get_session');
            const token = data?.session?.access_token;
            if (token) {
                console.warn('[recommendations] authHeader source=getSession, tokenLen=' + token.length);
                return { Authorization: `Bearer ${token}` };
            }
            // getSession 成功但 session=null(user 未登入 or supabase 還在 hydrate)
            sessionReturnedNull = true;
            sessionSource = 'getSession_returned_null';
        } else {
            sessionSource = 'getSupabase_returned_null';
        }
    } catch (e) {
        sessionSource = `getSession_threw_${(e as Error)?.message || 'unknown'}`;
        console.warn('[recommendations] getSession timeout/error, trying localStorage fallback', sessionSource);
    }
    // Fallback:從 localStorage 同步讀(supabase getSession 偶爾被 mutex 卡)
    const fallback = readSessionFromLocalStorage();
    if (fallback) {
        console.warn('[recommendations] authHeader source=localStorage_fallback, getSessionReason=' + sessionSource + ', tokenLen=' + fallback.length);
        return { Authorization: `Bearer ${fallback}` };
    }
    console.warn('[recommendations] authHeader FAILED — no token from either path. getSession=' + sessionSource + ', localStorage=null, sessionReturnedNull=' + sessionReturnedNull);
    return {};
}

export class RecommendApiError extends Error {
    constructor(public status: number, public payload: unknown, public bodyError?: string) {
        super(bodyError || `HTTP ${status}`);
        this.name = 'RecommendApiError';
    }
}

export interface ApiFetchOptions {
    method?: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
    // 若 endpoint 回 200 + ok:false (例 already_recommended),不要 throw,讓 caller 判斷
    treatOkFalseAsResult?: boolean;
}

export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
    const auth = await authHeader();
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
        res = await fetch(path, {
            method: opts.method || 'GET',
            credentials: 'same-origin',
            signal: controller.signal,
            headers: {
                ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...auth,
            },
            ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        });
    } catch (e) {
        if ((e as Error)?.name === 'AbortError') {
            throw new RecommendApiError(0, null, 'request_timeout');
        }
        throw e;
    } finally {
        clearTimeout(abortTimer);
    }

    let payload: any = null;
    const contentType = res.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
        try { payload = await res.json(); } catch { /* non-JSON */ }
    } else if (!res.ok) {
        // 非 JSON 錯誤(例 SPA fallback HTML)— 不要試著 parse,直接 throw
        console.warn(`[recommendations] ${path} non-JSON ${res.status}`, { contentType });
        throw new RecommendApiError(res.status, null, `non_json_${res.status}`);
    }

    if (!res.ok) {
        const errCode = typeof payload?.error === 'string' ? payload.error : `http_${res.status}`;
        console.warn(`[recommendations] ${path} not ok`, { status: res.status, errCode });
        throw new RecommendApiError(res.status, payload, errCode);
    }
    if (payload?.ok === false && !opts.treatOkFalseAsResult) {
        const errCode = typeof payload?.error === 'string' ? payload.error : 'unknown_error';
        throw new RecommendApiError(200, payload, errCode);
    }
    return payload as T;
}

export function formatRecommendError(err: unknown): string {
    if (err instanceof RecommendApiError) {
        const map: Record<string, string> = {
            request_timeout: '請求逾時,請稍後再試',
            unauthenticated: '請先登入',
            banned: '帳號或來源已被限制',
            invalid_body: '資料格式錯誤',
            invalid_url: '網址無效',
            invalid_platform: '平台無效',
            invalid_channel_id: '頻道 ID 無效',
            invalid_id: 'ID 無效',
            invalid_category_id: '分類 ID 無效',
            invalid_vtuber_id: 'VTuber ID 無效',
            invalid_slug: 'slug 格式無效(只能 a-z, 0-9, dash)',
            invalid_description: '說明欄位錯誤',
            invalid_comment: '留言格式錯誤',
            invalid_status: '狀態錯誤',
            invalid_action: '動作錯誤',
            invalid_notes: 'notes 格式錯誤',
            invalid_json: 'JSON 格式錯誤',
            invalid_content_type: 'Content-Type 必須為 application/json',
            invalid_turnstile_token: '驗證 token 無效',
            invalid_anonymous_id: '匿名識別格式錯誤',
            invalid_data: '資料格式錯誤',
            not_in_favorites: '請先把這個頻道加入收藏才能推薦',
            not_found: '找不到資料',
            not_pending: '此分類已被審核過',
            category_not_found: '找不到分類',
            category_not_approved: '此分類尚未通過審核',
            vtuber_not_found: '找不到 VTuber',
            name_required: '請填寫名稱',
            comment_too_long: '留言過長(上限 500 字)',
            comment_no_url: '留言不能包含網址',
            description_too_long: '說明過長(上限 200 字)',
            notes_too_long: '備註過長',
            body_too_large: '請求過大',
            quota_exceeded: '今日額度已達上限',
            rate_limited: '操作過於頻繁,請稍後再試',
            duplicate_name_or_slug: '名稱或 slug 已被使用',
            duplicate_name: '分類名稱已被使用',
            turnstile_failed: '人機驗證失敗,請重試',
            turnstile_network: '驗證連線失敗,請稍後再試',
            turnstile_not_configured: '伺服器設定錯誤',
            create_vtuber_failed: '建立 VTuber 失敗',
            insert_failed: '寫入失敗',
            update_failed: '更新失敗',
            delete_failed: '刪除失敗',
            fetch_failed: '讀取失敗',
            server_misconfigured: '伺服器設定錯誤',
            mfa_required: '需要二次驗證(2FA)',
            forbidden: '權限不足',
        };
        if (typeof err.bodyError === 'string' && map[err.bodyError]) return map[err.bodyError];
        if (err.status === 401) return '請先登入(或 session 已過期)';
        if (err.status === 403) return '權限不足';
        if (err.status === 404) return '找不到資料';
        if (err.status === 429) return '操作過於頻繁,請稍後再試';
        return err.bodyError || `操作失敗 (HTTP ${err.status})`;
    }
    if (err instanceof Error) return err.message;
    return '未知錯誤';
}
