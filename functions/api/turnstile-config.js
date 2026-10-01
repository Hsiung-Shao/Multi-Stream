// GET /api/turnstile-config：前端 Turnstile widget 用的 site key（公開值）
// enforced=false 時（本地、尚未設定）前端可不顯示 widget；伺服器端仍以 ENFORCE_TURNSTILE 為準。

import { jsonResponse, handleOptions } from '../lib/cors.js';

export async function onRequestGet(context) {
    const { request, env } = context;
    return jsonResponse(
        { ok: true, siteKey: env.TURNSTILE_SITE_KEY || null, enforced: env.ENFORCE_TURNSTILE === 'true' },
        200,
        request,
        { 'Cache-Control': 'public, max-age=300' },
        { methods: 'GET, OPTIONS' },
    );
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, OPTIONS' });
}
