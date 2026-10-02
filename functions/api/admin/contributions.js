// Admin：VTuber 投稿審核（ADMIN_API_TOKEN，見 lib/auth-helper.js gateAdmin）
//
// GET  /api/admin/contributions?status=pending|approved|rejected|all&limit=  → 列表（不含 ip_hash）
// POST /api/admin/contributions?id=<uuid>&action=approve  body: { overrides }  → 呼叫 approve_vtuber_contribution（單一交易）
// POST /api/admin/contributions?id=<uuid>&action=reject   body: { notes }      → 只改 pending 的；寫 admin_actions
//
// overrides 是審核時修改過的欄位（白名單、與投稿同樣的格式檢查），覆蓋投稿 payload。
// 有 Twitch 帳號時先用 helix/users 查 broadcaster id，以 overrides.twitch_id 傳給 RPC 寫入 vtuber_channels.external_id，
// 週表下一輪就會追蹤（twitch_id 不在白名單裡，只能由這裡設定）。

import { jsonResponse, handleOptions, readJsonBody } from '../../lib/cors.js';
import { select, update, insert, rpc } from '../../lib/supabase-server.js';
import { gateAdmin } from '../../lib/auth-helper.js';
import { logError } from '../../lib/logger.js';
import { isUniqueViolation, postgrestErrorMessage } from '../../lib/submit-guard.js';
import { lookupTwitchUser, twitchLookupStatus } from '../../lib/twitch-users.js';
import { NATIONALITIES, LIMITS, normalizeSocial, normalizeHttpUrl, isUuid } from '../../lib/vtuber-submit.js';

const MAX_BODY_BYTES = 16 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };
const STATUSES = ['pending', 'approved', 'rejected'];
const LIST_COLUMNS =
    'id,action,payload,status,submitted_by,submitter_contact,source_urls,source_note,auto_check,reviewer_notes,reviewed_at,created_at,youtube_channel_id,target_vtuber_id';
const GROUP_KINDS = ['agency', 'circle', 'personal', 'unverified'];

// approve_vtuber_contribution 的錯誤碼 → HTTP 狀態
const RPC_ERRORS = {
    not_found: 404,
    not_pending: 409,
    exists: 409,
    twitch_exists: 409,
    group_exists: 409,
    group_unresolved: 400,
    unsupported_action: 400,
    group_not_found: 400,
    invalid_name: 400,
    invalid_twitch_id: 400,
};

export async function onRequestGet(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'pending';
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 200);
    const filter = STATUSES.includes(status) ? `&status=eq.${status}` : '';
    const res = await select(env, `vtuber_contributions?select=${LIST_COLUMNS}${filter}&order=created_at.desc&limit=${limit}`);
    if (!res.ok) {
        await logError(env, 'admin-contributions', 'list failed', { metadata: { status: res.status, error: res.error?.slice(0, 300) } });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }
    return jsonResponse({ ok: true, contributions: res.data || [] }, 200, request, NO_STORE);
}

export async function onRequestPost(context, deps = {}) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const action = url.searchParams.get('action');
    if (!isUuid(id)) return jsonResponse({ ok: false, error: 'invalid_id' }, 400, request);

    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if (!parsed.ok) return parsed.response;

    if (action === 'approve') {
        const ov = validateOverrides(parsed.body?.overrides ?? {});
        if (ov.error) return jsonResponse({ ok: false, error: ov.error }, 400, request);
        const tw = await resolveTwitchId(env, id, ov.value, deps);
        if (tw.error) return jsonResponse({ ok: false, error: tw.error }, tw.status, request);
        const overrides = tw.id ? { ...ov.value, twitch_id: tw.id } : ov.value;
        const res = await rpc(env, 'approve_vtuber_contribution', { p_id: id, p_overrides: overrides });
        if (!res.ok) {
            const code = postgrestErrorMessage(res.error);
            if (code && RPC_ERRORS[code]) return jsonResponse({ ok: false, error: code }, RPC_ERRORS[code], request);
            // 查好 id 之後、寫入之前，同一個 Twitch 帳號被別筆核准／回報搶先寫入（部分唯一索引）
            if (isUniqueViolation(res.error)) return jsonResponse({ ok: false, error: tw.id ? 'twitch_exists' : 'exists' }, 409, request);
            await logError(env, 'admin-contributions', 'approve failed', { metadata: { status: res.status, error: res.error?.slice(0, 300) } });
            return jsonResponse({ ok: false, error: 'approve_failed' }, 500, request);
        }
        return jsonResponse({ ok: true, result: res.data }, 200, request, NO_STORE);
    }

    if (action === 'reject') {
        const notes = typeof parsed.body?.notes === 'string' ? parsed.body.notes.trim().slice(0, 500) : '';
        const res = await update(env, 'vtuber_contributions', `id=eq.${id}&status=eq.pending`, {
            status: 'rejected',
            reviewer_notes: notes || null,
            reviewed_at: new Date().toISOString(),
        });
        if (!res.ok) {
            await logError(env, 'admin-contributions', 'reject failed', { metadata: { status: res.status, error: res.error?.slice(0, 300) } });
            return jsonResponse({ ok: false, error: 'reject_failed' }, 500, request);
        }
        if (!res.data?.length) return jsonResponse({ ok: false, error: 'not_pending' }, 409, request);
        const audit = await insert(env, 'admin_actions', {
            actor: 'admin_token',
            action_type: 'review_vtuber_contribution',
            target_id: id,
            decision: 'reject',
            before_status: 'pending',
            after_status: 'rejected',
            notes: notes || null,
        });
        if (!audit.ok) await logError(env, 'admin-contributions', 'audit insert failed', { metadata: { status: audit.status, error: audit.error?.slice(0, 300) } });
        return jsonResponse({ ok: true }, 200, request, NO_STORE);
    }

    return jsonResponse({ ok: false, error: 'invalid_action' }, 400, request);
}

/**
 * 核准時實際要掛的 Twitch login（overrides 優先，否則投稿 payload）→ broadcaster id。
 * 沒有 Twitch、或投稿不存在（交給 RPC 回 not_found）時回 { id: null }。
 * @returns {Promise<{ id: string|null } | { error: string, status: number }>}
 */
export async function resolveTwitchId(env, id, overrides, deps = {}) {
    let login = overrides.twitch_login;
    if (login === undefined) {
        const res = await select(env, `vtuber_contributions?id=eq.${id}&select=twitch_login:payload->>twitch_login&limit=1`);
        if (!res.ok) {
            await logError(env, 'admin-contributions', 'payload fetch failed', { metadata: { status: res.status, error: res.error?.slice(0, 300) } });
            return { error: 'approve_failed', status: 500 };
        }
        login = res.data?.[0]?.twitch_login;
    }
    login = typeof login === 'string' ? login.trim().toLowerCase() : '';
    if (!login) return { id: null };
    const user = await (deps.lookupTwitch ?? lookupTwitchUser)(login, env);
    if (!user.ok) return { error: user.error, status: twitchLookupStatus(user.error) };
    // helix 依 login 查（不分大小寫）；回來的 login 不同代表查錯人，寧可擋下
    if (user.login !== login) return { error: 'twitch_not_found', status: 400 };
    return { id: user.id };
}

/** 審核時可覆蓋的欄位（白名單＋格式檢查，與投稿端點一致） */
export function validateOverrides(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'invalid_overrides' };
    const out = {};
    const text = (v) => (typeof v === 'string' ? v.trim() : '');

    if ('name' in raw) {
        const name = text(raw.name);
        if (!name || name.length > LIMITS.name) return { error: 'invalid_name' };
        out.name = name;
    }
    if ('nationality' in raw) {
        if (!NATIONALITIES.includes(raw.nationality)) return { error: 'invalid_nationality' };
        out.nationality = raw.nationality;
    }
    if ('bio' in raw) {
        const bio = text(raw.bio);
        if (bio.length > LIMITS.bio) return { error: 'invalid_bio' };
        out.bio = bio;
    }
    if ('avatar_url' in raw) {
        const a = text(raw.avatar_url);
        const u = a ? normalizeHttpUrl(a) : '';
        if (a && (!u || !u.startsWith('https://'))) return { error: 'invalid_avatar' };
        out.avatar_url = u;
    }
    for (const [key, kind] of [['x_url', 'x'], ['facebook_url', 'facebook'], ['instagram_url', 'instagram'], ['twitch_login', 'twitch']]) {
        if (!(key in raw)) continue;
        const r = normalizeSocial(kind, raw[key]);
        if (r.error) return { error: r.error };
        out[key] = r.value ?? '';
    }
    if ('affiliation_type' in raw) {
        if (!['personal', 'agency', 'circle'].includes(raw.affiliation_type)) return { error: 'invalid_group' };
        out.affiliation_type = raw.affiliation_type;
    }
    if ('group_name' in raw) {
        // 審核者改寫的團體名稱：核准函式只自動對到名稱相同的既有團體（對不到 group_unresolved）
        const name = text(raw.group_name);
        if (name.length > LIMITS.groupName) return { error: 'invalid_group' };
        out.group_name = name;
    }
    if ('group_id' in raw) {
        if (raw.group_id !== null && raw.group_id !== '' && !isUuid(raw.group_id)) return { error: 'invalid_group' };
        out.group_id = raw.group_id || '';
    }
    if ('new_group' in raw && raw.new_group) {
        const g = raw.new_group;
        const name = text(g.name);
        if (!name || name.length > LIMITS.groupName) return { error: 'invalid_group' };
        if (g.kind && !GROUP_KINDS.includes(g.kind)) return { error: 'invalid_group' };
        if (g.nationality && !NATIONALITIES.includes(g.nationality)) return { error: 'invalid_group' };
        out.new_group = { name, kind: g.kind || 'unverified', nationality: g.nationality || null };
        out.group_id = ''; // 新建團體時不沿用投稿選的既有團體
    }
    if ('reviewer_notes' in raw) out.reviewer_notes = text(raw.reviewer_notes).slice(0, 500);
    return { value: out };
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, POST, OPTIONS' });
}
