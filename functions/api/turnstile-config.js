// Cloudflare Pages Function: Turnstile 配置端點
// 安全地將 Turnstile Site Key 傳給前端
//
// 環境變數設定（在 Cloudflare Pages 的 Variables & Secrets 中設定）：
// - TURNSTILE_SITE_KEY: Turnstile Site Key（公開金鑰，可暴露給前端）

import { jsonResponse, handleOptions } from '../lib/cors.js';

/**
 * 處理 Turnstile 配置請求
 * @param {Object} context - Cloudflare Pages Function context
 * @returns {Promise<Response>} - JSON 回應
 */
export async function onRequestGet(context) {
    const { request, env } = context;
    const siteKey = env.TURNSTILE_SITE_KEY || null;

    return jsonResponse({ siteKey }, 200, request, {
        'Cache-Control': 'public, max-age=3600',
    });
}

// 處理 OPTIONS 請求（CORS 預檢請求）
export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
