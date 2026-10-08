// 已知問題（known_issues）共用工具：常數、後台寫入驗證、公開欄位
//
// 表結構與 CHECK 見 supabase/migrations/20261008062601_known_issues.sql，常數要與 CHECK 對齊。

export const ISSUE_STATUSES = new Set(['investigating', 'identified', 'fixing', 'monitoring', 'resolved']);
export const ISSUE_SEVERITIES = new Set(['minor', 'major']);
export const ISSUE_AREAS = new Set(['canvas', 'youtube', 'twitch', 'chat', 'schedule', 'favorites', 'other']);

export const ISSUE_TITLE_MAX_LEN = 120;
export const ISSUE_BODY_MAX_LEN = 4000;

/** 公開頁回傳的欄位（不含 is_public、created_at 以外的內部欄位） */
export const PUBLIC_ISSUE_COLUMNS = 'id,title,body,status,severity,areas,created_at,updated_at,resolved_at';

/** 解決後還在公開頁顯示幾天 */
export const RESOLVED_VISIBLE_DAYS = 14;

/**
 * 驗證並標準化建立／更新 known_issue 的 payload
 *
 * status 改成 resolved 時填 resolved_at＝now；改成其他狀態時清空 resolved_at。
 * resolved_at 不接受 caller 指定，一律由這裡維護。
 *
 * @param {any} body
 * @param {{ partial?: boolean, now?: Date, previousStatus?: string }} [opts]
 *   partial=true 時所有欄位可選（PUT 用）；previousStatus＝更新前的狀態（PUT 時由 endpoint 先查）
 * @returns {{ ok: true, row: Object } | { ok: false, error: string }}
 */
export function buildKnownIssueWritePayload(body, opts = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid_body' };
    const partial = !!opts.partial;
    const now = opts.now ?? new Date();
    const row = {};

    if ('title' in body || !partial) {
        const t = typeof body.title === 'string' ? body.title.trim() : '';
        if (!t) return { ok: false, error: 'title_required' };
        if (t.length > ISSUE_TITLE_MAX_LEN) return { ok: false, error: 'title_too_long' };
        row.title = t;
    }
    if ('body' in body) {
        if (body.body === null || (typeof body.body === 'string' && body.body.trim() === '')) {
            row.body = null;
        } else if (typeof body.body === 'string') {
            if (body.body.length > ISSUE_BODY_MAX_LEN) return { ok: false, error: 'body_too_long' };
            row.body = body.body;
        } else {
            return { ok: false, error: 'invalid_body_field' };
        }
    }
    if ('status' in body || !partial) {
        const s = body.status ?? 'investigating';
        if (!ISSUE_STATUSES.has(s)) return { ok: false, error: 'invalid_status' };
        row.status = s;
        // 狀態沒變時不動 resolved_at（後台編輯對話框每次都會送完整欄位，不能每存一次就把解決時間刷新）
        if (s !== opts.previousStatus) row.resolved_at = s === 'resolved' ? now.toISOString() : null;
    }
    if ('severity' in body || !partial) {
        const s = body.severity ?? 'minor';
        if (!ISSUE_SEVERITIES.has(s)) return { ok: false, error: 'invalid_severity' };
        row.severity = s;
    }
    if ('areas' in body || !partial) {
        const a = body.areas ?? [];
        if (!Array.isArray(a) || a.some((x) => !ISSUE_AREAS.has(x))) return { ok: false, error: 'invalid_areas' };
        row.areas = [...new Set(a)];
    }
    if ('is_public' in body || !partial) {
        const p = body.is_public ?? false;
        if (typeof p !== 'boolean') return { ok: false, error: 'invalid_is_public' };
        row.is_public = p;
    }
    return { ok: true, row };
}

/**
 * 公開頁的 PostgREST 查詢：公開中、且（未解決，或 N 天內解決）
 * @param {number} nowMs
 * @param {number} [limit]
 */
export function publicIssuesQuery(nowMs, limit = 20) {
    const since = new Date(nowMs - RESOLVED_VISIBLE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    return `known_issues?select=${PUBLIC_ISSUE_COLUMNS}`
        + '&is_public=eq.true'
        + `&or=(status.neq.resolved,resolved_at.gte.${encodeURIComponent(since)})`
        + `&order=updated_at.desc&limit=${limit}`;
}
