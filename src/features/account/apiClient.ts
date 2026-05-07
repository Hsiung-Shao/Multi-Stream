// Account 相關 Function endpoint client
import { getSupabase } from '../../lib/supabase';

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

const REQUEST_TIMEOUT_MS = 15000;

function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
    const auth = await getAuthHeader();
    const res = await fetchWithTimeout(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(body),
    });
    let payload: any = null;
    try { payload = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) throw new ApiError(res.status, payload);
    return payload as T;
}

export const submitDeleteAccount = (confirmDisplayName: string) =>
    postJson<{ success: boolean; deleted: Record<string, number> }>(
        '/api/account/delete-account',
        { confirmDisplayName },
    );

export interface UpdateDisplayNameResponse {
    success: boolean;
    displayName: string;
    remaining: number;
}

export const submitUpdateDisplayName = (displayName: string) =>
    postJson<UpdateDisplayNameResponse>('/api/account/update-display-name', { displayName });

// ===== 2FA =====

export interface TotpStatusResponse {
    success: boolean;
    enrolled: boolean;
    enrolledAt: string | null;
    backupCodesRemaining: number;
    trustLevel: 'new' | 'trusted' | 'moderator' | 'admin' | 'banned';
    currentAal: 'aal1' | 'aal2';
}

export async function fetchTotpStatus(): Promise<TotpStatusResponse> {
    const auth = await getAuthHeader();
    const res = await fetchWithTimeout('/api/account/totp-status', { headers: auth });
    let payload: any = null;
    try { payload = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) throw new ApiError(res.status, payload);
    return payload as TotpStatusResponse;
}

export const generateBackupCodes = () =>
    postJson<{ success: boolean; codes: string[] }>(
        '/api/account/totp-backup-codes',
        {},
    );

export const submitTotpRecover = (code: string) =>
    postJson<{ success: boolean; remaining: number; message?: string }>(
        '/api/account/totp-recover',
        { code },
    );

export { ApiError };
