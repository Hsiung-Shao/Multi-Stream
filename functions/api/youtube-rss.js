// Cloudflare Pages Function: YouTube RSS 代理端點
// 用於代理 YouTube RSS Feed 請求，解決 CORS 問題

export async function onRequestGet(contextOrRequest, env) {
  let request, envObj;
  if (contextOrRequest && contextOrRequest.request) {
    request = contextOrRequest.request;
    envObj = contextOrRequest.env;
  } else {
    request = contextOrRequest;
    envObj = env;
  }
  
  return handleRSSRequest(request, envObj);
}

async function handleRSSRequest(request, env) {
  try {
    const url = new URL(request.url);
    const channelId = url.searchParams.get('channel_id');
    
    console.log('[YouTube RSS Proxy] 收到請求:', { channelId, url: request.url });
    
    if (!channelId) {
      console.warn('[YouTube RSS Proxy] 缺少 channel_id 參數');
      return new Response(
        JSON.stringify({ error: '缺少 channel_id 參數' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
    
    // 驗證 channelId 格式（基本驗證）
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(channelId)) {
      console.warn('[YouTube RSS Proxy] 無效的 channel_id 格式:', channelId);
      return new Response(
        JSON.stringify({ error: '無效的 channel_id 格式' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
    
    // 構建 YouTube RSS URL
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
    console.log('[YouTube RSS Proxy] 請求 YouTube RSS:', rssUrl);
    
    // 從 YouTube 獲取 RSS Feed
    const response = await fetch(rssUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)'
      }
    });
    
    if (!response.ok) {
      console.error('[YouTube RSS Proxy] 無法獲取 RSS Feed:', { 
        channelId, 
        status: response.status, 
        statusText: response.statusText 
      });
      return new Response(
        JSON.stringify({ 
          error: '無法獲取 RSS Feed',
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
    
    const xmlText = await response.text();
    console.log('[YouTube RSS Proxy] 成功獲取 RSS Feed:', { 
      channelId, 
      xmlLength: xmlText.length,
      status: response.status 
    });
    
    // 返回 XML，設置正確的 CORS headers
    return new Response(xmlText, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=300' // 快取 5 分鐘（RSS 更新頻率較低）
      }
    });
  } catch (error) {
    console.error('[YouTube RSS Proxy] 伺服器錯誤:', { 
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

