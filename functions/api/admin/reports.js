// Admin：資料回報處理（ADMIN_API_TOKEN，見 lib/auth-helper.js gateAdmin）
//
// GET /api/admin/reports?status=open|resolved|wontfix|duplicate|spam|all&kind=&limit=
//     → 列表（不含 ip_hash），一併帶出被回報的 VTuber（name、slug）與團體名稱
// PUT /api/admin/reports?id=<uuid>  body: { status, admin_notes }
//     → 更新處理狀態；非 open 時記 resolved_at；寫 admin_actions
// POST /api/admin/reports?id=<uuid>&action=apply  body: { fields: {x,facebook,instagram,youtube,twitch,bio}, admin_notes }
//     → 套用「補充資料」（apply_vtuber_report_info，單一交易；同時把回報標為 resolved）。
//       欄位在這裡重新正規化（validateSuggested）；YouTube 讀頻道頁換成 channelId（零配額），
//       Twitch 用 helix/users 換成 broadcaster id。空字串＝清空該社群欄位或簡介。

import { jsonResponse, handleOptions, readJsonBody } from '../../lib/cors.js';
import { select, update, insert, rpc } from '../../lib/supabase-server.js';
import { gateAdmin } from '../../lib/auth-helper.js';
import { logError } from '../../lib/logger.js';
import { isUniqueViolation, postgrestErrorMessage } from '../../lib/submit-guard.js';
import { getTwitchAppToken } from '../../lib/twitch-token.js';
import {
    REPORT_REASONS_BY_KIND,
    SUGGESTED_KEYS,
    isUuid,
    lookupYoutubeChannel,
    parseYoutubeChannelInput,
    validateSuggested,
} from '../../lib/vtuber-submit.js';

const NO_STORE = { 'Cache-Control': 'no-store' };
const STATUSES = ['open', 'resolved', 'wontfix', 'duplicate', 'spam'];
const LIST_COLUMNS =
    'id,kind,reasons,vtuber_id,group_id,stream_platform,stream_external_id,description,suggested,source_urls,contact,page_url,status,admin_notes,resolved_at,created_at,' +
    'vtuber:vtubers(name,slug,x_url,facebook_url,instagram_url,bio,youtube_channel_id,twitch_channel_id),group:vtuber_groups(name)';

// apply_vtuber_report_info 的錯誤碼 → HTTP 狀態
const RPC_ERRORS = {
    not_found: 404,
    not_open: 409,
    no_target: 400,
    no_fields: 400,
    invalid_field: 400,
    youtube_already_set: 409,
    exists: 409,
    twitch_already_set: 409,
    twitch_exists: 409,
};
// 社群欄位 → vtubers 欄位
const SOCIAL_COLUMNS = { x: 'x_url', facebook: 'facebook_url', instagram: 'instagram_url' };

export async function onRequestGet(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'open';
    const kind = url.searchParams.get('kind');
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 200);
    const filters = [
        STATUSES.includes(status) ? `status=eq.${status}` : null,
        kind && REPORT_REASONS_BY_KIND[kind] ? `kind=eq.${kind}` : null,
    ].filter(Boolean).map((f) => `&${f}`).join('');
    const res = await select(env, `vtuber_reports?select=${LIST_COLUMNS}${filters}&order=created_at.desc&limit=${limit}`);
    if (!res.ok) {
        await logError(env, 'admin-reports', 'list failed', { metadata: { status: res.status, error: res.error?.slice(0, 300) } });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }
    return jsonResponse({ ok: true, reports: res.data || [] }, 200, request, NO_STORE);
}

export async function onRequestPut(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const id = new URL(request.url).searchParams.get('id');
    if (!isUuid(id)) return jsonResponse({ ok: false, error: 'invalid_id' }, 400, request);
    const parsed = await readJsonBody(request, 8 * 1024);
    if (!parsed.ok) return parsed.response;

    const status = parsed.body?.status;
    if (!STATUSES.includes(status)) return jsonResponse({ ok: false, error: 'invalid_status' }, 400, request);
    const notes = typeof parsed.body?.admin_notes === 'string' ? parsed.body.admin_notes.trim().slice(0, 1000) : null;

    const before = await select(env, `vtuber_reports?id=eq.${id}&select=status&limit=1`);
    if (before.ok && !before.data?.length) return jsonResponse({ ok: false, error: 'not_found' }, 404, request);
    const beforeStatus = before.ok ? before.data[0].status : null;

    const res = await update(env, 'vtuber_reports', `id=eq.${id}`, {
        status,
        admin_notes: notes || null,
        resolved_at: status === 'open' ? null : new Date().toISOString(),
    });
    if (!res.ok) {
        await logError(env, 'admin-reports', 'update failed', { metadata: { status: res.status, error: res.error?.slice(0, 300) } });
        return jsonResponse({ ok: false, error: 'update_failed' }, 500, request);
    }
    if (!res.data?.length) return jsonResponse({ ok: false, error: 'not_found' }, 404, request);
    const audit = await insert(env, 'admin_actions', {
        actor: 'admin_token',
        action_type: 'review_vtuber_report',
        target_id: id,
        before_status: beforeStatus,
        after_status: status,
        notes: notes ? notes.slice(0, 500) : null,
    });
    if (!audit.ok) await logError(env, 'admin-reports', 'audit insert failed', { metadata: { status: audit.status, error: audit.error?.slice(0, 300) } });
    return jsonResponse({ ok: true, report: res.data[0] }, 200, request, NO_STORE);
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!isUuid(id)) return jsonResponse({ ok: false, error: 'invalid_id' }, 400, request);
    if (url.searchParams.get('action') !== 'apply') return jsonResponse({ ok: false, error: 'invalid_action' }, 400, request);
    const parsed = await readJsonBody(request, 8 * 1024);
    if (!parsed.ok) return parsed.response;

    const built = await buildApplyFields(parsed.body?.fields, env);
    if (built.error) return jsonResponse({ ok: false, error: built.error }, built.status ?? 400, request);
    const notes = typeof parsed.body?.admin_notes === 'string' ? parsed.body.admin_notes.trim().slice(0, 1000) : '';

    const res = await rpc(env, 'apply_vtuber_report_info', { p_id: id, p_fields: built.value, p_notes: notes || null });
    if (!res.ok) {
        const code = postgrestErrorMessage(res.error);
        if (code && RPC_ERRORS[code]) return jsonResponse({ ok: false, error: code }, RPC_ERRORS[code], request);
        // 兩人同時把同一個頻道補給不同 VTuber：先查後寫之間撞到唯一索引
        if (isUniqueViolation(res.error)) return jsonResponse({ ok: false, error: 'exists' }, 409, request);
        await logError(env, 'admin-reports', 'apply failed', { metadata: { status: res.status, error: res.error?.slice(0, 300) } });
        return jsonResponse({ ok: false, error: 'apply_failed' }, 500, request);
    }
    return jsonResponse({ ok: true, result: res.data }, 200, request, NO_STORE);
}

/**
 * 後台送來的欄位 → apply_vtuber_report_info 的 p_fields。
 * 社群與簡介：key 存在才處理，空字串＝清空；YouTube／Twitch：空白＝不處理（只補缺，不能清）。
 * @returns {Promise<{ value: object } | { error: string, status?: number }>}
 */
export async function buildApplyFields(raw, env, deps = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'no_fields' };
    const keys = SUGGESTED_KEYS.filter((k) => k in raw);
    if (!keys.length) return { error: 'no_fields' };
    if (keys.some((k) => typeof raw[k] !== 'string')) return { error: 'invalid_field' };
    const nonEmpty = Object.fromEntries(keys.filter((k) => typeof raw[k] === 'string' && raw[k].trim()).map((k) => [k, raw[k]]));
    const v = Object.keys(nonEmpty).length ? validateSuggested(nonEmpty) : { value: {} };
    if (v.error) return { error: v.error };
    const s = v.value;
    const out = {};
    for (const k of ['x', 'facebook', 'instagram']) if (k in raw) out[SOCIAL_COLUMNS[k]] = s[k] ?? '';
    if ('bio' in raw) out.bio = s.bio ?? '';

    if (s.youtube) {
        const lookup = deps.lookupYoutube ?? lookupYoutubeChannel;
        const found = await lookup(parseYoutubeChannelInput(s.youtube));
        if (!found.ok) return { error: found.error === 'not_found' ? 'youtube_not_found' : 'youtube_fetch_failed', status: found.error === 'not_found' ? 400 : 502 };
        const c = found.channel;
        out.youtube = { channel_id: c.channelId, title: c.title, avatar_url: c.avatarUrl, handle: c.handle };
    }
    if (s.twitch) {
        const user = await (deps.lookupTwitch ?? lookupTwitchUser)(s.twitch, env);
        if (!user.ok) return { error: user.error, status: user.error === 'twitch_not_found' ? 400 : 502 };
        out.twitch = { login: user.login, id: user.id, display_name: user.displayName };
    }
    return Object.keys(out).length ? { value: out } : { error: 'no_fields' };
}

/** Twitch login → { id, login, displayName }（helix/users，app token） */
async function lookupTwitchUser(login, env) {
    if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return { ok: false, error: 'twitch_fetch_failed' };
    try {
        const token = await getTwitchAppToken(env);
        const res = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, {
            headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return { ok: false, error: 'twitch_fetch_failed' };
        const u = (await res.json())?.data?.[0];
        if (!u?.id) return { ok: false, error: 'twitch_not_found' };
        return { ok: true, id: String(u.id), login: String(u.login).toLowerCase(), displayName: u.display_name ?? null };
    } catch {
        return { ok: false, error: 'twitch_fetch_failed' };
    }
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, PUT, POST, OPTIONS' });
}
