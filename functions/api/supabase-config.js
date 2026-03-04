// Cloudflare Pages Function: Supabase 配置端點
// 此函數用於返回 Supabase 連線設定
//
// 環境變數設定（在 Cloudflare Pages 的 Variables & Secrets 中設定）：
// - SUPABASE_URL: Supabase 專案 URL (例如 https://xxx.supabase.co)
// - SUPABASE_ANON_KEY: Supabase 的 publishable/anon key

import { jsonResponse, handleOptions } from '../lib/cors.js';

/**
 * 處理 Supabase 配置請求
 * @param {Object} context - 上下文對象
 * @returns {Promise<Response>} - JSON 回應
 */
export async function onRequestGet(context) {
    const { request, env } = context;

    try {
        const url = env.SUPABASE_URL || null;
        const anonKey = env.SUPABASE_ANON_KEY || null;

        return jsonResponse({ url, anonKey }, 200, request, {
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
