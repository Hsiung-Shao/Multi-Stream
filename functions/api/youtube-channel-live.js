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
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      };
      
      // 手動跟隨重定向以獲取最終 URL
      // Cloudflare Workers 的 fetch 即使使用 redirect: 'follow'，response.url 可能仍返回原始 URL
      // 所以我們需要手動跟隨重定向
      let currentUrl = liveUrl;
      let finalUrl = liveUrl;
      let status = 200;
      let redirectCount = 0;
      let finalResponse = null;
      const maxRedirects = 10; // 最大重定向次數，防止無限循環
      
      while (redirectCount < maxRedirects) {
        const response = await fetch(currentUrl, {
          method: 'GET',
          redirect: 'manual', // 手動處理重定向
          headers: headers
        });
        
        status = response.status;
        
        // 檢查是否是重定向狀態碼（301, 302, 303, 307, 308）
        if (status >= 300 && status < 400) {
          const location = response.headers.get('Location');
          if (location) {
            // 如果是相對路徑，轉換為絕對路徑
            if (location.startsWith('/')) {
              const urlObj = new URL(currentUrl);
              finalUrl = `${urlObj.origin}${location}`;
            } else if (location.startsWith('http://') || location.startsWith('https://')) {
              finalUrl = location;
            } else {
              // 相對路徑，需要與當前 URL 合併
              const urlObj = new URL(currentUrl);
              finalUrl = new URL(location, urlObj.origin).href;
            }
            
            console.log(`[YouTube Channel Live Proxy] 重定向 ${redirectCount + 1}: ${currentUrl} -> ${finalUrl}`);
            
            currentUrl = finalUrl;
            redirectCount++;
            continue;
          } else {
            // 重定向但沒有 Location header，停止
            finalResponse = response;
            break;
          }
        } else {
          // 不是重定向狀態碼，這就是最終響應
          finalResponse = response;
          // 嘗試從 response.url 獲取最終 URL（如果有的話）
          if (response.url && response.url !== currentUrl) {
            finalUrl = response.url;
          } else {
            finalUrl = currentUrl;
          }
          break;
        }
      }
      
      // 如果達到最大重定向次數，使用最後一個 URL
      if (redirectCount >= maxRedirects) {
        console.warn('[YouTube Channel Live Proxy] 達到最大重定向次數，使用最後一個 URL');
      }
      
      console.log('[YouTube Channel Live Proxy] 響應:', { 
        channelId, 
        status, 
        finalUrl,
        redirectCount: redirectCount,
        statusText: finalResponse ? finalResponse.statusText : 'N/A'
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

