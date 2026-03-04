// Cloudflare Pages Function: Umami 配置端點
// 此函數用於返回 Umami 追蹤設定
//
// 環境變數設定（在 Cloudflare Pages 的 Variables & Secrets 中設定）：
// - UMAMI_SCRIPT_URL: Umami script.js 的完整 URL
// - UMAMI_WEBSITE_ID: Umami 的 Website ID

import { jsonResponse, handleOptions } from '../lib/cors.js';

/**
 * 處理 Umami 配置請求
 * @param {Object} context - 上下文對象
 * @returns {Promise<Response>} - JSON 回應
 */
export async function onRequestGet(context) {
    const { request, env } = context;

    try {
        const scriptUrl = env.UMAMI_SCRIPT_URL || null;
        const websiteId = env.UMAMI_WEBSITE_ID || null;

        return jsonResponse({ scriptUrl, websiteId }, 200, request, {
            'Cache-Control': 'public, max-age=3600',
        });
    } catch (error) {
        return jsonResponse({ error: '伺服器錯誤' }, 500, request);
    }
}

// 處理 OPTIONS 請求（CORS 預檢請求）
export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
