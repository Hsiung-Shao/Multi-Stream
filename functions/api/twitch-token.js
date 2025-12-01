// Cloudflare Pages Function: Twitch OAuth Token 端點
// 此函數用於安全地處理 Twitch OAuth token 請求，避免在前端暴露 Client Secret
// 
// 環境變數設定（在 Cloudflare Pages 的 Variables & Secrets 中設定）：
// - TWITCH_CLIENT_ID: Twitch API Client ID
// - TWITCH_CLIENT_SECRET: Twitch API Client Secret（敏感資訊，使用 Secrets）

/**
 * 處理 Twitch OAuth Token 請求
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
  
  return handleTokenRequest(request, envObj);
}

export async function onRequestPost(contextOrRequest, env) {
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
  
  return handleTokenRequest(request, envObj);
}

async function handleTokenRequest(request, env) {
  try {
    // 診斷：檢查 env 對象是否存在
    if (!env) {
      console.error('[診斷] env 對象不存在');
      return new Response(
        JSON.stringify({
          error: '環境變數錯誤',
          message: 'Cloudflare Pages 環境變數對象未提供',
          diagnostics: {
            envExists: false,
            suggestion: '請檢查 Cloudflare Pages Functions 是否正確配置。這可能是部署配置問題。'
          }
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

    // 從環境變數讀取配置
    const clientId = env.TWITCH_CLIENT_ID;
    const clientSecret = env.TWITCH_CLIENT_SECRET;

    // 診斷：檢查環境變數是否設定
    const missingVars = [];
    if (!clientId) missingVars.push('TWITCH_CLIENT_ID');
    if (!clientSecret) missingVars.push('TWITCH_CLIENT_SECRET');

    // 列出所有可用的環境變數鍵（用於診斷，不顯示值）
    const availableEnvKeys = Object.keys(env || {}).filter(key => 
      !key.includes('SECRET') && !key.includes('TOKEN') && !key.includes('PASSWORD')
    );

    // 驗證必要的環境變數
    if (missingVars.length > 0) {
      console.error('[診斷] 缺少環境變數:', missingVars.join(', '));
      console.log('[診斷] 可用的環境變數鍵:', availableEnvKeys.length > 0 ? availableEnvKeys.join(', ') : '無');
      
      return new Response(
        JSON.stringify({
          error: '配置錯誤',
          message: `缺少必要的環境變數：${missingVars.join(', ')}`,
          diagnostics: {
            missingVariables: missingVars,
            availableEnvKeys: availableEnvKeys.length > 0 ? availableEnvKeys : [],
            envObjectExists: env !== null && env !== undefined,
            suggestion: '請在 Cloudflare Pages 控制台 → Settings → Variables & Secrets 中設定這些環境變數。\n' +
                       '詳細步驟：\n' +
                       '1. 進入您的 Pages 專案\n' +
                       '2. 點擊 Settings → Variables & Secrets\n' +
                       '3. 在 Variables 標籤中添加 TWITCH_CLIENT_ID\n' +
                       '4. 在 Secrets 標籤中添加 TWITCH_CLIENT_SECRET\n' +
                       '5. ⚠️ 重要：確保同時設定 Production 和 Preview 環境（在變數旁邊有下拉選單）\n' +
                       '6. 保存後重新部署專案\n' +
                       '7. 訪問 /api/env-check 進行診斷確認'
          }
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
      
      let suggestion = '';
      if (response.status === 400) {
        suggestion = '請檢查 TWITCH_CLIENT_ID 和 TWITCH_CLIENT_SECRET 是否正確，格式是否正確。';
      } else if (response.status === 401) {
        suggestion = 'Client ID 或 Client Secret 可能無效或已過期。請到 Twitch Developer Console 檢查。';
      } else if (response.status === 403) {
        suggestion = '認證被拒絕。請檢查 Twitch API 權限設定。';
      } else {
        suggestion = '請檢查網路連線和 Twitch API 狀態。';
      }
      
      return new Response(
        JSON.stringify({
          error: '取得 Token 失敗',
          message: `Twitch API 回應：${response.status} ${response.statusText}`,
          details: errorText,
          diagnostics: {
            httpStatus: response.status,
            suggestion: suggestion
          }
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
          message: 'Twitch API 回應中沒有 access_token',
          diagnostics: {
            responseKeys: Object.keys(data),
            suggestion: 'Twitch API 回應格式異常。請稍後再試，或檢查 Twitch API 狀態。'
          }
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
        message: error.message || '處理請求時發生未知錯誤',
        diagnostics: {
          errorType: error.constructor.name,
          errorStack: error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : '無堆疊信息',
          suggestion: '請檢查 Cloudflare Pages Functions 日誌以獲取更多詳情。'
        }
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
export async function onRequestOptions(contextOrRequest, env) {
  // 支持新舊兩種 API 格式（但 OPTIONS 通常不需要 env）
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
