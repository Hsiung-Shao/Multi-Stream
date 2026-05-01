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

async function postJson<T>(path: string, body: unknown): Promise<T> {
    const auth = await getAuthHeader();
    const res = await fetch(path, {
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

export { ApiError };
