// 公告（announcements / announcement_responses）共用工具
//
// 集中三件事，避免 5 個 endpoint 各自重抄：
// 1. 取出當下「published 且時間窗內」的單筆公告（service_role，繞 RLS 給 endpoint 自己決定要不要回給 caller）
// 2. 公告/回應的輸入驗證（type / target_segment / choices / text_response / device_id）
// 3. 簡易 KV-based rate limit：anon respond 防濫用（per IP / per device_id）
//
// 不引入 supabase-js，所有寫入都走 lib/supabase-server.js 的 raw fetch helper。

import { select } from './supabase-server.js';

// ---------- 常數 ----------

export const TYPES = new Set(['announcement', 'poll', 'survey']);
export const TARGETS = new Set(['all', 'authenticated']);
export const STATUSES = new Set(['draft', 'published', 'archived']);

export const DEVICE_ID_MAX_LEN = 128; // 對齊 DB CHECK
export const TEXT_RESPONSE_MAX_LEN = 2000;
export const OTHER_TEXT_MAX_LEN = 500; // survey「其他」選項自由填寫上限(對齊前端 AnnouncementSurveyChip)
export const TITLE_MAX_LEN = 200;
export const BODY_MAX_LEN = 10000;

// 預設 anon respond rate limit（per identity 每分鐘上限）
const RESPOND_RATE_PER_MIN = 10;

/**
 * UUID 格式驗證(announcements 系統各 endpoint 共用)
 * @param {unknown} id
 * @returns {boolean}
 */
export function isUuid(id) {
    return typeof id === 'string' && /^[0-9a-fA-F-]{36}$/.test(id);
}

// ---------- 取得公告 ----------

/**
 * 用 service_role 取單筆 announcement（回完整 row 或 null）。
 * 不檢查 status / 時間窗 — 由呼叫端決定要不要過濾。
 *
 * @param {Object} env
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function fetchAnnouncementById(env, id) {
    if (!isUuid(id)) return null;
    const res = await select(
        env,
        `announcements?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    );
    if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) return null;
    return res.data[0];
}

/**
 * 判斷公告是否「當下對 public 開放」（status=published 且時間窗內）。
 * @param {{status?: string, starts_at?: string, ends_at?: string|null}} a
 * @returns {boolean}
 */
export function isAnnouncementActive(a) {
    if (!a || a.status !== 'published') return false;
    const now = Date.now();
    const startsAt = a.starts_at ? Date.parse(a.starts_at) : NaN;
    if (!Number.isFinite(startsAt) || startsAt > now) return false;
    if (a.ends_at) {
        const endsAt = Date.parse(a.ends_at);
        if (Number.isFinite(endsAt) && endsAt <= now) return false;
    }
    return true;
}

// ---------- 輸入驗證 ----------

/**
 * 驗證並標準化建立/更新 announcement 的 payload（給 admin endpoint 用）
 * 不去 enforce 「必填 vs 部分更新」 — 由 caller 決定（POST 全欄；PUT 局部）。
 *
 * @param {any} body
 * @param {{ partial?: boolean }} [opts] partial=true 時所有欄位可選（PUT 用）
 * @returns {{ ok: true, row: Object } | { ok: false, error: string }}
 */
export function buildAnnouncementWritePayload(body, opts = {}) {
    if (!body || typeof body !== 'object') return { ok: false, error: 'invalid_body' };
    const partial = !!opts.partial;
    const row = {};

    if ('type' in body || !partial) {
        if (!TYPES.has(body.type)) return { ok: false, error: 'invalid_type' };
        row.type = body.type;
    }
    if ('title' in body || !partial) {
        const t = typeof body.title === 'string' ? body.title.trim().slice(0, TITLE_MAX_LEN) : '';
        if (!t) return { ok: false, error: 'title_required' };
        row.title = t;
    }
    if ('body' in body) {
        if (body.body === null || body.body === '') {
            row.body = null;
        } else if (typeof body.body === 'string') {
            row.body = body.body.slice(0, BODY_MAX_LEN);
        } else {
            return { ok: false, error: 'invalid_body_field' };
        }
    }
    if ('payload' in body) {
        if (body.payload === null) {
            row.payload = null;
        } else if (typeof body.payload === 'object' && !Array.isArray(body.payload)) {
            row.payload = body.payload;
        } else {
            return { ok: false, error: 'invalid_payload' };
        }
    }
    if ('target_segment' in body || !partial) {
        const seg = body.target_segment ?? 'all';
        if (!TARGETS.has(seg)) return { ok: false, error: 'invalid_target_segment' };
        row.target_segment = seg;
    }
    if ('priority' in body) {
        const p = Number(body.priority);
        if (!Number.isInteger(p) || p < -32768 || p > 32767) {
            return { ok: false, error: 'invalid_priority' };
        }
        row.priority = p;
    }
    if ('starts_at' in body) {
        if (body.starts_at === null) {
            // null → 用 DB default now()，所以乾脆不傳
        } else if (typeof body.starts_at === 'string' && Number.isFinite(Date.parse(body.starts_at))) {
            row.starts_at = body.starts_at;
        } else {
            return { ok: false, error: 'invalid_starts_at' };
        }
    }
    if ('ends_at' in body) {
        if (body.ends_at === null || body.ends_at === '') {
            row.ends_at = null;
        } else if (typeof body.ends_at === 'string' && Number.isFinite(Date.parse(body.ends_at))) {
            row.ends_at = body.ends_at;
        } else {
            return { ok: false, error: 'invalid_ends_at' };
        }
    }
    if ('status' in body || !partial) {
        const s = body.status ?? 'draft';
        if (!STATUSES.has(s)) return { ok: false, error: 'invalid_status' };
        row.status = s;
    }

    return { ok: true, row };
}

/**
 * 驗證 respond endpoint 收到的 choices / text_response 是否合法。
 * 對應 announcement.type:
 *   - announcement: 不接受互動回應 → 一律拒
 *   - poll: choices 必須為陣列；每個 element 必須有 option_id 且存在於 payload.options[]
 *           multi_select=false 時 choices.length 必須 ≤ 1
 *   - survey: choices 為陣列，每個 element { question_id, option_ids?, text? }
 *             question_id 必須在 payload.questions[].id 中；option_ids 對應其 options[].id
 *             text 題型則允許 text 欄位（max len）
 *
 * @param {{ type: string, payload?: any }} announcement
 * @param {{ choices?: any, text_response?: any }} input
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateResponseAgainstAnnouncement(announcement, input) {
    if (!announcement) return { ok: false, error: 'invalid_announcement' };
    const { type, payload } = announcement;
    const { choices, text_response } = input || {};

    if (type === 'announcement') {
        return { ok: false, error: 'announcement_not_responsable' };
    }

    if (type === 'poll') {
        if (!Array.isArray(choices) || choices.length === 0) {
            return { ok: false, error: 'choices_required' };
        }
        const validIds = new Set(
            (payload?.options || []).map((o) => o?.id).filter((s) => typeof s === 'string'),
        );
        if (validIds.size === 0) return { ok: false, error: 'announcement_misconfigured' };
        const seen = new Set();
        for (const c of choices) {
            const oid = typeof c === 'string' ? c : c?.option_id;
            if (typeof oid !== 'string' || !validIds.has(oid)) {
                return { ok: false, error: 'invalid_option_id' };
            }
            if (seen.has(oid)) return { ok: false, error: 'duplicate_option' };
            seen.add(oid);
            // poll 不支援「其他」自由填寫(choices 原封存 DB,不擋會被塞任意欄位)
            if (c && typeof c === 'object' && c.other_text !== undefined) {
                return { ok: false, error: 'invalid_other_text' };
            }
        }
        const multi = payload?.multi_select === true;
        if (!multi && choices.length > 1) return { ok: false, error: 'multi_select_disabled' };
        return { ok: true };
    }

    if (type === 'survey') {
        if (!Array.isArray(choices) || choices.length === 0) {
            // 允許 text_response 作為「整體文字回饋」也存入 text_response 欄位
            if (typeof text_response === 'string' && text_response.trim().length > 0) {
                return { ok: true };
            }
            return { ok: false, error: 'choices_required' };
        }
        const questions = Array.isArray(payload?.questions) ? payload.questions : [];
        const qById = new Map(questions.map((q) => [q?.id, q]).filter(([id]) => typeof id === 'string'));
        if (qById.size === 0) return { ok: false, error: 'announcement_misconfigured' };

        for (const c of choices) {
            if (!c || typeof c !== 'object') return { ok: false, error: 'invalid_choice' };
            const q = qById.get(c.question_id);
            if (!q) return { ok: false, error: 'invalid_question_id' };
            const qType = q.type;
            if (qType === 'single' || qType === 'multi') {
                const ids = Array.isArray(c.option_ids) ? c.option_ids : [];
                if (ids.length === 0) return { ok: false, error: 'option_required' };
                const validIds = new Set(
                    (q.options || []).map((o) => o?.id).filter((s) => typeof s === 'string'),
                );
                const seenIds = new Set();
                for (const oid of ids) {
                    if (typeof oid !== 'string' || !validIds.has(oid)) {
                        return { ok: false, error: 'invalid_option_id' };
                    }
                    // 重複 option_id 會讓統計灌票(poll 分支已防,survey 也要)
                    if (seenIds.has(oid)) return { ok: false, error: 'duplicate_option' };
                    seenIds.add(oid);
                }
                if (qType === 'single' && ids.length > 1) return { ok: false, error: 'single_select_only' };
                // 「其他」選項:勾了 is_other 選項就必須帶非空 other_text;沒勾就不准帶
                const otherIds = new Set(
                    (q.options || [])
                        .filter((o) => o?.is_other === true && typeof o?.id === 'string')
                        .map((o) => o.id),
                );
                const otherSelected = ids.some((oid) => otherIds.has(oid));
                if (otherSelected) {
                    if (typeof c.other_text !== 'string' || c.other_text.trim().length === 0) {
                        return { ok: false, error: 'other_text_required' };
                    }
                    if (c.other_text.length > OTHER_TEXT_MAX_LEN) {
                        return { ok: false, error: 'other_text_too_long' };
                    }
                } else if (c.other_text !== undefined) {
                    return { ok: false, error: 'invalid_other_text' };
                }
            } else if (qType === 'text') {
                if (typeof c.text !== 'string' || c.text.trim().length === 0) {
                    return { ok: false, error: 'text_required' };
                }
                if (c.text.length > TEXT_RESPONSE_MAX_LEN) {
                    return { ok: false, error: 'text_too_long' };
                }
                // text 題不接受 other_text(choices 原封存 DB,不擋會被塞任意大小的欄位)
                if (c.other_text !== undefined) return { ok: false, error: 'invalid_other_text' };
            } else {
                return { ok: false, error: 'invalid_question_type' };
            }
        }
        return { ok: true };
    }

    return { ok: false, error: 'invalid_type' };
}

/**
 * 驗 device_id 長度（對齊 DB CHECK）
 * @param {unknown} device_id
 * @returns {boolean}
 */
export function isValidDeviceId(device_id) {
    if (typeof device_id !== 'string') return false;
    const len = device_id.length;
    return len >= 1 && len <= DEVICE_ID_MAX_LEN;
}

// ---------- Rate limit ----------

/**
 * Per-identity respond rate limit（每分鐘 N 次）
 *
 * 失敗（KV 沒設）→ fail-open，不擋（與 feedback/submit 一致）
 *
 * @param {KVNamespace|undefined} kv
 * @param {string} identity - "ip:1.2.3.4" 或 "dev:abc"
 * @returns {Promise<{ allowed: boolean, current: number, limit: number }>}
 */
export async function checkAndIncrementRespondRateLimit(kv, identity) {
    const limit = RESPOND_RATE_PER_MIN;
    if (!kv || !identity) return { allowed: true, current: 0, limit };
    const minute = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '');
    const key = `announce:respond:${identity}:${minute}`;
    const raw = await kv.get(key);
    const count = parseInt(raw || '0', 10);
    if (count >= limit) {
        return { allowed: false, current: count, limit };
    }
    await kv.put(key, String(count + 1), { expirationTtl: 90 });
    return { allowed: true, current: count + 1, limit };
}

// ---------- 統計 ----------

/**
 * 從一批 responses 統計 poll 結果。
 * @param {Array<{choices: any}>} responses
 * @param {Array<{id: string, label?: string}>} options
 * @returns {{ total: number, options: Array<{id, label, count}> }}
 */
export function summarizePoll(responses, options) {
    const counts = new Map();
    for (const o of options || []) {
        if (typeof o?.id === 'string') counts.set(o.id, 0);
    }
    let total = 0;
    for (const r of responses || []) {
        const choices = Array.isArray(r?.choices) ? r.choices : [];
        if (choices.length === 0) continue;
        total += 1;
        for (const c of choices) {
            const oid = typeof c === 'string' ? c : c?.option_id;
            if (typeof oid === 'string' && counts.has(oid)) {
                counts.set(oid, counts.get(oid) + 1);
            }
        }
    }
    return {
        total,
        options: (options || [])
            .filter((o) => typeof o?.id === 'string')
            .map((o) => ({ id: o.id, label: o.label ?? null, count: counts.get(o.id) || 0 })),
    };
}

/**
 * 統計 survey 結果（option count；text 題目只回 count，內容不公開）。
 * 注意:「其他」選項的 other_text 同樣刻意不進 public 統計(隱私),
 * 只有 admin 端(AnnouncementResultsDialog 前端彙整 raw responses)看得到內容。
 * @param {Array<{choices: any, text_response: string|null}>} responses
 * @param {Array<{id: string, label?: string, type: string, options?: Array<{id, label?}>}>} questions
 * @returns {{ total: number, questions: Array<Object> }}
 */
export function summarizeSurvey(responses, questions) {
    const qList = (questions || []).filter((q) => typeof q?.id === 'string');
    const optionCounts = new Map(); // qId → Map<optionId, count>
    const textCounts = new Map(); // qId → count
    for (const q of qList) {
        if (q.type === 'text') {
            textCounts.set(q.id, 0);
        } else {
            const m = new Map();
            for (const o of q.options || []) {
                if (typeof o?.id === 'string') m.set(o.id, 0);
            }
            optionCounts.set(q.id, m);
        }
    }

    let total = 0;
    for (const r of responses || []) {
        const choices = Array.isArray(r?.choices) ? r.choices : [];
        if (choices.length === 0 && !r?.text_response) continue;
        total += 1;
        for (const c of choices) {
            if (!c || typeof c !== 'object') continue;
            const qId = c.question_id;
            if (typeof qId !== 'string') continue;
            if (textCounts.has(qId)) {
                if (typeof c.text === 'string' && c.text.trim().length > 0) {
                    textCounts.set(qId, textCounts.get(qId) + 1);
                }
            } else if (optionCounts.has(qId)) {
                const m = optionCounts.get(qId);
                for (const oid of Array.isArray(c.option_ids) ? c.option_ids : []) {
                    if (typeof oid === 'string' && m.has(oid)) m.set(oid, m.get(oid) + 1);
                }
            }
        }
    }

    return {
        total,
        questions: qList.map((q) => {
            if (q.type === 'text') {
                return { id: q.id, label: q.label ?? null, type: 'text', count: textCounts.get(q.id) || 0 };
            }
            const m = optionCounts.get(q.id) || new Map();
            return {
                id: q.id,
                label: q.label ?? null,
                type: q.type,
                options: (q.options || [])
                    .filter((o) => typeof o?.id === 'string')
                    .map((o) => ({ id: o.id, label: o.label ?? null, count: m.get(o.id) || 0 })),
            };
        }),
    };
}
