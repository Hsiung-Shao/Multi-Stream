// Cloudflare Pages Function: Twitch API 配置端點
// 此函數用於返回 Twitch API Client ID（非敏感資訊，可以公開）
//
// 環境變數設定（在 Cloudflare Pages 的 Variables & Secrets 中設定）：
// - TWITCH_CLIENT_ID: Twitch API Client ID

import { jsonResponse, handleOptions } from '../lib/cors.js';

/**
 * 處理 Twitch API 配置請求
 * @param {Object} context - 上下文對象
 * @returns {Promise<Response>} - JSON 回應
 */
export async function onRequestGet(context) {
    const { request, env } = context;

    try {
        const clientId = env?.TWITCH_CLIENT_ID || null;

        return jsonResponse({ clientId, useProxy: false }, 200, request, {
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
