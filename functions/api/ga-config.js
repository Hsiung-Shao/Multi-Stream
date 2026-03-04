// Cloudflare Pages Function: GA4 配置端點
// 此函數用於返回 GA4 Measurement ID
//
// 環境變數設定（在 Cloudflare Pages 的 Variables & Secrets 中設定）：
// - GA_MEASUREMENT_ID: GA4 Measurement ID (例如 G-XXXXXXXXXX)

import { jsonResponse, handleOptions } from '../lib/cors.js';

/**
 * 處理 GA4 配置請求
 * @param {Object} context - 上下文對象
 * @returns {Promise<Response>} - JSON 回應
 */
export async function onRequestGet(context) {
    const { request, env } = context;

    try {
        const measurementId = env.GA_MEASUREMENT_ID || env.VITE_GA_MEASUREMENT_ID || null;

        return jsonResponse({ measurementId }, 200, request, {
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
