// Cloudflare Pages Function: Twitch OAuth Token 端點
// 此函數用於安全地處理 Twitch OAuth token 請求，避免在前端暴露 Client Secret
//
// 環境變數設定（在 Cloudflare Pages 的 Variables & Secrets 中設定）：
// - TWITCH_CLIENT_ID: Twitch API Client ID
// - TWITCH_CLIENT_SECRET: Twitch API Client Secret（敏感資訊，使用 Secrets）
//
// CORS：改用 lib/cors.js 的 origin 白名單（multistreaming.org + localhost + preview），
//       不再對所有來源開放（避免任意站台跨域鑄造 app token）。前端同源呼叫不受影響。

import { jsonResponse, handleOptions } from '../lib/cors.js';

// 支援新舊兩種 API 格式：新格式 onRequestGet(context)、舊格式 onRequestGet(request, env)
function normalize(contextOrRequest, env) {
  if (contextOrRequest && contextOrRequest.request) {
    return { request: contextOrRequest.request, env: contextOrRequest.env };
  }
  return { request: contextOrRequest, env };
}

export async function onRequestGet(contextOrRequest, env) {
  const n = normalize(contextOrRequest, env);
  return handleTokenRequest(n.request, n.env);
}

export async function onRequestPost(contextOrRequest, env) {
  const n = normalize(contextOrRequest, env);
  return handleTokenRequest(n.request, n.env);
}

async function handleTokenRequest(request, env) {
  try {
    if (!env) {
      return jsonResponse({ error: '配置錯誤', message: '環境變數未配置' }, 500, request);
    }

    const clientId = env.TWITCH_CLIENT_ID;
    const clientSecret = env.TWITCH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return jsonResponse({ error: '配置錯誤', message: '缺少必要的環境變數' }, 500, request);
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
        { error: '取得 Token 失敗', message: `Twitch API 回應：${response.status} ${response.statusText}` },
        response.status,
        request,
      );
    }

    const data = await response.json();

    if (!data.access_token) {
      return jsonResponse({ error: '無效的回應', message: 'Twitch API 回應中沒有 access_token' }, 500, request);
    }

    // Token 通常有效期 1 小時，建議客戶端快取（略小於 1 小時）
    return jsonResponse(
      {
        access_token: data.access_token,
        expires_in: data.expires_in || 3600,
        token_type: data.token_type || 'bearer',
      },
      200,
      request,
      { 'Cache-Control': 'private, max-age=3000' },
    );
  } catch (error) {
    return jsonResponse({ error: '伺服器錯誤', message: error.message || '處理請求時發生未知錯誤' }, 500, request);
  }
}

// 處理 OPTIONS 請求（CORS 預檢請求）
export async function onRequestOptions(contextOrRequest, env) {
  const n = normalize(contextOrRequest, env);
  return handleOptions(n.request);
}
