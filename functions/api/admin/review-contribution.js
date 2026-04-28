// Cloudflare Pages Function：Admin 審核 VTuber 投稿
//
// 接受 POST { id, action: 'approve'|'reject', notes?: string }
// 行為：
// - approve：把 vtuber_contributions.status 設為 'approved'，若 action='add' 也同步建立 vtubers row
// - reject：status='rejected'，可選 notes
// 雙重保險：前端呼叫前要先過 check-permission，後端再驗一次 trust_level

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest, getTrustLevel } from '../../lib/auth-helper.js';
import { update, select, insert } from '../../lib/supabase-server.js';
import { logWarn, logError } from '../../lib/logger.js';

const MAX_BODY_BYTES = 4 * 1024;

function trimStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max);
}

export async function onRequestPost(context) {
    const { request, env } = context;

    const { userId } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ success: false, error: 'unauthenticated' }, 401, request);
    }
    const trust = await getTrustLevel(env, userId);
    if (trust !== 'admin' && trust !== 'moderator') {
        return jsonResponse({ success: false, error: 'forbidden' }, 403, request);
    }

    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
        return jsonResponse({ success: false, error: 'Invalid Content-Type' }, 400, request);
    }
    const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (contentLength > MAX_BODY_BYTES) {
        return jsonResponse({ success: false, error: 'Body too large' }, 413, request);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ success: false, error: '無效的 JSON' }, 400, request);
    }

    const { id, action, notes } = body || {};
    if (!id || typeof id !== 'string') {
        return jsonResponse({ success: false, error: 'id 必填' }, 400, request);
    }
    if (action !== 'approve' && action !== 'reject') {
        return jsonResponse({ success: false, error: 'action 必須為 approve/reject' }, 400, request);
    }

    // 1. 取得待審核紀錄
    const fetchRes = await select(
        env,
        `vtuber_contributions?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    );
    if (!fetchRes.ok || !Array.isArray(fetchRes.data) || fetchRes.data.length === 0) {
        return jsonResponse({ success: false, error: '找不到紀錄' }, 404, request);
    }
    const contribution = fetchRes.data[0];
    if (contribution.status !== 'pending') {
        return jsonResponse({ success: false, error: '此紀錄已被審核' }, 409, request);
    }

    // 2. approve action='add' 時建立 vtubers row
    let createdVtuberId = null;
    if (action === 'approve' && contribution.action === 'add') {
        const payload = contribution.payload || {};
        const vtuberRow = {
            name: payload.name,
            img_url: payload.img_url || payload.imgUrl || null,
            activity: payload.activity || 'active',
            nationality: payload.nationality || 'OTHER',
            group_id: payload.group_id || payload.groupId || null,
            youtube_channel_id: payload.youtube_channel_id || payload.youtubeChannelId || null,
            twitch_channel_id: payload.twitch_channel_id || payload.twitchChannelId || null,
            debut_date: payload.debut_date || payload.debutDate || null,
            channel_id_verified: false,
            contributed_by: contribution.submitted_by,
        };
        const createRes = await insert(env, 'vtubers', vtuberRow);
        if (!createRes.ok) {
            await logError(env, 'review-contribution', 'insert vtubers failed', {
                metadata: { status: createRes.status, error: createRes.error?.slice(0, 500), contribution_id: id },
                userId,
            });
            return jsonResponse({ success: false, error: '建立 VTuber 失敗' }, 500, request);
        }
        createdVtuberId = Array.isArray(createRes.data) ? createRes.data[0]?.id : null;
    }
    // edit / delete 的 apply 由 admin 前端 (VTuberRepository.applyContribution) 完成
    // 這個 endpoint 主要負責標記審核狀態與 add 流程

    // 3. 更新 contribution 狀態
    const patch = {
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewer_notes: trimStr(notes, 500) || null,
        reviewed_at: new Date().toISOString(),
    };
    const updateRes = await update(
        env,
        'vtuber_contributions',
        `id=eq.${encodeURIComponent(id)}`,
        patch,
    );
    if (!updateRes.ok) {
        await logError(env, 'review-contribution', 'update vtuber_contributions failed', {
            metadata: { status: updateRes.status, error: updateRes.error?.slice(0, 500), target_id: id },
            userId,
        });
        return jsonResponse({ success: false, error: '更新狀態失敗' }, 500, request);
    }

    // 4. Audit log（best-effort）
    const auditRes = await insert(env, 'admin_actions', {
        admin_user_id: userId,
        action_type: 'review_vtuber_contribution',
        target_id: id,
        decision: action,
        before_status: 'pending',
        after_status: patch.status,
        notes: patch.reviewer_notes,
        metadata: createdVtuberId ? { created_vtuber_id: createdVtuberId, contribution_action: contribution.action } : { contribution_action: contribution.action },
    });
    if (!auditRes.ok) {
        await logWarn(env, 'review-contribution', 'admin_actions insert failed', {
            metadata: { status: auditRes.status, error: auditRes.error?.slice(0, 500), target_id: id },
            userId,
        });
    }

    return jsonResponse({
        success: true,
        status: patch.status,
        vtuber_id: createdVtuberId,
    }, 200, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
