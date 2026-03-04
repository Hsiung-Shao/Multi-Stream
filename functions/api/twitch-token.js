// Cloudflare Pages Function: Twitch OAuth Token 端點
// 此函數用於安全地處理 Twitch OAuth token 請求，避免在前端暴露 Client Secret
//
// 環境變數設定（在 Cloudflare Pages 的 Variables & Secrets 中設定）：
// - TWITCH_CLIENT_ID: Twitch API Client ID
// - TWITCH_CLIENT_SECRET: Twitch API Client Secret（敏感資訊，使用 Secrets）

import { jsonResponse, handleOptions } from '../lib/cors.js';

/**
 * 處理 Twitch OAuth Token 請求
 * @param {Object} context - Cloudflare Pages Function context
 * @returns {Promise<Response>} - JSON 回應
 */
export async function onRequestGet(context) {
    return handleTokenRequest(context.request, context.env);
}

export async function onRequestPost(context) {
    return handleTokenRequest(context.request, context.env);
}

async function handleTokenRequest(request, env) {
    try {
        if (!env) {
            return jsonResponse({ error: '配置錯誤' }, 500, request);
        }

        const clientId = env.TWITCH_CLIENT_ID;
        const clientSecret = env.TWITCH_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            return jsonResponse({ error: '缺少必要的環境變數' }, 500, request);
        }

        // 使用 Client Credentials Grant Flow 取得 Token
        const params = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'client_credentials',
        });

        const response = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });

        if (!response.ok) {
            return jsonResponse(
                { error: '取得 Token 失敗' },
                response.status >= 500 ? 502 : 500,
                request
            );
        }

        const data = await response.json();

        if (!data.access_token) {
            return jsonResponse({ error: '無效的回應' }, 500, request);
        }

        return jsonResponse(
            {
                access_token: data.access_token,
                expires_in: data.expires_in || 3600,
                token_type: data.token_type || 'bearer',
            },
            200,
            request,
            { 'Cache-Control': 'private, max-age=3000' }
        );
    } catch (error) {
        return jsonResponse({ error: '伺服器錯誤' }, 500, request);
    }
}

// 處理 OPTIONS 請求（CORS 預檢請求）
export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
