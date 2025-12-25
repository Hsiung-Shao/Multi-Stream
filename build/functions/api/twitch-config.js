// Cloudflare Pages Function: Twitch API 配置端點
// 此函數用於返回 Twitch API Client ID（非敏感資訊，可以公開）
// 
// 環境變數設定（在 Cloudflare Pages 的 Variables & Secrets 中設定）：
// - TWITCH_CLIENT_ID: Twitch API Client ID

/**
 * 處理 Twitch API 配置請求
 * @param {Object} context - 上下文對象
 * @returns {Promise<Response>} - JSON 回應
 */
export async function onRequestGet(context) {
  const { request, env } = context;

  return handleConfigRequest(request, env);
}

async function handleConfigRequest(request, env) {
  try {
    const clientId = env?.TWITCH_CLIENT_ID || null;

    // 返回 Client ID (Direct Mode)
    // 前端將不再使用通用 Proxy，而是直接使用 Token 呼叫 Twitch Helix
    return new Response(
      JSON.stringify({
        clientId: clientId,
        useProxy: false
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Cache-Control': 'public, max-age=3600'
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: '伺服器錯誤',
        message: error.message || '處理請求時發生未知錯誤'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      }
    );
  }
}

// 處理 OPTIONS 請求（CORS 預檢請求）
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}
