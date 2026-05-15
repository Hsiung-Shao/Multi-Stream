// Cloudflare Pages Function: 取得當下「published 且時間窗內」的公告列表
//
// GET /api/announcements/active
//
// 行為:
//   - 任何人(anon / authenticated)都可呼叫
//   - 過濾 target_segment:
//       匿名 → 只回 segment='all'
//       已登入 → 回 segment in ('all', 'authenticated')
//   - 排序:priority DESC, starts_at DESC
//   - 上限:20 筆(避免被一次抓爆)
//   - 回應內容刻意不含 created_by(不洩漏 admin user_id)
//
// 實作走 service_role(因為 RLS 雖然允許 anon SELECT,但仍要繞過「無 anon key」場景):
//   service_role 直接查 PostgREST,自己組 published+時間窗+segment 過濾。

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest } from '../../lib/auth-helper.js';
import { select } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';

const HARD_LIMIT = 20;

export async function onRequestGet(context) {
    const { request, env } = context;

    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ success: false, error: 'server_misconfigured' }, 500, request);
    }

    // anon 也允許,只是 segment 範圍變窄
    const { userId } = await getUserIdFromRequest(request, env);
    const isAuthed = !!userId;

    // PostgREST 過濾:
    //   status=eq.published
    //   starts_at=lte.<now>
    //   or=(ends_at.is.null,ends_at.gt.<now>)
    //   target_segment=in.(...)
    // 排序:priority desc, starts_at desc
    const nowIso = new Date().toISOString();
    const segments = isAuthed ? 'all,authenticated' : 'all';
    const segmentFilter = `target_segment=in.(${segments})`;
    const query = [
        'select=id,type,title,body,payload,target_segment,priority,starts_at,ends_at',
        'status=eq.published',
        `starts_at=lte.${encodeURIComponent(nowIso)}`,
        `or=(ends_at.is.null,ends_at.gt.${encodeURIComponent(nowIso)})`,
        segmentFilter,
        'order=priority.desc,starts_at.desc',
        `limit=${HARD_LIMIT}`,
    ].join('&');

    const result = await select(env, `announcements?${query}`);
    if (!result.ok) {
        await logError(env, 'announcements-active', 'select failed', {
            metadata: { status: result.status, error: result.error?.slice(0, 500) },
        });
        return jsonResponse({ success: false, error: 'fetch_failed' }, 500, request);
    }

    return jsonResponse(
        { success: true, announcements: result.data || [] },
        200,
        request,
        // 短 TTL 讓 CDN/瀏覽器快取吸收高頻 polling,但不至於拖延 publish 生效
        { 'Cache-Control': 'public, max-age=30' },
    );
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
