// POST /api/schedule/entries：匿名投稿某位 VTuber 的「本週週表」（手動表格）→ vtuber_contributions（action='schedule'、pending），
// 後台核准（approve_schedule_contribution）才寫進 streams。
//
// 檢查順序見 functions/lib/submit-guard.js；之後在伺服器端確認 VTuber 存在且未畢業、查重：
//   不存在／已畢業 → 404 vtuber_not_found
//   已有待審 → 409 pending_exists（資料庫也有部分唯一索引 vtuber_contributions_pending_schedule_uq 兜底）
// 只存雜湊 IP（ip_hash、submitted_by='anon:<前 16 碼>'），不存原始 IP。
// 緊急開關：SUBMISSIONS_DISABLED=true → 503（與 VTuber 投稿共用）。
//
// 回應：201 { ok: true, id } 或 { ok: false, error }

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { insert, select } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';
import { guardSubmission, isUniqueViolation } from '../../lib/submit-guard.js';
import { validateScheduleEntries } from '../../lib/schedule-submit.js';

const MAX_BODY_BYTES = 16 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function onRequestPost(context) {
    const { request, env } = context;
    const reply = (data, status) => jsonResponse(data, status, request, NO_STORE);

    const g = await guardSubmission(context, {
        disabledFlag: 'SUBMISSIONS_DISABLED',
        maxBytes: MAX_BODY_BYTES,
        validate: (body) => validateScheduleEntries(body),
        quotas: (ipHash, w) => ({
            personal: [
                { key: `sched:h:${ipHash}:${w.hour}`, limit: 3, ttl: 3700 },
                { key: `sched:d:${ipHash}:${w.day}`, limit: 10, ttl: 90000 },
            ],
            global: [{ key: `sched:g:${w.hour}`, limit: 100, ttl: 3700 }],
        }),
    });
    if (!g.ok) return g.response;
    const v = g.value;
    const id = encodeURIComponent(v.vtuberId);

    const [vt, pend] = await Promise.all([
        select(env, `vtubers?id=eq.${id}&select=id,slug,name,activity&limit=1`),
        select(env, `vtuber_contributions?target_vtuber_id=eq.${id}&action=eq.schedule&status=eq.pending&select=id&limit=1`),
    ]);
    if (!vt.ok || !pend.ok) {
        const bad = !vt.ok ? vt : pend;
        await logError(env, 'schedule-entries', 'lookup failed', { metadata: { status: bad.status, error: bad.error?.slice(0, 300) } });
        return reply({ ok: false, error: 'insert_failed' }, 500);
    }
    const person = vt.data?.[0];
    if (!person || person.activity === 'graduate') return reply({ ok: false, error: 'vtuber_not_found' }, 404);
    if (pend.data?.length) return reply({ ok: false, error: 'pending_exists' }, 409);

    const payload = {
        vtuber_id: person.id,
        // 後台列表直接顯示，不必再查 vtubers
        vtuber_name: person.name ?? null,
        vtuber_slug: person.slug ?? null,
        platform: 'youtube',
        entries: v.entries,
        note: v.note,
        source: 'user',
    };
    const row = {
        action: 'schedule',
        status: 'pending',
        target_vtuber_id: person.id,
        payload,
        submitted_by: `anon:${g.ipHash.slice(0, 16)}`,
        submitter_contact: v.contact,
        source_note: v.note,
        ip_hash: g.ipHash,
    };

    const res = await insert(env, 'vtuber_contributions', row);
    if (!res.ok) {
        if (isUniqueViolation(res.error)) return reply({ ok: false, error: 'pending_exists' }, 409);
        await logError(env, 'schedule-entries', 'insert failed', { metadata: { status: res.status, error: res.error?.slice(0, 300) } });
        return reply({ ok: false, error: 'insert_failed' }, 500);
    }
    return reply({ ok: true, id: res.data?.[0]?.id ?? null }, 201);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
