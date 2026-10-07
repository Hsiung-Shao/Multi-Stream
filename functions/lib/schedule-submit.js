// 使用者投稿「本週週表」（手動表格）的驗證（純函式，方便測試）。
// 端點：functions/api/schedule/entries.js（投稿）、functions/api/admin/contributions.js（核准時審核者改過的列）。
// 時間一律以台北時間（固定 +8，台灣無日光節約）解讀；核准函式 approve_schedule_contribution 也以 Asia/Taipei 寫入 streams。

import { LIMITS, isUuid } from './vtuber-submit.js';

export const SCHEDULE_LIMITS = {
    entries: 7,
    /** 核准端：自動解析的週表可能一天多場，與 approve_schedule_contribution 的上限（14）一致 */
    adminEntries: 14,
    title: 80,
    pastDays: 1,
    futureDays: 10,
};
export const SCHEDULE_PLATFORMS = ['youtube', 'twitch'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// 標題是單行文字：連換行一起去掉（之後會顯示在公開週表）
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;
const DAY_MS = 86_400_000;

/** 台北日期 YYYY-MM-DD（同 supabase/functions/_shared/snapshot.ts 的 taipeiDate） */
export function taipeiDate(now) {
    return new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
}

/** YYYY-MM-DD 加減天數（以 UTC 正午運算，不受執行環境時區影響） */
function shiftDate(ymd, days) {
    return new Date(Date.parse(`${ymd}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 字串是否為真實存在的日期（擋 2026-02-30 這種） */
function isRealDate(s) {
    if (!DATE_RE.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * 週表列驗證與正規化。
 * @param {unknown} raw
 * @param {number} now
 * @param {{ max?: number, pastDays?: number, futureDays?: number }} [opts]
 * @returns {{ value: {date:string,time:string,title:string,platform:'youtube'|'twitch'}[] } | { error: string }}
 */
export function validateEntries(raw, now = Date.now(), opts = {}) {
    const max = opts.max ?? SCHEDULE_LIMITS.entries;
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > max) return { error: 'invalid_entries' };
    const today = taipeiDate(now);
    const minDate = shiftDate(today, -(opts.pastDays ?? SCHEDULE_LIMITS.pastDays));
    const maxDate = shiftDate(today, opts.futureDays ?? SCHEDULE_LIMITS.futureDays);
    const seen = new Set();
    const out = [];
    for (const e of raw) {
        if (!e || typeof e !== 'object' || Array.isArray(e)) return { error: 'invalid_entries' };
        const date = typeof e.date === 'string' ? e.date.trim() : '';
        // YYYY-MM-DD 字串可直接比大小
        if (!isRealDate(date) || date < minDate || date > maxDate) return { error: 'invalid_entry_date' };
        const time = typeof e.time === 'string' ? e.time.trim() : '';
        if (!TIME_RE.test(time)) return { error: 'invalid_entry_time' };
        const title = typeof e.title === 'string' ? e.title.replace(CONTROL_CHARS, '').trim() : '';
        if (!title || title.length > SCHEDULE_LIMITS.title) return { error: 'invalid_entry_title' };
        const platform = e.platform == null || e.platform === '' ? 'youtube' : e.platform;
        if (!SCHEDULE_PLATFORMS.includes(platform)) return { error: 'invalid_entries' };
        const key = `${date} ${time}`;
        if (seen.has(key)) return { error: 'invalid_entries' };
        seen.add(key);
        out.push({ date, time, title, platform });
    }
    out.sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
    return { value: out };
}

/**
 * 投稿表單驗證（turnstileToken 由 guardSubmission 處理；VTuber 是否存在由端點查詢）。
 * @returns {{ value: { vtuberId: string, entries: object[], note: string|null, contact: string|null } } | { error: string }}
 */
export function validateScheduleEntries(body, now = Date.now()) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'invalid_body' };
    const vtuberId = typeof body.vtuberId === 'string' ? body.vtuberId.trim() : '';
    if (!isUuid(vtuberId)) return { error: 'invalid_vtuber' };

    const entries = validateEntries(body.entries, now);
    if (entries.error) return entries;

    if (body.note != null && typeof body.note !== 'string') return { error: 'invalid_note' };
    const note = (body.note ?? '').trim();
    if (note.length > LIMITS.note) return { error: 'invalid_note' };
    if (body.contact != null && typeof body.contact !== 'string') return { error: 'invalid_contact' };
    const contact = (body.contact ?? '').trim();
    if (contact.length > LIMITS.contact) return { error: 'invalid_contact' };

    return { value: { vtuberId: vtuberId.toLowerCase(), entries: entries.value, note: note || null, contact: contact || null } };
}
