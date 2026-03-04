// Cloudflare Pages Function: YouTube API 配置端點
// 此函數用於返回 YouTube API Key
//
// 環境變數設定（在 Cloudflare Pages 的 Variables & Secrets 中設定）：
// - YOUTUBE_API_KEY: YouTube API Key

import { jsonResponse, handleOptions } from '../lib/cors.js';

/**
 * 處理 YouTube API 配置請求
 * @param {Object} context - 上下文對象
 * @returns {Promise<Response>} - JSON 回應
 */
export async function onRequestGet(context) {
    const { request, env } = context;

    try {
        const apiKey = env?.YOUTUBE_API_KEY || null;

        return jsonResponse({ apiKey }, 200, request, {
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
