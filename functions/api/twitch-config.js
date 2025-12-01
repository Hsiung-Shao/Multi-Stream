// Cloudflare Pages Function: Twitch API 配置端點
// 此函數用於返回 Twitch API Client ID（非敏感資訊，可以公開）
// 
// 環境變數設定（在 Cloudflare Pages 的 Variables & Secrets 中設定）：
// - TWITCH_CLIENT_ID: Twitch API Client ID

/**
 * 處理 Twitch API 配置請求
 * @param {Request} request - 請求對象
 * @param {Object} env - Cloudflare Pages 環境變數
 * @returns {Promise<Response>} - JSON 回應
 */
export async function onRequestGet(request, env) {
  return handleConfigRequest(request, env);
}

async function handleConfigRequest(request, env) {
  try {
    // 從環境變數讀取 Client ID
    const clientId = env.TWITCH_CLIENT_ID;

    // 如果沒有設定 Client ID，返回空值（不拋出錯誤，讓前端使用其他方式）
    if (!clientId) {
      return new Response(
        JSON.stringify({
          clientId: null,
          message: 'TWITCH_CLIENT_ID 未在環境變數中設定'
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        }
      );
    }

    // 返回 Client ID（這是非敏感資訊，可以公開）
    return new Response(
      JSON.stringify({
        clientId: clientId
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          // 快取控制：配置不會頻繁變更，可以快取較長時間
          'Cache-Control': 'public, max-age=3600' // 快取 1 小時
        }
      }
    );
  } catch (error) {
    console.error('處理配置請求時發生錯誤:', error);
    
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
export async function onRequestOptions(request, env) {
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
