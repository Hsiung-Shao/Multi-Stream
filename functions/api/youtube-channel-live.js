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
    
    // 構建 YouTube 頻道 /live URL（使用真實 ID，UC 開頭）
    const liveUrl = `https://www.youtube.com/channel/${channelId}/live`;
    console.log('[YouTube Channel Live Proxy] 請求頻道 /live 端點:', liveUrl);
    
    try {
      // 設定 User-Agent 很重要，模擬瀏覽器，降低被當機器人的機率
      // 使用 redirect: 'follow' (預設就是 follow)，讓它自動跳轉
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      };
      
      // 從 YouTube 獲取 /live 端點（跟隨重定向，類似 Python 的 allow_redirects=True）
      const response = await fetch(liveUrl, {
        method: 'GET',
        redirect: 'follow', // 自動跟隨重定向（預設值）
        headers: headers
      });
      
      const status = response.status;
      const finalUrl = response.url; // 最終重定向後的 URL（類似 Python 的 response.url）
      
      console.log('[YouTube Channel Live Proxy] 響應:', { 
        channelId, 
        status, 
        finalUrl,
        statusText: response.statusText
      });
      
      // 根據邏輯表返回結果
      // HTTP 404 -> 頻道不存在
      if (status === 404) {
        console.log('[YouTube Channel Live Proxy] 頻道不存在（404）');
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
        // 檢查最終網址是否包含 watch?v=
        const containsWatchV = finalUrl.includes('watch?v=');
        
        console.log('[YouTube Channel Live Proxy] URL 分析:', {
          originalUrl: liveUrl,
          finalUrl: finalUrl,
          isRedirected: liveUrl !== finalUrl,
          containsWatchV: containsWatchV
        });
        
        if (containsWatchV) {
          // 成功抓到直播（或預定直播）
          // 使用簡單的字符串切割方式提取 video ID（完全按照 Python 版本）
          // Python: final_url.split("v=")[1].split("&")[0]
          const parts = finalUrl.split('v=');
          const videoId = parts.length > 1 ? parts[1].split('&')[0] : null;
          
          console.log('[YouTube Channel Live Proxy] 頻道正在開台:', {
            channelId: channelId,
            videoId: videoId,
            finalUrl: finalUrl
          });
          
          return new Response(
            JSON.stringify({
              status: 200,
              finalUrl: finalUrl,
              isLive: true,
              liveVideoId: videoId,
              message: '開台中（或預定直播）'
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            }
          );
        } else {
          // 被導回頻道首頁，表示沒直播
          console.log('[YouTube Channel Live Proxy] 頻道未開台（被導回頻道首頁）');
          return new Response(
            JSON.stringify({
              status: 200,
              finalUrl: finalUrl,
              isLive: false,
              liveVideoId: null,
              message: '未開台'
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
      }
      
      // 其他狀態碼
      console.warn('[YouTube Channel Live Proxy] 未知狀態碼:', status);
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
      // 處理請求錯誤（例如：網路錯誤、超時等）
      console.error('[YouTube Channel Live Proxy] 請求錯誤:', {
        channelId: channelId,
        error: error.message,
        stack: error.stack
      });
      
      return new Response(
        JSON.stringify({
          status: 'ERROR',
          error: '請求失敗',
          message: error.message || '處理請求時發生錯誤',
          isLive: null,
          liveVideoId: null
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

