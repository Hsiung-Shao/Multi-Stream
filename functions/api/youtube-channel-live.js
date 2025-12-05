// Cloudflare Pages Function: YouTube 頻道 /live 端點代理
// 用於檢查 YouTube 頻道的直播狀態，通過檢查 /live 端點的重定向來判斷是否開台

export async function onRequestGet(contextOrRequest, env) {
  let request, envObj;
  if (contextOrRequest && contextOrRequest.request) {
    request = contextOrRequest.request;
    envObj = contextOrRequest.env;
  } else {
    request = contextOrRequest;
    envObj = env;
  }
  
  return handleChannelLiveRequest(request, envObj);
}

async function handleChannelLiveRequest(request, env) {
  try {
    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');
    
    console.log('[YouTube Channel Live Proxy] 收到請求:', { channelId, url: request.url });
    
    if (!channelId) {
      console.warn('[YouTube Channel Live Proxy] 缺少 channelId 參數');
      return new Response(
        JSON.stringify({ error: '缺少 channelId 參數' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
    
    // 驗證 channelId 格式
    if (!/^UC[a-zA-Z0-9_-]{22}$/.test(channelId)) {
      console.warn('[YouTube Channel Live Proxy] 無效的 channelId 格式:', channelId);
      return new Response(
        JSON.stringify({ error: '無效的 channelId 格式' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
    
    // 構建 YouTube 頻道 /live URL
    const liveUrl = `https://www.youtube.com/channel/${channelId}/live`;
    console.log('[YouTube Channel Live Proxy] 請求頻道 /live 端點:', liveUrl);
    
    // 從 YouTube 獲取 /live 端點（跟隨重定向）
    const response = await fetch(liveUrl, {
      method: 'GET',
      redirect: 'follow', // 跟隨重定向
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    const status = response.status;
    const finalUrl = response.url; // 最終重定向後的 URL
    
    console.log('[YouTube Channel Live Proxy] 響應:', { 
      channelId, 
      status, 
      finalUrl,
      statusText: response.statusText,
      containsWatchV: finalUrl.includes('watch?v=')
    });
    
    // 輸出詳細的 URL 分析
    console.log('[YouTube Channel Live Proxy] URL 分析:', {
      originalUrl: liveUrl,
      finalUrl: finalUrl,
      isRedirected: liveUrl !== finalUrl,
      isWatchUrl: finalUrl.includes('watch?v='),
      videoId: finalUrl.includes('watch?v=') ? finalUrl.match(/[?&]v=([^&]+)/)?.[1] : null
    });
    
    // 根據邏輯表返回結果
    // HTTP 404 -> 頻道不存在
    if (status === 404) {
      return new Response(
        JSON.stringify({
          status: 404,
          finalUrl: null,
          isLive: false,
          message: '頻道不存在或已刪除'
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
    
    // HTTP 200 -> 檢查最終 URL
    if (status === 200) {
      const containsWatchV = finalUrl.includes('watch?v=');
      
      // 提取 video ID（如果存在）
      let liveVideoId = null;
      if (containsWatchV) {
        const videoIdMatch = finalUrl.match(/[?&]v=([^&]+)/);
        liveVideoId = videoIdMatch ? videoIdMatch[1] : null;
      }
      
      return new Response(
        JSON.stringify({
          status: 200,
          finalUrl: finalUrl,
          isLive: containsWatchV, // 包含 watch?v= 表示開台或預定直播
          liveVideoId: liveVideoId,
          message: containsWatchV ? '開台中（或預定直播）' : '未開台'
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
    
    // 其他狀態碼
    return new Response(
      JSON.stringify({
        status: status,
        finalUrl: finalUrl,
        isLive: null,
        message: `未知狀態: ${status}`
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  } catch (error) {
    console.error('[YouTube Channel Live Proxy] 伺服器錯誤:', { 
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

