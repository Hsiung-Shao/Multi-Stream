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
 * @param {Array} redirectChain - 重定向鏈（用於追蹤完整過程）
 * @returns {Promise<{status: string, videoId: (string|null), finalUrl: string, message?: string, redirectChain?: Array}>}
 */
async function checkLiveStatusRecursive(channelId, url, redirects, redirectChain = []) {
  if (redirects >= MAX_REDIRECTS) {
    console.warn(`[YouTube Channel Live Proxy] ⚠️  達到最大重定向次數 (${MAX_REDIRECTS})`);
    console.log(`[YouTube Channel Live Proxy] 完整重定向鏈:`, JSON.stringify(redirectChain, null, 2));
    return { 
      status: 'ERROR', 
      videoId: null, 
      finalUrl: url,
      message: 'Reached maximum redirect count.',
      redirectChain: redirectChain
    };
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };

    // 先嘗試使用 redirect: 'manual' 來手動跟隨重定向
    const response = await fetch(url, {
      method: 'GET',
      // 🚨 關鍵設定：設定為 'manual'，這樣 fetch 不會自動追蹤 302，而是返回 302 狀態
      redirect: 'manual', 
      headers: headers
    });

    const status = response.status;
    const finalUrl = response.url || url; // Fetch API 的 response.url 顯示的是發送請求的 URL
    const locationHeader = response.headers.get('Location');

    // 記錄當前請求到重定向鏈
    const stepInfo = {
      step: redirects + 1,
      requestedUrl: url,
      status: status,
      responseUrl: finalUrl,
      locationHeader: locationHeader || null,
      timestamp: new Date().toISOString()
    };
    
    redirectChain.push(stepInfo);

    console.log(`[YouTube Channel Live Proxy] ===== 遞迴請求 步驟 ${redirects + 1} =====`);
    console.log(`[YouTube Channel Live Proxy] 請求 URL: ${url}`);
    console.log(`[YouTube Channel Live Proxy] 響應狀態: ${status}`);
    console.log(`[YouTube Channel Live Proxy] Response URL: ${finalUrl}`);
    console.log(`[YouTube Channel Live Proxy] Location Header: ${locationHeader || '(無)'}`);
    console.log(`[YouTube Channel Live Proxy] =========================================`);

    if (status >= 300 && status < 400) {
      // 狀態碼是 3XX (重定向)
      const location = response.headers.get('Location');
      
      if (location) {
        // 處理相對路徑，確保得到完整的 URL
        const newUrl = new URL(location, url).href;
        
        // 更新重定向鏈中的目標 URL
        stepInfo.redirectTo = newUrl;
        
        console.log(`[YouTube Channel Live Proxy] ⬇️  重定向 ${redirects + 1}:`);
        console.log(`[YouTube Channel Live Proxy]    從: ${url}`);
        console.log(`[YouTube Channel Live Proxy]    到: ${newUrl}`);
        
        // 🚨 核心判斷邏輯：如果新的 URL 包含 'watch?v='，我們已經找到目標，立即返回
        if (newUrl.includes("watch?v=")) {
          // 使用簡單的字符串切割方式提取 video ID
          const parts = newUrl.split('v=');
          const videoId = parts.length > 1 ? parts[1].split('&')[0] : null;

          console.log('[YouTube Channel Live Proxy] ✅ 在重定向中發現直播 URL!');
          console.log(`[YouTube Channel Live Proxy]    頻道 ID: ${channelId}`);
          console.log(`[YouTube Channel Live Proxy]    視頻 ID: ${videoId}`);
          console.log(`[YouTube Channel Live Proxy]    最終 URL: ${newUrl}`);
          console.log(`[YouTube Channel Live Proxy] ========== 重定向過程完成 ==========`);
          console.log(`[YouTube Channel Live Proxy] 總共重定向 ${redirects + 1} 次`);
          console.log(`[YouTube Channel Live Proxy] 完整重定向鏈:`, JSON.stringify(redirectChain, null, 2));

          return {
            status: 'LIVE',
            videoId: videoId,
            finalUrl: newUrl,
            redirectChain: redirectChain
          };
        }
        
        // 繼續追蹤下一個重定向
        return checkLiveStatusRecursive(channelId, newUrl, redirects + 1, redirectChain);
      } else {
        // 重定向但沒有 Location header
        console.warn('[YouTube Channel Live Proxy] 重定向但沒有 Location header');
        console.warn('[YouTube Channel Live Proxy] ⚠️  重定向但沒有 Location header');
        return {
          status: 'ERROR',
          videoId: null,
          finalUrl: url,
          message: 'Redirect without Location header',
          redirectChain: redirectChain
        };
      }
    } 
    
    if (status === 200) {
      // 狀態碼是 200 OK
      // 檢查是否已經重定向到 watch 頁面
      if (finalUrl.includes('watch?v=')) {
        const parts = finalUrl.split('v=');
        const videoId = parts.length > 1 ? parts[1].split('&')[0] : null;
        
        console.log('[YouTube Channel Live Proxy] ✅ 在最終響應中發現直播 URL');
        console.log(`[YouTube Channel Live Proxy]    頻道 ID: ${channelId}`);
        console.log(`[YouTube Channel Live Proxy]    視頻 ID: ${videoId}`);
        console.log(`[YouTube Channel Live Proxy]    最終 URL: ${finalUrl}`);
        console.log(`[YouTube Channel Live Proxy] ========== 重定向過程完成 ==========`);
        console.log(`[YouTube Channel Live Proxy] 完整重定向鏈:`, JSON.stringify(redirectChain, null, 2));
        
        return { 
          status: 'LIVE', 
          videoId: videoId, 
          finalUrl: finalUrl,
          redirectChain: redirectChain
        };
      }

      // 收到 200 但 URL 沒有變化，可能需要解析 HTML 內容來查找重定向
      // 或者需要嘗試使用 redirect: 'follow' 來自動跟隨重定向
      console.log('[YouTube Channel Live Proxy] 收到 200 響應但 URL 未變化');
      
      // 先嘗試使用 redirect: 'follow' 來獲取最終 URL
      console.log('[YouTube Channel Live Proxy] 嘗試使用 redirect: follow 自動跟隨重定向...');
      try {
        const followResponse = await fetch(url, {
          method: 'GET',
          redirect: 'follow', // 自動跟隨重定向
          headers: headers
        });
        
        const followUrl = followResponse.url || url;
        console.log(`[YouTube Channel Live Proxy] redirect: follow 的結果 URL: ${followUrl}`);
        
        if (followUrl !== url && followUrl.includes('watch?v=')) {
          // 使用 redirect: follow 成功獲取了重定向 URL
          const parts = followUrl.split('v=');
          const videoId = parts.length > 1 ? parts[1].split('&')[0] : null;
          
          console.log('[YouTube Channel Live Proxy] ✅ 使用 redirect: follow 發現直播 URL');
          console.log(`[YouTube Channel Live Proxy]    頻道 ID: ${channelId}`);
          console.log(`[YouTube Channel Live Proxy]    視頻 ID: ${videoId}`);
          console.log(`[YouTube Channel Live Proxy]    最終 URL: ${followUrl}`);
          
          stepInfo.redirectTo = followUrl;
          stepInfo.redirectSource = 'FOLLOW_REDIRECT';
          
          return {
            status: 'LIVE',
            videoId: videoId,
            finalUrl: followUrl,
            redirectChain: redirectChain
          };
        } else if (followUrl !== url) {
          // 有重定向但還不是 watch URL，繼續跟隨
          console.log(`[YouTube Channel Live Proxy] redirect: follow 發現重定向: ${url} -> ${followUrl}`);
          stepInfo.redirectTo = followUrl;
          stepInfo.redirectSource = 'FOLLOW_REDIRECT';
          return checkLiveStatusRecursive(channelId, followUrl, redirects + 1, redirectChain);
        }
      } catch (followError) {
        console.warn('[YouTube Channel Live Proxy] redirect: follow 失敗:', followError.message);
      }
      
      // 如果 redirect: follow 沒有找到重定向，嘗試解析 HTML 內容
      console.log('[YouTube Channel Live Proxy] 嘗試解析 HTML 內容來查找重定向...');
      
      try {
        // 重新獲取響應（之前的響應可能已被消耗）
        const htmlResponse = await fetch(url, {
          method: 'GET',
          redirect: 'manual',
          headers: headers
        });
        
        // 讀取響應的前 50KB 來查找重定向（避免讀取整個頁面）
        const text = await htmlResponse.text();
        const htmlPreview = text.substring(0, Math.min(50000, text.length));
        
        console.log(`[YouTube Channel Live Proxy] HTML 內容長度: ${text.length} 字符，已讀取前 ${htmlPreview.length} 字符`);
        
        // 查找各種可能的重定向方式
        
        // 1. 查找 JavaScript 重定向
        const jsRedirectPatterns = [
          /window\.location\s*=\s*["']([^"']+)["']/i,
          /window\.location\.href\s*=\s*["']([^"']+)["']/i,
          /location\.replace\s*\(["']([^"']+)["']\)/i,
          /location\.href\s*=\s*["']([^"']+)["']/i,
          /window\.open\s*\(["']([^"']+)["']/i
        ];
        
        let redirectUrl = null;
        
        for (const pattern of jsRedirectPatterns) {
          const match = htmlPreview.match(pattern);
          if (match && match[1]) {
            redirectUrl = match[1];
            console.log(`[YouTube Channel Live Proxy] 🔍 在 HTML 中發現 JavaScript 重定向: ${redirectUrl}`);
            break;
          }
        }
        
        // 2. 查找 Meta Refresh 重定向
        if (!redirectUrl) {
          const metaRefreshMatch = htmlPreview.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^;]*;\s*url=([^"']+)["']/i);
          if (metaRefreshMatch && metaRefreshMatch[1]) {
            redirectUrl = metaRefreshMatch[1];
            console.log(`[YouTube Channel Live Proxy] 🔍 在 HTML 中發現 Meta Refresh 重定向: ${redirectUrl}`);
          }
        }
        
        // 3. 查找 canonical link
        if (!redirectUrl) {
          const canonicalMatch = htmlPreview.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
          if (canonicalMatch && canonicalMatch[1]) {
            redirectUrl = canonicalMatch[1];
            console.log(`[YouTube Channel Live Proxy] 🔍 在 HTML 中發現 Canonical URL: ${redirectUrl}`);
          }
        }
        
        // 4. 查找 og:url meta tag
        if (!redirectUrl) {
          const ogUrlMatch = htmlPreview.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i);
          if (ogUrlMatch && ogUrlMatch[1]) {
            redirectUrl = ogUrlMatch[1];
            console.log(`[YouTube Channel Live Proxy] 🔍 在 HTML 中發現 OG URL: ${redirectUrl}`);
          }
        }
        
        // 如果找到重定向 URL，處理它
        if (redirectUrl) {
          // 構建完整 URL
          let newUrl;
          if (redirectUrl.startsWith('http://') || redirectUrl.startsWith('https://')) {
            newUrl = redirectUrl;
          } else if (redirectUrl.startsWith('/')) {
            const urlObj = new URL(url);
            newUrl = `${urlObj.origin}${redirectUrl}`;
          } else {
            const urlObj = new URL(url);
            newUrl = new URL(redirectUrl, urlObj.origin).href;
          }
          
          console.log(`[YouTube Channel Live Proxy] 🔄 處理發現的重定向 URL: ${newUrl}`);
          
          // 檢查是否包含 watch?v=
          if (newUrl.includes('watch?v=')) {
            const parts = newUrl.split('v=');
            const videoId = parts.length > 1 ? parts[1].split('&')[0] : null;
            
            console.log('[YouTube Channel Live Proxy] ✅ 在 HTML 重定向中發現直播 URL');
            console.log(`[YouTube Channel Live Proxy]    頻道 ID: ${channelId}`);
            console.log(`[YouTube Channel Live Proxy]    視頻 ID: ${videoId}`);
            console.log(`[YouTube Channel Live Proxy]    最終 URL: ${newUrl}`);
            
            // 更新重定向鏈
            stepInfo.redirectTo = newUrl;
            stepInfo.redirectSource = 'HTML_PARSE';
            
            return {
              status: 'LIVE',
              videoId: videoId,
              finalUrl: newUrl,
              redirectChain: redirectChain
            };
          }
          
          // 如果有重定向但還不是 watch URL，繼續跟隨
          console.log(`[YouTube Channel Live Proxy] 🔄 繼續跟隨 HTML 中找到的重定向: ${newUrl}`);
          stepInfo.redirectTo = newUrl;
          stepInfo.redirectSource = 'HTML_PARSE';
          return checkLiveStatusRecursive(channelId, newUrl, redirects + 1, redirectChain);
        }
        
        // 沒有找到重定向，檢查是否在原始 URL 中
        console.log('[YouTube Channel Live Proxy] ❌ 無法在 HTML 中找到重定向 URL');
        
      } catch (parseError) {
        console.warn('[YouTube Channel Live Proxy] 解析 HTML 失敗:', parseError.message);
      }

      // 狀態：已停止跳轉，停留在非直播頁面 (如頻道首頁)
      console.log('[YouTube Channel Live Proxy] ❌ 頻道未開台（停留在非直播頁面）');
      console.log(`[YouTube Channel Live Proxy] ========== 重定向過程完成 ==========`);
      console.log(`[YouTube Channel Live Proxy] 總共重定向 ${redirects} 次`);
      console.log(`[YouTube Channel Live Proxy] 完整重定向鏈:`, JSON.stringify(redirectChain, null, 2));
      return {
        status: 'OFFLINE',
        videoId: null,
        finalUrl: url,
        redirectChain: redirectChain
      };
    } 
    
    if (status === 404) {
      // 頻道不存在
      console.log('[YouTube Channel Live Proxy] ❌ 頻道不存在（404）');
      console.log(`[YouTube Channel Live Proxy] ========== 重定向過程完成 ==========`);
      console.log(`[YouTube Channel Live Proxy] 完整重定向鏈:`, JSON.stringify(redirectChain, null, 2));
      return {
        status: 'ERROR',
        videoId: null,
        finalUrl: url,
        message: '頻道不存在或已刪除 (404)',
        redirectChain: redirectChain
      };
    }
    
    // 處理其他非重定向狀態
    console.warn('[YouTube Channel Live Proxy] ⚠️  收到非預期狀態碼:', status);
    console.log(`[YouTube Channel Live Proxy] 完整重定向鏈:`, JSON.stringify(redirectChain, null, 2));
    return {
      status: 'ERROR', 
      videoId: null, 
      finalUrl: url,
      message: `Received unexpected status code: ${status}`,
      redirectChain: redirectChain
    };

  } catch (error) {
    console.error('[YouTube Channel Live Proxy] 請求錯誤:', {
      url: url,
      error: error.message,
      stack: error.stack
    });
    
    console.log(`[YouTube Channel Live Proxy] 完整重定向鏈:`, JSON.stringify(redirectChain, null, 2));
    return { 
      status: 'ERROR', 
      videoId: null, 
      finalUrl: url,
      message: `Fetch error: ${error.message}`,
      redirectChain: redirectChain
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
      console.log('[YouTube Channel Live Proxy] ========== 開始檢查重定向過程 ==========');
      const result = await checkLiveStatusRecursive(channelId, liveUrl, 0);
      console.log('[YouTube Channel Live Proxy] ========== 檢查完成 ==========');
      
      // 轉換結果格式以匹配現有 API
      const redirectChain = result.redirectChain || [];
      const redirectCount = redirectChain.length;
      
      const responseData = {
        status: result.status === 'LIVE' ? 200 : (result.status === 'OFFLINE' ? 200 : (result.status === 'ERROR' ? 500 : 200)),
        finalUrl: result.finalUrl,
        isLive: result.status === 'LIVE',
        liveVideoId: result.videoId || null,
        message: result.status === 'LIVE' ? '開台中（或預定直播）' : (result.status === 'OFFLINE' ? '未開台' : (result.message || '未知狀態')),
        redirectChain: redirectChain, // 包含完整重定向過程
        redirectCount: redirectCount, // 重定向次數
        redirectSummary: redirectChain.map((step, index) => ({
          step: step.step,
          from: step.requestedUrl,
          to: step.redirectTo || step.requestedUrl,
          status: step.status,
          hasLocation: !!step.locationHeader
        })) // 重定向過程摘要（更簡潔）
      };
      
      console.log('[YouTube Channel Live Proxy] ========== 重定向過程摘要 ==========');
      console.log(`[YouTube Channel Live Proxy] 總共重定向次數: ${redirectCount}`);
      if (redirectChain.length > 0) {
        redirectChain.forEach((step, index) => {
          console.log(`[YouTube Channel Live Proxy] 步驟 ${step.step}:`);
          console.log(`[YouTube Channel Live Proxy]   請求: ${step.requestedUrl}`);
          console.log(`[YouTube Channel Live Proxy]   狀態: ${step.status}`);
          if (step.redirectTo) {
            console.log(`[YouTube Channel Live Proxy]   重定向到: ${step.redirectTo}`);
          }
        });
      }
      console.log('[YouTube Channel Live Proxy] ======================================');
      
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

