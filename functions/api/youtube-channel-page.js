// Cloudflare Pages Function: YouTube 頻道頁面代理端點
// 用於代理 YouTube 頻道頁面請求，解決 CORS 問題，用於提取 channel ID

export async function onRequestGet(contextOrRequest, env) {
  let request, envObj;
  if (contextOrRequest && contextOrRequest.request) {
    request = contextOrRequest.request;
    envObj = contextOrRequest.env;
  } else {
    request = contextOrRequest;
    envObj = env;
  }
  
  return handleChannelPageRequest(request, envObj);
}

async function handleChannelPageRequest(request, env) {
  try {
    const url = new URL(request.url);
    const username = url.searchParams.get('username');
    
    if (!username) {
      return new Response(
        JSON.stringify({ error: '缺少 username 參數' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
    
    // 驗證 username 格式
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(username)) {
      return new Response(
        JSON.stringify({ error: '無效的 username 格式' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
    
    // 構建 YouTube 頻道 about 頁面 URL
    const channelAboutUrl = `https://www.youtube.com/@${username}/about`;
    
    // 從 YouTube 獲取頻道頁面 HTML
    const response = await fetch(channelAboutUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          error: '無法獲取頻道頁面',
          status: response.status,
          statusText: response.statusText
        }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
    
    const htmlText = await response.text();
    
    // 返回 HTML，設置正確的 CORS headers
    return new Response(htmlText, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=3600' // 快取 1 小時（頻道 ID 不會頻繁變化）
      }
    });
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
          'Access-Control-Allow-Origin': '*'
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400' // 24 小時
    }
  });
}

