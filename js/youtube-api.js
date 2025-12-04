// YouTube RSS 服務模組
// 用於查詢頻道開台狀態（使用 RSS Feed）

// 使用 IIFE 封裝，避免全局作用域污染
(function() {
  'use strict';

// 檢測是否在 Cloudflare Pages 環境
let isCloudflarePages = null;
async function checkCloudflarePagesEnvironment() {
  if (isCloudflarePages !== null) {
    return isCloudflarePages;
  }
  
  try {
    // 嘗試訪問 Cloudflare Pages Function 來檢測環境
    const response = await fetch('/api/youtube-rss', {
      method: 'OPTIONS',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // 如果回應不是 404，表示代理端點存在（在 Cloudflare Pages 環境）
    isCloudflarePages = response.status !== 404;
  } catch (error) {
    // 網路錯誤或其他錯誤，假設不在 Cloudflare Pages 環境
    isCloudflarePages = false;
  }
  
  return isCloudflarePages;
}

// RSS 配置
const RSS_CONFIG = {
  // 是否使用後端代理（解決 CORS 問題）
  // 自動檢測：在 Cloudflare Pages 環境使用代理，本地開發不使用
  useProxy: null, // null 表示需要自動檢測
  
  // 代理 URL（如果使用代理）
  rssProxyUrl: '/api/youtube-rss',
  pageFetchProxyUrl: '/api/youtube-page-fetch',
  
  // RSS URL 格式
  rssBaseUrl: 'https://www.youtube.com/feeds/videos.xml',
  
  // 快取設定
  cacheEnabled: true,
  cacheDuration: 300000, // 5 分鐘快取（RSS 更新頻率較低）
  
  // RSS 快取
  rssCache: new Map()
};

// 確保代理設定已初始化
async function ensureProxyConfig() {
  if (RSS_CONFIG.useProxy === null) {
    // 自動檢測是否在 Cloudflare Pages 環境
    const isCloudflare = await checkCloudflarePagesEnvironment();
    RSS_CONFIG.useProxy = isCloudflare;
  }
  return RSS_CONFIG.useProxy;
}

// 取得快取鍵
function getCacheKey(type, id) {
  return `${type}_${id}`;
}

// 檢查快取
function getCachedData(key) {
  if (!RSS_CONFIG.cacheEnabled) return null;
  
  const cached = RSS_CONFIG.rssCache.get(key);
  if (!cached) return null;
  
  const now = Date.now();
  if (now - cached.timestamp > RSS_CONFIG.cacheDuration) {
    RSS_CONFIG.rssCache.delete(key);
    return null;
  }
  
  return cached.data;
}

// 儲存快取
function setCachedData(key, data) {
  if (!RSS_CONFIG.cacheEnabled) return;
  RSS_CONFIG.rssCache.set(key, {
    data: data,
    timestamp: Date.now()
  });
}

// 獲取頻道 RSS Feed
// 支持 channelId (UC...) 或 @handle 格式
async function fetchChannelRSS(channelIdOrHandle) {
  if (!channelIdOrHandle) {
    throw new Error('channelId 或 handle 不能為空');
  }
  
  // 檢查快取
  const cacheKey = getCacheKey('rss', channelIdOrHandle);
  const cached = getCachedData(cacheKey);
  if (cached) {
    console.log('[YouTube RSS] 使用快取:', { channelIdOrHandle });
    return cached;
  }
  
  // 檢查是否在 Cloudflare Pages 環境
  const useProxy = await ensureProxyConfig();
  console.log('[YouTube RSS] 開始獲取 RSS Feed:', { channelIdOrHandle, useProxy });
  
  // 構建 RSS URL（支持 channel_id 和 user 兩種格式）
  let rssUrl;
  if (channelIdOrHandle.startsWith('@')) {
    // @handle 格式
    if (useProxy) {
      rssUrl = `${RSS_CONFIG.rssProxyUrl}?channel_id=${encodeURIComponent(channelIdOrHandle)}`;
    } else {
      rssUrl = `${RSS_CONFIG.rssBaseUrl}?user=${encodeURIComponent(channelIdOrHandle)}`;
    }
  } else {
    // channel ID 格式
    if (useProxy) {
      rssUrl = `${RSS_CONFIG.rssProxyUrl}?channel_id=${encodeURIComponent(channelIdOrHandle)}`;
    } else {
      rssUrl = `${RSS_CONFIG.rssBaseUrl}?channel_id=${encodeURIComponent(channelIdOrHandle)}`;
    }
  }
  
  try {
    const response = await fetch(rssUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/xml'
      }
    });
    
    if (!response.ok) {
      console.error('[YouTube RSS] 獲取 RSS Feed 失敗:', { 
        channelIdOrHandle, 
        status: response.status, 
        statusText: response.statusText 
      });
      if (response.status === 404) {
        throw new Error('頻道不存在或 RSS Feed 不可用');
      }
      throw new Error(`無法獲取 RSS Feed：${response.status} ${response.statusText}`);
    }
    
    const xmlText = await response.text();
    console.log('[YouTube RSS] RSS Feed 獲取成功:', { 
      channelIdOrHandle, 
      xmlLength: xmlText.length,
      useProxy 
    });
    
    // 儲存快取
    setCachedData(cacheKey, xmlText);
    
    return xmlText;
  } catch (error) {
    console.error('[YouTube RSS] 獲取 RSS Feed 錯誤:', { 
      channelIdOrHandle, 
      error: error.message,
      useProxy 
    });
    if (error.message.includes('CORS') || (error.name === 'TypeError' && error.message.includes('fetch'))) {
      throw new Error('無法連接到 YouTube RSS Feed，請檢查網路連線或部署到 Cloudflare Pages 以使用代理');
    }
    throw error;
  }
}

// 解析 RSS Feed XML
function parseRSSFeed(xmlText) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    // 檢查是否有解析錯誤
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error('RSS Feed 解析失敗：' + parserError.textContent);
    }
    
    // 獲取所有 entry（影片項目）
    const entries = xmlDoc.querySelectorAll('entry');
    const videos = [];
    
    entries.forEach(entry => {
      try {
        // 提取影片 ID（從 <yt:videoId> 或 <link> 中）
        let videoId = '';
        const videoIdElement = entry.querySelector('yt\\:videoId, videoId');
        if (videoIdElement) {
          videoId = videoIdElement.textContent.trim();
        } else {
          // 從 link 中提取
          const linkElement = entry.querySelector('link');
          if (linkElement) {
            const href = linkElement.getAttribute('href') || '';
            const match = href.match(/[?&]v=([^&]+)/);
            if (match) {
              videoId = match[1];
            }
          }
        }
        
        // 提取標題
        const titleElement = entry.querySelector('title');
        const title = titleElement ? titleElement.textContent.trim() : '';
        
        // 提取發布時間
        const publishedElement = entry.querySelector('published');
        const published = publishedElement ? publishedElement.textContent.trim() : '';
        
        // 提取作者（頻道名稱）
        const authorElement = entry.querySelector('author name');
        const author = authorElement ? authorElement.textContent.trim() : '';
        
        // 提取描述
        const mediaDescription = entry.querySelector('media\\:description, description');
        const description = mediaDescription ? mediaDescription.textContent.trim() : '';
        
        // 提取縮圖
        const mediaThumbnail = entry.querySelector('media\\:thumbnail');
        const thumbnailUrl = mediaThumbnail ? mediaThumbnail.getAttribute('url') : '';
        
        if (videoId) {
          videos.push({
            videoId: videoId,
            title: title,
            published: published,
            publishedTime: published ? new Date(published).getTime() : null,
            author: author,
            description: description,
            thumbnailUrl: thumbnailUrl,
            url: `https://www.youtube.com/watch?v=${videoId}`
          });
        }
      } catch (e) {
        // 跳過無法解析的項目
        console.warn('無法解析 RSS entry:', e);
      }
    });
    
    return {
      videos: videos,
      latestVideo: videos.length > 0 ? videos[0] : null
    };
  } catch (error) {
    throw new Error('解析 RSS Feed 失敗：' + error.message);
  }
}

// 判斷影片是否為直播
function isVideoLive(video) {
  if (!video) return false;
  
  // 檢查發布時間（如果非常接近現在，可能是直播）
  const now = Date.now();
  const publishedTime = video.publishedTime;
  
  if (publishedTime) {
    // 如果發布時間在過去 2 小時內，可能是直播
    const timeDiff = now - publishedTime;
    const twoHours = 2 * 60 * 60 * 1000;
    
    if (timeDiff < twoHours && timeDiff > 0) {
      // 檢查標題或描述中是否包含直播相關關鍵字
      const title = (video.title || '').toLowerCase();
      const description = (video.description || '').toLowerCase();
      
      const liveKeywords = ['live', '直播', 'streaming', 'stream', '正在直播', 'ライブ', '생방송'];
      const hasLiveKeyword = liveKeywords.some(keyword => 
        title.includes(keyword) || description.includes(keyword)
      );
      
      if (hasLiveKeyword) {
        return true;
      }
      
      // 如果發布時間在過去 30 分鐘內，且標題不包含「錄影」等關鍵字，可能是直播
      const thirtyMinutes = 30 * 60 * 1000;
      if (timeDiff < thirtyMinutes) {
        const recordedKeywords = ['錄影', 'recorded', '錄製', 'replay', '重播'];
        const hasRecordedKeyword = recordedKeywords.some(keyword =>
          title.includes(keyword) || description.includes(keyword)
        );
        
        if (!hasRecordedKeyword) {
          return true;
        }
      }
    }
  }
  
  return false;
}

// 從任意 YouTube 網址獲取 @handle 和 RSS URL（使用網頁解析，不使用 API）
// 輸入：任意 YouTube 網址（string）
// 返回 { handle: string | null, rssUrl: string | null, channelId: string | null }
async function getRssFromAnyUrl(youtubeUrl) {
  if (!youtubeUrl) {
    throw new Error('youtubeUrl 不能為空');
  }
  
  console.log('[YouTube RSS] ========== 流程開始：從任意網址獲取 RSS ==========');
  console.log('[YouTube RSS] 步驟 1: 輸入串流網址:', { youtubeUrl });
  
  // 檢查快取
  const cacheKey = getCacheKey('urlToRss', youtubeUrl);
  const cached = getCachedData(cacheKey);
  if (cached) {
    console.log('[YouTube RSS] 使用快取 (URL -> RSS):', { youtubeUrl, ...cached });
    return cached;
  }
  
  try {
    // Step 1 & 2：直接 fetch 網頁（使用代理避免 CORS）
    const useProxy = await ensureProxyConfig();
    let fetchUrl;
    
    if (useProxy) {
      // 使用後端代理（解決 CORS 問題）
      fetchUrl = `${RSS_CONFIG.pageFetchProxyUrl}?url=${encodeURIComponent(youtubeUrl)}`;
      console.log('[YouTube RSS] 步驟 2: 使用代理獲取 YouTube 頁面:', { youtubeUrl, proxyUrl: fetchUrl });
    } else {
      // 本地開發：直接調用（會遇到 CORS 問題）
      fetchUrl = youtubeUrl;
      console.log('[YouTube RSS] 步驟 2: 直接獲取 YouTube 頁面（可能遇到 CORS）:', { youtubeUrl });
    }
    
    const res = await fetch(fetchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    
    if (!res.ok) {
      throw new Error(`無法獲取頁面：${res.status} ${res.statusText}`);
    }
    
    const html = await res.text();
    console.log('[YouTube RSS] 頁面獲取成功，開始解析 @handle:', { youtubeUrl, htmlLength: html.length });
    
    // Step 3：正規抓出 @handle（超寬鬆匹配）
    const match = html.match(/"channelHandle":"(@[^"]+)"/) 
               || html.match(/"ownerChannelHandle":"(@[^"]+)"/)
               || html.match(/youtube\.com\/(@[A-Za-z0-9_]+)/)
               || html.match(/\/@([A-Za-z0-9_]+)/);
    
    if (!match) {
      console.warn('[YouTube RSS] ⚠️ 找不到 @handle，嘗試查找 channelId');
      
      // 如果找不到 @handle，嘗試查找 channelId
      const channelIdMatch = html.match(/"channelId":"([UC][a-zA-Z0-9_-]{23})"/)
                          || html.match(/channelId["\s:=]+"([UC][a-zA-Z0-9_-]{23})"/)
                          || html.match(/youtube\.com\/channel\/([UC][a-zA-Z0-9_-]{23})/);
      
      if (channelIdMatch && channelIdMatch[1]) {
        const channelId = channelIdMatch[1];
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        console.log('[YouTube RSS] ✅ 找到 channelId（無法找到 @handle）:', { channelId, rssUrl });
        
        const result = {
          handle: null,
          rssUrl: rssUrl,
          channelId: channelId
        };
        
        setCachedData(cacheKey, result);
        return result;
      }
      
      throw new Error('找不到 @handle 或 channelId（極少數古老頻道）');
    }
    
    const handle = match[1]; // 例如 @hitomi_teraz
    console.log('[YouTube RSS] 步驟 3: ✅ 成功提取 @handle:', { handle });
    
    // Step 4：構建 RSS URL
    // 注意：YouTube RSS 實際上不支持 ?user=@handle，只支持 ?channel_id={CHANNEL_ID}
    // 但我們先嘗試使用 @handle，如果失敗再嘗試獲取 channelId
    let rssUrl = `https://www.youtube.com/feeds/videos.xml?user=${handle}`;
    
    // 嘗試從 HTML 中獲取 channelId（用於備用）
    let channelId = null;
    const channelIdMatch = html.match(/"channelId":"([UC][a-zA-Z0-9_-]{23})"/)
                        || html.match(/channelId["\s:=]+"([UC][a-zA-Z0-9_-]{23})"/);
    if (channelIdMatch && channelIdMatch[1]) {
      channelId = channelIdMatch[1];
      // 使用 channelId 構建 RSS URL（這是標準格式）
      rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
      console.log('[YouTube RSS] 同時找到 channelId，使用標準 RSS 格式:', { channelId, rssUrl });
    }
    
    console.log('[YouTube RSS] 步驟 4: ✅ RSS URL 已構建:', { handle, rssUrl, channelId });
    console.log('[YouTube RSS] ========== 流程完成：RSS URL 已獲取 ==========');
    
    const result = {
      handle: handle,
      rssUrl: rssUrl,
      channelId: channelId
    };
    
    // 儲存快取
    setCachedData(cacheKey, result);
    
    return result;
  } catch (error) {
    console.error('[YouTube RSS] 從網址獲取 RSS 錯誤:', { 
      youtubeUrl, 
      error: error.message 
    });
    if (error.message.includes('CORS') || (error.name === 'TypeError' && error.message.includes('fetch'))) {
      throw new Error('無法連接到 YouTube，請檢查網路連線或部署到 Cloudflare Pages 以使用代理');
    }
    throw error;
  }
}

// 從 videoID 獲取 channelID（使用網頁解析，不使用 API）
// 返回 { channelId: string | null, channelUrl: string | null, handle: string | null, rssUrl: string | null }
async function getChannelIdFromVideoId(videoId) {
  if (!videoId) {
    throw new Error('videoId 不能為空');
  }
  
  // 構建 YouTube 網址
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  // 使用 getRssFromAnyUrl 獲取資訊
  const rssInfo = await getRssFromAnyUrl(youtubeUrl);
  
  // 構建返回結果
  const result = {
    channelId: rssInfo.channelId,
    channelUrl: rssInfo.channelId ? `https://www.youtube.com/channel/${rssInfo.channelId}` : null,
    handle: rssInfo.handle,
    rssUrl: rssInfo.rssUrl
  };
  
  return result;
}

// 查詢頻道開台狀態（通過頻道 ID，使用 RSS）
async function checkChannelLiveStatus(channelId) {
  if (!channelId) {
    console.warn('[YouTube RSS] checkChannelLiveStatus: channelId 為空');
    return {
      isLive: false,
      channelId: channelId
    };
  }
  
  console.log('[YouTube RSS] 開始檢查開台狀態:', { channelId });
  
  try {
    // 獲取 RSS Feed（支持 channelId 或 @handle）
    const xmlText = await fetchChannelRSS(channelIdOrHandle);
    
    // 解析 RSS Feed
    const feedData = parseRSSFeed(xmlText);
    console.log('[YouTube RSS] RSS Feed 解析完成:', { 
      channelIdOrHandle, 
      videoCount: feedData.videos.length,
      hasLatestVideo: !!feedData.latestVideo 
    });
    
    if (!feedData.latestVideo) {
      console.log('[YouTube RSS] 沒有最新影片:', { channelIdOrHandle });
      return {
        isLive: false,
        channelId: channelIdOrHandle
      };
    }
    
    // 檢查最新影片是否為直播
    const isLive = isVideoLive(feedData.latestVideo);
    console.log('[YouTube RSS] 開台狀態檢查結果:', { 
      channelIdOrHandle, 
      isLive, 
      videoId: feedData.latestVideo.videoId,
      title: feedData.latestVideo.title,
      published: feedData.latestVideo.published
    });
    
    if (isLive) {
      return {
        isLive: true,
        channelId: channelIdOrHandle,
        videoId: feedData.latestVideo.videoId,
        title: feedData.latestVideo.title,
        viewerCount: null, // RSS 不提供觀看數
        startedAt: feedData.latestVideo.published || null,
        url: feedData.latestVideo.url
      };
    } else {
      return {
        isLive: false,
        channelId: channelIdOrHandle
      };
    }
  } catch (error) {
    // 發生錯誤時，返回未知狀態而不是拋出錯誤
    console.error('[YouTube RSS] 檢查開台狀態錯誤:', { 
      channelIdOrHandle, 
      error: error.message 
    });
    return {
      isLive: null, // null 表示未知
      channelId: channelIdOrHandle,
      error: error.message
    };
  }
}

// 批量查詢多個頻道開台狀態（使用 RSS）
async function checkMultipleChannelsLiveStatus(channelIds) {
  if (!channelIds || channelIds.length === 0) {
    console.log('[YouTube RSS] checkMultipleChannelsLiveStatus: 沒有頻道 ID');
    return {};
  }
  
  console.log('[YouTube RSS] 開始批量檢查開台狀態:', { count: channelIds.length, channelIds });
  
  const results = {};
  
  // 初始化所有頻道為未開台
  channelIds.forEach(id => {
    results[id] = {
      isLive: false,
      channelId: id
    };
  });
  
  // 並行查詢所有頻道（但限制並發數以避免過載）
  const batchSize = 5; // 每次處理 5 個頻道
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < channelIds.length; i += batchSize) {
    const batch = channelIds.slice(i, i + batchSize);
    console.log('[YouTube RSS] 處理批次:', { batchIndex: Math.floor(i / batchSize) + 1, batchSize: batch.length, channelIds: batch });
    
    await Promise.all(
      batch.map(async (channelId) => {
        try {
          const status = await checkChannelLiveStatus(channelId);
          results[channelId] = status;
          if (status.isLive) {
            successCount++;
          }
        } catch (e) {
          // 單個頻道檢查失敗，繼續處理其他頻道
          errorCount++;
          console.error('[YouTube RSS] 單個頻道檢查失敗:', { channelId, error: e.message });
          results[channelId] = {
            isLive: null,
            channelId: channelId,
            error: e.message
          };
        }
      })
    );
    
    // 批次之間稍作延遲，避免過於頻繁的請求
    if (i + batchSize < channelIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  const liveCount = Object.values(results).filter(r => r.isLive === true).length;
  console.log('[YouTube RSS] 批量檢查完成:', { 
    total: channelIds.length, 
    live: liveCount, 
    success: successCount, 
    errors: errorCount 
  });
  
  return results;
}

// 清除快取
function clearYouTubeApiCache() {
  RSS_CONFIG.rssCache.clear();
}

// 取得配置
function getYouTubeApiConfig() {
  return {
    useProxy: RSS_CONFIG.useProxy,
    proxyUrl: RSS_CONFIG.rssProxyUrl,
    cacheEnabled: RSS_CONFIG.cacheEnabled,
    cacheDuration: RSS_CONFIG.cacheDuration
  };
}

// 設定配置
function setYouTubeApiConfig(config) {
  if (config.useProxy !== undefined) {
    RSS_CONFIG.useProxy = config.useProxy;
  }
  
  if (config.proxyUrl !== undefined) {
    RSS_CONFIG.rssProxyUrl = config.proxyUrl;
  }
  
  if (config.cacheEnabled !== undefined) {
    RSS_CONFIG.cacheEnabled = config.cacheEnabled;
  }
  
  if (config.cacheDuration !== undefined) {
    RSS_CONFIG.cacheDuration = config.cacheDuration;
  }
}

// YouTube RSS 功能已啟用
const YOUTUBE_RSS_ENABLED = true;

// 測試函數：從任意串流網址獲取頻道資訊（包括 username）
// 用於測試和調試
async function testGetChannelInfoFromUrl(url) {
  console.log('[YouTube RSS 測試] ========== 開始測試：從串流網址獲取頻道資訊 ==========');
  console.log('[YouTube RSS 測試] 輸入網址:', url);
  
  try {
    // 提取 videoID
    let videoId = null;
    const urlPatterns = [
      /[?&]v=([a-zA-Z0-9_-]{11})/, // youtube.com/watch?v=...
      /youtu\.be\/([a-zA-Z0-9_-]{11})/, // youtu.be/...
      /embed\/([a-zA-Z0-9_-]{11})/ // youtube.com/embed/...
    ];
    
    for (const pattern of urlPatterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        videoId = match[1];
        break;
      }
    }
    
    if (!videoId) {
      throw new Error('無法從網址中提取 videoID');
    }
    
    console.log('[YouTube RSS 測試] 提取的 videoID:', videoId);
    
    // 獲取頻道資訊
    const channelInfo = await getChannelIdFromVideoId(videoId);
    
    console.log('[YouTube RSS 測試] ========== 測試結果 ==========');
    console.log('[YouTube RSS 測試] 頻道資訊:', {
      videoId: videoId,
      channelId: channelInfo.channelId,
      channelTitle: channelInfo.channelTitle || '無',
      channelCustomUrl: channelInfo.channelCustomUrl || '無',
      channelUrl: channelInfo.channelUrl,
      note: channelInfo.channelCustomUrl ? 
        `頻道有 @username: ${channelInfo.channelCustomUrl}` : 
        '頻道可能沒有設定 @username（但可以使用 channelId 透過 RSS 監測）'
    });
    
    // 如果獲取到 channelId，嘗試獲取 RSS Feed 來驗證
    if (channelInfo.channelId) {
      console.log('[YouTube RSS 測試] 嘗試獲取 RSS Feed 來驗證頻道...');
      try {
        const xmlText = await fetchChannelRSS(channelInfo.channelId);
        const feedData = parseRSSFeed(xmlText);
        console.log('[YouTube RSS 測試] RSS Feed 驗證成功:', {
          channelId: channelInfo.channelId,
          videoCount: feedData.videos.length,
          latestVideo: feedData.latestVideo ? {
            videoId: feedData.latestVideo.videoId,
            title: feedData.latestVideo.title,
            published: feedData.latestVideo.published
          } : null
        });
      } catch (rssError) {
        console.warn('[YouTube RSS 測試] RSS Feed 驗證失敗（可能是 CORS 問題）:', rssError.message);
      }
    }
    
    console.log('[YouTube RSS 測試] ========== 測試完成 ==========');
    
    return channelInfo;
  } catch (error) {
    console.error('[YouTube RSS 測試] 測試失敗:', error);
    throw error;
  }
}

// 匯出函數到全域
if (typeof window !== 'undefined') {
  window.youtubeApi = {
    // 從任意 YouTube 網址獲取 @handle 和 RSS URL（不使用 API）
    getRssFromAnyUrl: YOUTUBE_RSS_ENABLED ? getRssFromAnyUrl : (() => Promise.resolve(null)),
    
    // 從 videoID 獲取 channelID（使用網頁解析，不使用 API）
    getChannelIdFromVideoId: YOUTUBE_RSS_ENABLED ? getChannelIdFromVideoId : (() => Promise.resolve(null)),
    
    // 檢查頻道開台狀態（支持 channelId 或 @handle）
    checkChannelLiveStatus: YOUTUBE_RSS_ENABLED ? checkChannelLiveStatus : (() => Promise.resolve({ isLive: false })),
    
    // 批量檢查頻道開台狀態
    checkMultipleChannelsLiveStatus: YOUTUBE_RSS_ENABLED ? checkMultipleChannelsLiveStatus : (() => Promise.resolve({})),
    
    // 測試函數：從任意串流網址獲取頻道資訊
    testGetChannelInfoFromUrl: YOUTUBE_RSS_ENABLED ? testGetChannelInfoFromUrl : (() => Promise.resolve(null)),
    
    // 配置相關
    setConfig: setYouTubeApiConfig,
    getConfig: getYouTubeApiConfig,
    clearCache: clearYouTubeApiCache,
    
    // 功能狀態
    isEnabled: () => YOUTUBE_RSS_ENABLED,
    
    // 已移除的功能（RSS 無法實現）
    searchChannels: () => Promise.resolve([]), // RSS 無法搜尋頻道
    searchChannelsOnly: () => Promise.resolve([]) // RSS 無法搜尋頻道
  };
}

})(); // 結束 IIFE
