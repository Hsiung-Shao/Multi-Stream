// Cloudflare Pages Function: Twitch API 配置端點
// 此函數用於返回 Twitch API Client ID（非敏感資訊，可以公開）
// 
// 環境變數設定（在 Cloudflare Pages 的 Variables & Secrets 中設定）：
// - TWITCH_CLIENT_ID: Twitch API Client ID

/**
 * 處理 Twitch API 配置請求
 * 支持兩種 API 格式：
 * - 新格式：onRequestGet(context) 其中 context = { request, env }
 * - 舊格式：onRequestGet(request, env)
 * @param {Object|Request} contextOrRequest - 上下文對象或請求對象
 * @param {Object} env - Cloudflare Pages 環境變數（舊格式）
 * @returns {Promise<Response>} - JSON 回應
 */
export async function onRequestGet(contextOrRequest, env) {
  // 支持新舊兩種 API 格式
  let request, envObj;
  if (contextOrRequest && contextOrRequest.request) {
    // 新格式：context 對象包含 request 和 env
    request = contextOrRequest.request;
    envObj = contextOrRequest.env;
  } else {
    // 舊格式：第一個參數是 request，第二個是 env
    request = contextOrRequest;
    envObj = env;
  }

  return handleConfigRequest(request, envObj);
}

async function handleConfigRequest(request, env) {
  const requestUrl = request.url;
  const requestMethod = request.method;

  try {
    const clientId = env?.TWITCH_CLIENT_ID || null;

    // 返回 Client ID 與 Proxy 設定
    return new Response(
      JSON.stringify({
        clientId: clientId,
        // 建議前端在測試環境中預設使用 Proxy
        useProxy: true,
        proxyBase: '/api'
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
export async function onRequestOptions(contextOrRequest, env) {
  // 支持新舊兩種 API 格式（但 OPTIONS 通常不需要 env）
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400' // 24 小時
    }
  });
}
