// GET /api/turnstile-config：前端 Turnstile widget 用的 site key（公開值）
// enforced=false（只有 ENFORCE_TURNSTILE='false' 的本地開發）時前端不顯示 widget；伺服器端仍以 ENFORCE_TURNSTILE 為準。

import { jsonResponse, handleOptions } from '../lib/cors.js';

export async function onRequestGet(context) {
    const { request, env } = context;
    return jsonResponse(
        { ok: true, siteKey: env.TURNSTILE_SITE_KEY || null, enforced: env.ENFORCE_TURNSTILE !== 'false' },
        200,
        request,
        { 'Cache-Control': 'public, max-age=300' },
        { methods: 'GET, OPTIONS' },
    );
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, OPTIONS' });
}
