// POST /api/report：匿名回報資料錯誤 → vtuber_reports（open），後台處理。
//
// 類型：vtuber_info（某位 VTuber 的資料）、stream（週表上的單場）、roster（公司名冊）、missing_vtuber（找不到某人）。
// 檢查順序見 functions/lib/submit-guard.js；之後確認被回報的 VTuber／團體存在（避免灌假 ID）。
// 緊急開關：REPORTS_DISABLED=true → 503。
//
// 回應：201 { ok: true } 或 { ok: false, error }

import { jsonResponse, handleOptions } from '../lib/cors.js';
import { insert, select } from '../lib/supabase-server.js';
import { logError } from '../lib/logger.js';
import { guardSubmission } from '../lib/submit-guard.js';
import { validateReport } from '../lib/vtuber-submit.js';

const MAX_BODY_BYTES = 8 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function onRequestPost(context) {
    const { request, env } = context;
    const reply = (data, status) => jsonResponse(data, status, request, NO_STORE);

    const g = await guardSubmission(context, {
        disabledFlag: 'REPORTS_DISABLED',
        maxBytes: MAX_BODY_BYTES,
        validate: validateReport,
        quotas: (ipHash, w) => ({
            personal: [
                { key: `report:h:${ipHash}:${w.hour}`, limit: 10, ttl: 3700 },
                { key: `report:d:${ipHash}:${w.day}`, limit: 30, ttl: 90000 },
            ],
            global: [{ key: `report:g:${w.hour}`, limit: 300, ttl: 3700 }],
        }),
    });
    if (!g.ok) return g.response;
    const v = g.value;

    if (v.vtuberId && !(await exists(env, 'vtubers', v.vtuberId))) return reply({ ok: false, error: 'invalid_target' }, 400);
    if (v.groupId && !(await exists(env, 'vtuber_groups', v.groupId))) return reply({ ok: false, error: 'invalid_target' }, 400);

    const res = await insert(env, 'vtuber_reports', {
        kind: v.kind,
        reasons: v.reasons,
        vtuber_id: v.vtuberId,
        group_id: v.groupId,
        stream_platform: v.streamPlatform,
        stream_external_id: v.streamExternalId,
        description: v.description,
        source_urls: v.sourceUrls,
        contact: v.contact,
        page_url: v.pageUrl,
        ip_hash: g.ipHash,
    });
    if (!res.ok) {
        await logError(env, 'report', 'insert failed', { metadata: { status: res.status, error: res.error?.slice(0, 300) } });
        return reply({ ok: false, error: 'insert_failed' }, 500);
    }
    return reply({ ok: true }, 201);
}

async function exists(env, table, id) {
    const res = await select(env, `${table}?id=eq.${encodeURIComponent(id)}&select=id&limit=1`);
    return res.ok && Array.isArray(res.data) && res.data.length > 0;
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
