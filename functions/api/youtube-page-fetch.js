// Cloudflare Pages Function: YouTube 頁面獲取代理端點
// 用於代理 YouTube 頁面請求，解決 CORS 問題，用於提取 @handle

export async function onRequestGet(contextOrRequest, env) {
  let request, envObj;
  if (contextOrRequest && contextOrRequest.request) {
    request = contextOrRequest.request;
    envObj = contextOrRequest.env;
  } else {
    request = contextOrRequest;
    envObj = env;
  }
  
  return handlePageFetchRequest(request, envObj);
}

async function handlePageFetchRequest(request, env) {
  try {
    const url = new URL(request.url);
    const youtubeUrl = url.searchParams.get('url');
    
    console.log('[YouTube Page Fetch Proxy] 收到請求:', { youtubeUrl, url: request.url });
    
    if (!youtubeUrl) {
      console.warn('[YouTube Page Fetch Proxy] 缺少 url 參數');
      return new Response(
        JSON.stringify({ error: '缺少 url 參數' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
    
    // 驗證 URL 格式
    if (!youtubeUrl.includes('youtube.com') && !youtubeUrl.includes('youtu.be')) {
      console.warn('[YouTube Page Fetch Proxy] 無效的 YouTube URL:', youtubeUrl);
      return new Response(
        JSON.stringify({ error: '無效的 YouTube URL' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
    
    console.log('[YouTube Page Fetch Proxy] 請求 YouTube 頁面:', youtubeUrl);
    
    // 從 YouTube 獲取頁面 HTML
    const response = await fetch(youtubeUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    if (!response.ok) {
      console.error('[YouTube Page Fetch Proxy] 無法獲取頁面:', { 
        youtubeUrl, 
        status: response.status, 
        statusText: response.statusText 
      });
      return new Response(
        JSON.stringify({ 
          error: '無法獲取頁面',
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
    console.log('[YouTube Page Fetch Proxy] 成功獲取頁面:', { 
      youtubeUrl, 
      htmlLength: htmlText.length,
      status: response.status 
    });
    
    // 返回 HTML，設置正確的 CORS headers
    return new Response(htmlText, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=3600' // 快取 1 小時
      }
    });
  } catch (error) {
    console.error('[YouTube Page Fetch Proxy] 伺服器錯誤:', { 
      error: error.message, 
      stack: error.stack 
    });
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

