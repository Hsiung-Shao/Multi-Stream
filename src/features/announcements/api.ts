/**
 * 公告系統 API client(集中 fetch / auth / 錯誤處理)
 *
 * Auth header:登入時帶 Supabase access_token,讓 backend 能識別 user_id;
 *           未登入則純 anon。device_id 由 caller 從 LocalStorage 拿後當 body 傳。
 */

import { getSupabase } from '../../lib/supabase';
import type { Announcement, PollResults, SurveyResults } from './types';

async function authHeader(): Promise<Record<string, string>> {
    try {
        const supabase = await getSupabase();
        if (!supabase) return {};
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) return {};
        return { Authorization: `Bearer ${token}` };
    } catch {
        return {};
    }
}

/**
 * 取目前 active 公告。
 * 失敗(網路 / 5xx)→ 回空陣列(UI 不應炸掉),呼叫端視需求自行 retry。
 *
 * 失敗時用 console.warn 印根因,讓 F12 可以判斷:
 *   - 401/403 → CORS 或 Cloudflare Access 擋
 *   - 500 server_misconfigured → 後端 env vars 沒設(SUPABASE_URL / SERVICE_ROLE_KEY)
 *   - non-JSON / text/html → endpoint 不存在,SPA fallback 攔截
 *   - network error → CORS preflight 失敗
 */
export async function fetchActiveAnnouncements(): Promise<Announcement[]> {
    try {
        const headers = await authHeader();
        const res = await fetch('/api/announcements/active', { headers, credentials: 'omit' });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.warn('[announcements] /active non-ok', { status: res.status, body: errText.slice(0, 200) });
            return [];
        }
        const contentType = res.headers.get('Content-Type') || '';
        if (!contentType.includes('application/json')) {
            console.warn('[announcements] /active returned non-JSON — endpoint missing? SPA fallback?', { contentType });
            return [];
        }
        const data = (await res.json()) as { success?: boolean; announcements?: Announcement[]; error?: string };
        if (!data?.success || !Array.isArray(data.announcements)) {
            console.warn('[announcements] /active responded but success=false or no array', data);
            return [];
        }
        return data.announcements;
    } catch (e) {
        console.warn('[announcements] /active fetch threw', (e as Error)?.message);
        return [];
    }
}

export interface RespondInput {
    announcement_id: string;
    choices?: unknown;
    text_response?: string;
    device_id?: string | null;
}

export type RespondResult =
    | { ok: true }
    | { ok: false; reason: 'already_responded' }
    | { ok: false; error: string };

/**
 * 提交公告回應(投票 / 問卷)。
 * 200 + ok=false + reason='already_responded' 算成功 dedupe(由 caller 視同已投票)。
 */
export async function submitAnnouncementResponse(input: RespondInput): Promise<RespondResult> {
    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(await authHeader()),
        };
        const body: Record<string, unknown> = { announcement_id: input.announcement_id };
        if (input.choices !== undefined) body.choices = input.choices;
        if (input.text_response) body.text_response = input.text_response;
        if (input.device_id) body.device_id = input.device_id;

        const res = await fetch('/api/announcements/respond', {
            method: 'POST',
            headers,
            credentials: 'omit',
            body: JSON.stringify(body),
        });
        // 統一解析(成功與「已回應」都是 200)
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (data?.ok === true) return { ok: true };
        if (data?.reason === 'already_responded') {
            return { ok: false, reason: 'already_responded' };
        }
        const errText = typeof data?.error === 'string' ? data.error : `http_${res.status}`;
        return { ok: false, error: errText };
    } catch {
        return { ok: false, error: 'network_error' };
    }
}

/**
 * 取單一公告的彙整結果(public)。
 */
export async function fetchAnnouncementResults(
    id: string,
): Promise<PollResults | SurveyResults | null> {
    try {
        const res = await fetch(`/api/announcements/${encodeURIComponent(id)}/results`, {
            credentials: 'omit',
        });
        if (!res.ok) return null;
        const data = (await res.json()) as PollResults | SurveyResults | { success: false };
        if (!('success' in data) || data.success !== true) return null;
        return data as PollResults | SurveyResults;
    } catch {
        return null;
    }
}
