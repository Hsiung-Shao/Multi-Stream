// Cloudflare Pages Function: YouTube API 代理端點
// 此函數用於代理 YouTube API 請求，解決 CORS 問題
// 
// 環境變數設定（在 Cloudflare Pages 的 Variables & Secrets 中設定）：
// - YOUTUBE_API_KEY: YouTube API Key

/**
 * 處理 YouTube API 代理請求
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
  
  return handleProxyRequest(request, envObj);
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
  
  return handleProxyRequest(request, envObj);
}

async function handleProxyRequest(request, env) {
  try {
    if (!env) {
      return new Response(
        JSON.stringify({
          error: '配置錯誤',
          message: '環境變數未配置'
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

    const apiKey = env.YOUTUBE_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: '配置錯誤',
          message: '缺少 YOUTUBE_API_KEY 環境變數'
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

    // 從 URL 中取得端點和參數
    const url = new URL(request.url);
    const endpoint = url.searchParams.get('endpoint') || '';
    const params = {};
    
    // 複製所有查詢參數（除了 endpoint）
    url.searchParams.forEach((value, key) => {
      if (key !== 'endpoint') {
        params[key] = value;
      }
    });

    // 建立 YouTube API URL
    const youtubeUrl = new URL(`https://www.googleapis.com/youtube/v3${endpoint}`);
    youtubeUrl.searchParams.set('key', apiKey);
    
    // 添加其他參數
    Object.keys(params).forEach(key => {
      youtubeUrl.searchParams.set(key, params[key]);
    });

    // 發送請求到 YouTube API
    const response = await fetch(youtubeUrl.toString(), {
      method: request.method,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      return new Response(
        JSON.stringify({
          error: 'YouTube API 請求失敗',
          message: `YouTube API 回應：${response.status} ${response.statusText}`,
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

    // 返回數據
    return new Response(
      JSON.stringify(data),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          // 快取控制：建議客戶端快取
          'Cache-Control': 'private, max-age=60' // 快取 1 分鐘
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
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      }
    );
  }
}

// 處理 OPTIONS 請求（CORS 預檢請求）
export async function onRequestOptions(contextOrRequest, env) {
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
