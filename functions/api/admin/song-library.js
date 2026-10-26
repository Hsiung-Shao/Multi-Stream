// Cloudflare Pages Function: Admin 歌曲整理（歌曲本體 songs 的搜尋／合併／拆開／改名／配對）
//
// 全部以 ADMIN_API_TOKEN 驗證(X-Admin-Token header,見 lib/auth-helper.js gateAdmin),回應一律 no-store。
// 每個請求只打一次 RPC(單一交易、單一 subrequest);驗證失敗(400)不會發出任何 DB 請求。
//
// GET  /api/admin/song-library?q=xxx            → rpc admin_search_songs(p_query, p_limit)
// GET  /api/admin/song-library?view=duplicates  → rpc admin_song_duplicates(同名鍵疑似重複)
// GET  /api/admin/song-library?id=12            → rpc admin_get_song(p_song_id)
// POST ?action=merge   body { source, target, allow_artist_mismatch? }  → rpc admin_merge_songs
// POST ?action=split   body { segment_id }                              → rpc admin_split_segment
// POST ?action=rename  body { id, title, artist? }                      → rpc admin_rename_song
// POST ?action=match   body { items: [{ segment_id?, title, original_artist }] } → rpc admin_match_songs(≤200 項)
//
// 回應:{ ok: true, data: <RPC 結果> } 或 { ok: false, error }

import { jsonResponse, handleOptions, readJsonBody } from '../../lib/cors.js';
import { rpc } from '../../lib/supabase-server.js';
import { gateAdmin } from '../../lib/auth-helper.js';
import { logError, logWarn } from '../../lib/logger.js';
import {
    SEARCH_LIMIT,
    SEARCH_QUERY_MAX,
    parseQueryId,
    parseMergeBody,
    parseSplitBody,
    parseRenameBody,
    parseMatchBody,
} from '../../lib/song-library.js';

const MAX_BODY_BYTES = 128 * 1024; // 200 項配對 × 約 400 bytes 仍遠低於此
const NO_STORE = { 'Cache-Control': 'no-store' };
const SOURCE = 'admin-song-library';

// DB 函式 raise exception 的訊息 → HTTP 狀態（訊息即錯誤代碼）
const ERROR_STATUS = {
    song_not_found: 404,
    segment_not_found: 404,
    same_song: 400,
    artist_mismatch: 400,
    invalid_items: 400,
    invalid_title: 400,
    too_many_items: 400,
    key_taken: 409,
    already_single: 409,
};

function pgMessage(res) {
    try {
        return String(JSON.parse(res.error || '')?.message ?? '');
    } catch {
        return '';
    }
}

function misconfigured(env) {
    return !env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY;
}

/** 呼叫 RPC 並對應錯誤:成功回 { data },失敗回 { response } */
async function callRpc(context, fn, args) {
    const { request, env } = context;
    if (misconfigured(env)) {
        return { response: jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request) };
    }
    const res = await rpc(env, fn, args);
    if (res.ok) return { data: res.data };

    const message = pgMessage(res);
    const known = Object.keys(ERROR_STATUS).find((code) => message === code || message.includes(code));
    if (known) return { response: jsonResponse({ ok: false, error: known }, ERROR_STATUS[known], request) };

    await logError(env, SOURCE, `${fn} failed`, {
        metadata: { status: res.status, error: res.error?.slice(0, 500) },
    });
    return { response: jsonResponse({ ok: false, error: 'library_failed' }, 500, request) };
}

async function respond(context, fn, args) {
    const out = await callRpc(context, fn, args);
    if (out.response) return out.response;
    return jsonResponse({ ok: true, data: out.data }, 200, context.request, NO_STORE);
}

// ---------- GET ----------

export async function onRequestGet(context) {
    const { request } = context;
    const gate = gateAdmin(request, context.env);
    if (!gate.ok) return gate.response;

    const params = new URL(request.url).searchParams;

    if (params.has('id')) {
        const id = parseQueryId(params.get('id'));
        if (id === null) return jsonResponse({ ok: false, error: 'invalid_id' }, 400, request);
        return respond(context, 'admin_get_song', { p_song_id: id });
    }
    if (params.get('view') === 'duplicates') {
        return respond(context, 'admin_song_duplicates', {});
    }
    if (params.has('q')) {
        const q = (params.get('q') || '').trim();
        if (q.length > SEARCH_QUERY_MAX) return jsonResponse({ ok: false, error: 'invalid_query' }, 400, request);
        return respond(context, 'admin_search_songs', { p_query: q, p_limit: SEARCH_LIMIT });
    }
    return jsonResponse({ ok: false, error: 'invalid_query' }, 400, request);
}

// ---------- POST ----------

const PARSERS = {
    merge: parseMergeBody,
    split: parseSplitBody,
    rename: parseRenameBody,
    match: parseMatchBody,
};

export async function onRequestPost(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const action = new URL(request.url).searchParams.get('action');
    const parse = Object.hasOwn(PARSERS, action) ? PARSERS[action] : null;
    if (!parse) return jsonResponse({ ok: false, error: 'invalid_action' }, 400, request);

    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if (!parsed.ok) return parsed.response;
    const checked = parse(parsed.body);
    if (checked.error) return jsonResponse({ ok: false, error: checked.error }, 400, request);
    const v = checked.value;

    if (action === 'merge') {
        const out = await callRpc(context, 'admin_merge_songs', {
            p_source: v.source,
            p_target: v.target,
            p_allow_artist_mismatch: v.allowArtistMismatch,
        });
        if (out.response) return out.response;
        // 合併會把片段與鍵搬到 target、刪掉 source;留下搬動清單,出事時可手動還原
        const done = context.waitUntil ? (p) => context.waitUntil(p) : (p) => void p;
        done(
            logWarn(env, SOURCE, 'songs merged', {
                metadata: {
                    source: v.source,
                    target: v.target,
                    allow_artist_mismatch: v.allowArtistMismatch,
                    moved_segment_ids: out.data?.moved_segment_ids ?? [],
                    moved_keys: out.data?.moved_keys ?? null,
                },
            }),
        );
        return jsonResponse({ ok: true, data: out.data }, 200, request, NO_STORE);
    }
    if (action === 'split') return respond(context, 'admin_split_segment', { p_segment_id: v.segmentId });
    if (action === 'rename') {
        return respond(context, 'admin_rename_song', { p_song_id: v.id, p_title: v.title, p_artist: v.artist });
    }
    return respond(context, 'admin_match_songs', { p_items: v.items });
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, POST, OPTIONS' });
}
