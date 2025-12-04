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
  
  // RSS URL 格式
  rssBaseUrl: 'https://www.youtube.com/feeds/videos.xml',
  
  // oEmbed URL 格式（用於從 videoID 獲取 channelID）
  oEmbedUrl: 'https://www.youtube.com/oembed',
  
  // YouTube Data API v3 代理 URL（用於通過 @username 獲取 channel ID）
  apiProxyUrl: '/api/youtube-proxy',
  
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
async function fetchChannelRSS(channelId) {
  if (!channelId) {
    throw new Error('channelId 不能為空');
  }
  
  // 檢查快取
  const cacheKey = getCacheKey('rss', channelId);
  const cached = getCachedData(cacheKey);
  if (cached) {
    console.log('[YouTube RSS] 使用快取:', { channelId });
    return cached;
  }
  
  // 檢查是否在 Cloudflare Pages 環境
  const useProxy = await ensureProxyConfig();
  console.log('[YouTube RSS] 開始獲取 RSS Feed:', { channelId, useProxy });
  
  let rssUrl;
  if (useProxy) {
    // 使用後端代理（解決 CORS 問題）
    rssUrl = `${RSS_CONFIG.rssProxyUrl}?channel_id=${encodeURIComponent(channelId)}`;
  } else {
    // 本地開發：直接調用（會遇到 CORS 問題，但可以測試）
    rssUrl = `${RSS_CONFIG.rssBaseUrl}?channel_id=${encodeURIComponent(channelId)}`;
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
        channelId, 
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
      channelId, 
      xmlLength: xmlText.length,
      useProxy 
    });
    
    // 儲存快取
    setCachedData(cacheKey, xmlText);
    
    return xmlText;
  } catch (error) {
    console.error('[YouTube RSS] 獲取 RSS Feed 錯誤:', { 
      channelId, 
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

// 從 videoID 獲取 channelID（使用 YouTube Data API v3）
// 返回 { channelId: string | null, channelUrl: string | null }
// channelId: 真正的 channel ID（可用於 RSS）
// channelUrl: 頻道 URL
async function getChannelIdFromVideoId(videoId) {
  if (!videoId) {
    throw new Error('videoId 不能為空');
  }
  
  console.log('[YouTube RSS] ========== 流程開始：從 videoID 獲取 channelID ==========');
  console.log('[YouTube RSS] 步驟 1: 輸入串流網址（videoID）:', { videoId });
  
  // 檢查快取（快取格式可能是 string 或 object）
  const cacheKey = getCacheKey('videoToChannel', videoId);
  const cached = getCachedData(cacheKey);
  if (cached) {
    // 如果是舊格式（string），直接返回
    if (typeof cached === 'string') {
      console.log('[YouTube RSS] 使用快取 (videoID -> channelID):', { videoId, channelId: cached });
      return { channelId: cached, channelUrl: `https://www.youtube.com/channel/${cached}` };
    }
    // 如果是新格式（object），返回對象
    console.log('[YouTube RSS] 使用快取 (videoID -> channelID):', { videoId, ...cached });
    return cached;
  }
  
  try {
    // 使用 YouTube Data API v3 的 videos.list 端點，直接從 videoID 獲取 channel ID
    // API 端點：GET https://www.googleapis.com/youtube/v3/videos?part=snippet&id={VIDEO_ID}&key={API_KEY}
    
    // 檢查本地是否有配置 API Key（優先使用本地配置）
    const localApiKey = window.CONFIG?.YOUTUBE_API_KEY || '';
    const useProxy = await ensureProxyConfig();
    let apiUrl;
    
    console.log('[YouTube RSS] 檢查 API Key 配置:', { 
      hasLocalApiKey: !!localApiKey, 
      useProxy, 
      configExists: typeof window.CONFIG !== 'undefined' 
    });
    
    if (localApiKey) {
      // 如果配置了本地 API Key，優先使用本地 API Key
      // 注意：直接調用會遇到 CORS 問題，建議使用代理或配置 CORS
      // 但為了測試，我們先嘗試直接調用
      apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(localApiKey)}`;
      console.log('[YouTube RSS] 步驟 2: ✅ 使用本地 API Key 調用 YouTube Data API v3:', { 
        videoId, 
        apiKeyLength: localApiKey.length,
        note: '直接調用可能遇到 CORS 問題，如果失敗請使用代理' 
      });
    } else if (useProxy) {
      // 如果沒有本地 API Key，使用後端代理（避免 CORS 和 API Key 暴露）
      apiUrl = `${RSS_CONFIG.apiProxyUrl}?endpoint=/videos&part=snippet&id=${encodeURIComponent(videoId)}`;
      console.log('[YouTube RSS] 步驟 2: 使用代理調用 YouTube Data API v3:', { videoId, proxyUrl: apiUrl });
    } else {
      // 既沒有本地 API Key，也沒有代理
      console.warn('[YouTube RSS] ⚠️ 本地開發環境缺少 YOUTUBE_API_KEY，且無法使用代理');
      console.warn('[YouTube RSS] 提示：請在 config.js 中設定 window.CONFIG.YOUTUBE_API_KEY = "your_api_key"');
      throw new Error('缺少 YOUTUBE_API_KEY 配置，請在 config.js 中設定 window.CONFIG.YOUTUBE_API_KEY');
    }
    
    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('[YouTube RSS] YouTube Data API v3 請求失敗:', { 
        videoId, 
        status: apiResponse.status, 
        statusText: apiResponse.statusText,
        error: errorText 
      });
      throw new Error(`無法獲取影片資訊：${apiResponse.status} ${apiResponse.statusText}`);
    }
    
    const apiData = await apiResponse.json();
    console.log('[YouTube RSS] YouTube Data API v3 回應:', { videoId, response: apiData });
    
    // 解析 API 回應，提取 channelId
    let channelId = null;
    
    if (apiData.items && apiData.items.length > 0) {
      const videoItem = apiData.items[0];
      if (videoItem.snippet && videoItem.snippet.channelId) {
        channelId = videoItem.snippet.channelId;
        console.log('[YouTube RSS] 步驟 2: ✅ 成功通過 YouTube Data API v3 獲取真實 channelID:', { videoId, channelId });
        console.log('[YouTube RSS] ========== 流程完成：channelID 已獲取 ==========');
      } else {
        console.warn('[YouTube RSS] ⚠️ API 回應中沒有 channelId:', { videoId, response: apiData });
      }
    } else {
      console.warn('[YouTube RSS] ⚠️ API 回應中沒有找到影片資訊:', { videoId, response: apiData });
    }
    
    // 構建結果對象
    let result = {
      channelId: channelId,
      channelUrl: null
    };
    
    if (channelId) {
      // 如果有 channelID，使用 /channel/ 格式的 URL
      result.channelUrl = `https://www.youtube.com/channel/${channelId}`;
    } else {
      console.warn('[YouTube RSS] ⚠️ 無法獲取 channelID:', { videoId });
    }
    
    // 儲存快取
    setCachedData(cacheKey, result);
    
    return result;
  } catch (error) {
    console.error('[YouTube RSS] 從 videoID 獲取 channelID 錯誤:', { 
      videoId, 
      error: error.message 
    });
    // 如果是 CORS 錯誤
    if (error.message.includes('CORS') || (error.name === 'TypeError' && error.message.includes('fetch'))) {
      throw new Error('無法連接到 YouTube Data API v3，請檢查網路連線或部署到 Cloudflare Pages 以使用代理');
    } else if (error.message.includes('YOUTUBE_API_KEY')) {
      throw new Error('缺少 YOUTUBE_API_KEY 配置，請在 Cloudflare Pages 環境變數中設定');
    }
    throw error;
  }
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
    // 獲取 RSS Feed
    const xmlText = await fetchChannelRSS(channelId);
    
    // 解析 RSS Feed
    const feedData = parseRSSFeed(xmlText);
    console.log('[YouTube RSS] RSS Feed 解析完成:', { 
      channelId, 
      videoCount: feedData.videos.length,
      hasLatestVideo: !!feedData.latestVideo 
    });
    
    if (!feedData.latestVideo) {
      console.log('[YouTube RSS] 沒有最新影片:', { channelId });
      return {
        isLive: false,
        channelId: channelId
      };
    }
    
    // 檢查最新影片是否為直播
    const isLive = isVideoLive(feedData.latestVideo);
    console.log('[YouTube RSS] 開台狀態檢查結果:', { 
      channelId, 
      isLive, 
      videoId: feedData.latestVideo.videoId,
      title: feedData.latestVideo.title,
      published: feedData.latestVideo.published
    });
    
    if (isLive) {
      return {
        isLive: true,
        channelId: channelId,
        videoId: feedData.latestVideo.videoId,
        title: feedData.latestVideo.title,
        viewerCount: null, // RSS 不提供觀看數
        startedAt: feedData.latestVideo.published || null,
        url: feedData.latestVideo.url
      };
    } else {
      return {
        isLive: false,
        channelId: channelId
      };
    }
  } catch (error) {
    // 發生錯誤時，返回未知狀態而不是拋出錯誤
    console.error('[YouTube RSS] 檢查開台狀態錯誤:', { 
      channelId, 
      error: error.message 
    });
    return {
      isLive: null, // null 表示未知
      channelId: channelId,
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

// 匯出函數到全域
if (typeof window !== 'undefined') {
  window.youtubeApi = {
    // 從 videoID 獲取 channelID
    getChannelIdFromVideoId: YOUTUBE_RSS_ENABLED ? getChannelIdFromVideoId : (() => Promise.resolve(null)),
    
    // 檢查頻道開台狀態
    checkChannelLiveStatus: YOUTUBE_RSS_ENABLED ? checkChannelLiveStatus : (() => Promise.resolve({ isLive: false })),
    
    // 批量檢查頻道開台狀態
    checkMultipleChannelsLiveStatus: YOUTUBE_RSS_ENABLED ? checkMultipleChannelsLiveStatus : (() => Promise.resolve({})),
    
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
