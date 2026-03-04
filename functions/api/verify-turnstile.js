// Cloudflare Pages Function: Turnstile Token 驗證端點
// 接收前端傳來的 Turnstile token，透過 Cloudflare Siteverify API 驗證
//
// 環境變數設定（在 Cloudflare Pages 的 Variables & Secrets 中設定）：
// - TURNSTILE_SECRET_KEY: Turnstile Secret Key（敏感資訊，使用 Secrets）

import { jsonResponse, handleOptions } from '../lib/cors.js';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * 處理 Turnstile Token 驗證請求
 * @param {Object} context - Cloudflare Pages Function context
 * @returns {Promise<Response>} - JSON 回應
 */
export async function onRequestPost(context) {
    const { request, env } = context;

    const secretKey = env.TURNSTILE_SECRET_KEY;
    if (!secretKey) {
        return jsonResponse({ success: false, error: 'Turnstile 未設定' }, 500, request);
    }

    // Content-Type 檢查
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
        return jsonResponse({ success: false, error: 'Invalid Content-Type' }, 400, request);
    }

    try {
        const body = await request.json();
        const { token } = body;

        // 輸入驗證：token 格式與長度
        if (!token || typeof token !== 'string' || token.length < 20 || token.length > 2048) {
            return jsonResponse({ success: false, error: '無效的 token' }, 400, request);
        }

        // 取得用戶 IP（Cloudflare 自動提供）
        const ip = request.headers.get('CF-Connecting-IP') || '';

        // 呼叫 Cloudflare Siteverify API
        const formData = new URLSearchParams();
        formData.append('secret', secretKey);
        formData.append('response', token);
        if (ip) {
            formData.append('remoteip', ip);
        }

        const verifyResponse = await fetch(SITEVERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
        });

        const result = await verifyResponse.json();

        return jsonResponse(
            {
                success: result.success,
                // 不暴露完整的錯誤碼給前端
                ...(result.success ? {} : { error: '驗證失敗' }),
            },
            result.success ? 200 : 403,
            request,
            { 'Cache-Control': 'no-store' }
        );
    } catch (error) {
        return jsonResponse({ success: false, error: '伺服器錯誤' }, 500, request);
    }
}

// 處理 OPTIONS 請求（CORS 預檢請求）
export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
