// Cloudflare Pages Function: Twitch OAuth Token 端點
// 此函數用於安全地處理 Twitch OAuth token 請求，避免在前端暴露 Client Secret
// 
// 環境變數設定（在 Cloudflare Pages 的 Variables & Secrets 中設定）：
// - TWITCH_CLIENT_ID: Twitch API Client ID
// - TWITCH_CLIENT_SECRET: Twitch API Client Secret（敏感資訊，使用 Secrets）

/**
 * 處理 Twitch OAuth Token 請求
 * @param {Request} request - 請求對象
 * @param {Object} env - Cloudflare Pages 環境變數
 * @returns {Promise<Response>} - JSON 回應
 */
export async function onRequestGet(request, env) {
  return handleTokenRequest(request, env);
}

export async function onRequestPost(request, env) {
  return handleTokenRequest(request, env);
}

async function handleTokenRequest(request, env) {
  try {
    // 從環境變數讀取配置
    const clientId = env.TWITCH_CLIENT_ID;
    const clientSecret = env.TWITCH_CLIENT_SECRET;

    // 驗證必要的環境變數
    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({
          error: '配置錯誤',
          message: 'TWITCH_CLIENT_ID 或 TWITCH_CLIENT_SECRET 未設定。請在 Cloudflare Pages 的 Variables & Secrets 中設定這些環境變數。'
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        }
      );
    }

    // 使用 Client Credentials Grant Flow 取得 Token
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    });

    const response = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Twitch OAuth 錯誤:', response.status, errorText);
      
      return new Response(
        JSON.stringify({
          error: '取得 Token 失敗',
          message: `Twitch API 回應：${response.status} ${response.statusText}`,
          details: errorText
        }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        }
      );
    }

    const data = await response.json();

    if (!data.access_token) {
      return new Response(
        JSON.stringify({
          error: '無效的回應',
          message: 'Twitch API 回應中沒有 access_token'
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        }
      );
    }

    // 返回 Token 資訊
    return new Response(
      JSON.stringify({
        access_token: data.access_token,
        expires_in: data.expires_in || 3600,
        token_type: data.token_type || 'bearer'
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          // 快取控制：Token 通常有效期為 1 小時，建議客戶端快取
          'Cache-Control': 'private, max-age=3000' // 快取 50 分鐘（略小於 1 小時）
        }
      }
    );
  } catch (error) {
    console.error('處理 Token 請求時發生錯誤:', error);
    
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
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400' // 24 小時
    }
  });
}
