// Cloudflare Pages Function: 公告即時統計(public GET)
//
// GET /api/announcements/:id/results
//   :id 來自 Cloudflare Pages Functions 動態路由 [id]
//
// 行為:
//   - 公告必須是 published(否則回 404,不洩漏 draft 內容)
//   - 公告類型 announcement → 回 405(沒有「結果」可看)
//   - poll → { total, options: [{id, label, count}] }
//   - survey → { total, questions: [...] }(text 題只回 count,內容不公開)
//
// 權限:public(任何人可看當下票數;不需登入)
//
// 後端聚合(避免暴露原始 user_id / device_id),用 service_role 抓所有 responses 然後在記憶體統計。
// 為防 OOM 與 abuse,設定 RESPONSES_HARD_LIMIT;超過直接 truncate(極端熱門題目可改 RPC SQL aggregate)。

import { jsonResponse, handleOptions } from '../../../lib/cors.js';
import { select } from '../../../lib/supabase-server.js';
import { logError } from '../../../lib/logger.js';
import {
    fetchAnnouncementById,
    summarizePoll,
    summarizeSurvey,
} from '../../../lib/announcements.js';

const RESPONSES_HARD_LIMIT = 5000;

export async function onRequestGet(context) {
    const { request, env, params } = context;
    const id = params?.id;

    if (typeof id !== 'string' || !/^[0-9a-fA-F-]{36}$/.test(id)) {
        return jsonResponse({ success: false, error: 'invalid_id' }, 400, request);
    }
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ success: false, error: 'server_misconfigured' }, 500, request);
    }

    const announcement = await fetchAnnouncementById(env, id);
    // 必須 published 才公開(draft / archived 一律 404,避免外洩 admin 草稿題目)
    if (!announcement || announcement.status !== 'published') {
        return jsonResponse({ success: false, error: 'not_found' }, 404, request);
    }
    if (announcement.type === 'announcement') {
        return jsonResponse({ success: false, error: 'no_results' }, 405, request);
    }

    // 抓 responses(用 service_role,RLS 不擋)
    const respRes = await select(
        env,
        `announcement_responses?announcement_id=eq.${encodeURIComponent(id)}&select=choices,text_response&limit=${RESPONSES_HARD_LIMIT}`,
    );
    if (!respRes.ok) {
        await logError(env, 'announcements-results', 'fetch responses failed', {
            metadata: { status: respRes.status, error: respRes.error?.slice(0, 500), announcement_id: id },
        });
        return jsonResponse({ success: false, error: 'fetch_failed' }, 500, request);
    }
    const responses = Array.isArray(respRes.data) ? respRes.data : [];

    let summary;
    if (announcement.type === 'poll') {
        summary = summarizePoll(responses, announcement.payload?.options || []);
    } else {
        // survey
        summary = summarizeSurvey(responses, announcement.payload?.questions || []);
    }

    return jsonResponse(
        {
            success: true,
            announcement_id: id,
            type: announcement.type,
            ...summary,
            truncated: responses.length >= RESPONSES_HARD_LIMIT,
        },
        200,
        request,
        { 'Cache-Control': 'public, max-age=15' },
    );
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
