// Cloudflare Pages Function：Admin 審核 VTuber 活動
//
// POST { id, action: 'approve'|'reject', notes?: string }
// 直接修改 vtuber_events.status

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest, requireAdminTrust } from '../../lib/auth-helper.js';
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
    const gate = await requireAdminTrust(env, userId);
    if (!gate.allowed) {
        const status = gate.reason === 'unauthenticated' ? 401 : 403;
        return jsonResponse({ success: false, error: gate.reason }, status, request);
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

    const fetchRes = await select(
        env,
        `vtuber_events?id=eq.${encodeURIComponent(id)}&select=status&limit=1`,
    );
    if (!fetchRes.ok || !Array.isArray(fetchRes.data) || fetchRes.data.length === 0) {
        return jsonResponse({ success: false, error: '找不到活動' }, 404, request);
    }
    if (fetchRes.data[0].status !== 'pending') {
        return jsonResponse({ success: false, error: '此活動已被審核' }, 409, request);
    }

    const patch = {
        status: action === 'approve' ? 'approved' : 'rejected',
        // 把 reviewer notes 寫到 metadata.reviewer_notes（vtuber_events 沒有獨立欄位）
        metadata: {
            reviewer_notes: trimStr(notes, 500) || null,
            reviewed_at: new Date().toISOString(),
            reviewed_by: userId,
        },
        updated_at: new Date().toISOString(),
    };
    const updateRes = await update(
        env,
        'vtuber_events',
        `id=eq.${encodeURIComponent(id)}`,
        patch,
    );
    if (!updateRes.ok) {
        await logError(env, 'review-event', 'update vtuber_events failed', {
            metadata: { status: updateRes.status, error: updateRes.error?.slice(0, 500), target_id: id },
            userId,
        });
        return jsonResponse({ success: false, error: '更新狀態失敗' }, 500, request);
    }

    // Audit log（best-effort）
    const auditRes = await insert(env, 'admin_actions', {
        admin_user_id: userId,
        action_type: 'review_vtuber_event',
        target_id: id,
        decision: action,
        before_status: 'pending',
        after_status: patch.status,
        notes: trimStr(notes, 500) || null,
    });
    if (!auditRes.ok) {
        await logWarn(env, 'review-event', 'admin_actions insert failed', {
            metadata: { status: auditRes.status, error: auditRes.error?.slice(0, 500), target_id: id },
            userId,
        });
    }

    return jsonResponse({
        success: true,
        status: patch.status,
    }, 200, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
