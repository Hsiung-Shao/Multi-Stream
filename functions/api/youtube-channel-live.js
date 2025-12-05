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

const MAX_REDIRECTS = 5; // 設定最大重定向次數，防止無限循環

/**
 * 遞迴檢查 YouTube 頻道是否處於直播狀態
 * 關鍵：在重定向過程中，一旦看到 watch?v=，立即返回 LIVE 狀態
 * 
 * @param {string} channelId - 頻道的真實 ID (UC... 開頭)
 * @param {string} url - 當前檢查的 URL (初始為 /live)
 * @param {number} redirects - 已追蹤的次數
 * @returns {Promise<{status: string, videoId: (string|null), finalUrl: string, message?: string}>}
 */
async function checkLiveStatusRecursive(channelId, url, redirects) {
  if (redirects >= MAX_REDIRECTS) {
    console.warn(`[YouTube Channel Live Proxy] 達到最大重定向次數 (${MAX_REDIRECTS})`);
    return { 
      status: 'ERROR', 
      videoId: null, 
      finalUrl: url,
      message: 'Reached maximum redirect count.'
    };
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };

    const response = await fetch(url, {
      method: 'GET',
      // 🚨 關鍵設定：設定為 'manual'，這樣 fetch 不會自動追蹤 302，而是返回 302 狀態
      redirect: 'manual', 
      headers: headers
    });

    const status = response.status;
    const finalUrl = response.url || url; // Fetch API 的 response.url 顯示的是發送請求的 URL

    console.log(`[YouTube Channel Live Proxy] 遞迴請求 ${redirects + 1}:`, {
      requestedUrl: url,
      status: status,
      responseUrl: finalUrl,
      locationHeader: response.headers.get('Location')
    });

    if (status >= 300 && status < 400) {
      // 狀態碼是 3XX (重定向)
      const location = response.headers.get('Location');
      
      if (location) {
        // 處理相對路徑，確保得到完整的 URL
        const newUrl = new URL(location, url).href;
        
        console.log(`[YouTube Channel Live Proxy] 重定向 ${redirects + 1}: ${url} -> ${newUrl}`);
        
        // 🚨 核心判斷邏輯：如果新的 URL 包含 'watch?v='，我們已經找到目標，立即返回
        if (newUrl.includes("watch?v=")) {
          // 使用簡單的字符串切割方式提取 video ID
          const parts = newUrl.split('v=');
          const videoId = parts.length > 1 ? parts[1].split('&')[0] : null;

          console.log('[YouTube Channel Live Proxy] 在重定向中發現直播 URL:', {
            channelId: channelId,
            videoId: videoId,
            finalUrl: newUrl
          });

          return {
            status: 'LIVE',
            videoId: videoId,
            finalUrl: newUrl
          };
        }
        
        // 繼續追蹤下一個重定向
        return checkLiveStatusRecursive(channelId, newUrl, redirects + 1);
      } else {
        // 重定向但沒有 Location header
        console.warn('[YouTube Channel Live Proxy] 重定向但沒有 Location header');
        return {
          status: 'ERROR',
          videoId: null,
          finalUrl: url,
          message: 'Redirect without Location header'
        };
      }
    } 
    
    if (status === 200) {
      // 狀態碼是 200 OK
      if (finalUrl.includes('watch?v=')) {
        // 雖然這不太可能發生在 manual 模式，但作為最終保險
        const parts = finalUrl.split('v=');
        const videoId = parts.length > 1 ? parts[1].split('&')[0] : null;
        
        console.log('[YouTube Channel Live Proxy] 在最終響應中發現直播 URL:', {
          channelId: channelId,
          videoId: videoId,
          finalUrl: finalUrl
        });
        
        return { 
          status: 'LIVE', 
          videoId: videoId, 
          finalUrl: finalUrl 
        };
      }

      // 狀態：已停止跳轉，停留在非直播頁面 (如頻道首頁)
      console.log('[YouTube Channel Live Proxy] 頻道未開台（停留在非直播頁面）');
      return {
        status: 'OFFLINE',
        videoId: null,
        finalUrl: url
      };
    } 
    
    if (status === 404) {
      // 頻道不存在
      console.log('[YouTube Channel Live Proxy] 頻道不存在（404）');
      return {
        status: 'ERROR',
        videoId: null,
        finalUrl: url,
        message: '頻道不存在或已刪除 (404)'
      };
    }
    
    // 處理其他非重定向狀態
    console.warn('[YouTube Channel Live Proxy] 收到非預期狀態碼:', status);
    return {
      status: 'ERROR', 
      videoId: null, 
      finalUrl: url,
      message: `Received unexpected status code: ${status}`
    };

  } catch (error) {
    console.error('[YouTube Channel Live Proxy] 請求錯誤:', {
      url: url,
      error: error.message,
      stack: error.stack
    });
    
    return { 
      status: 'ERROR', 
      videoId: null, 
      finalUrl: url,
      message: `Fetch error: ${error.message}`
    };
  }
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
      // 使用遞迴方式跟隨重定向
      const result = await checkLiveStatusRecursive(channelId, liveUrl, 0);
      
      // 轉換結果格式以匹配現有 API
      const responseData = {
        status: result.status === 'LIVE' ? 200 : (result.status === 'OFFLINE' ? 200 : (result.status === 'ERROR' ? 500 : 200)),
        finalUrl: result.finalUrl,
        isLive: result.status === 'LIVE',
        liveVideoId: result.videoId || null,
        message: result.status === 'LIVE' ? '開台中（或預定直播）' : (result.status === 'OFFLINE' ? '未開台' : (result.message || '未知狀態'))
      };
      
      // 處理 404 錯誤
      if (result.status === 'ERROR' && result.message && result.message.includes('404')) {
        responseData.status = 404;
        responseData.isLive = false;
        responseData.message = '頻道不存在或已刪除';
      }
      
      return new Response(
        JSON.stringify(responseData),
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

