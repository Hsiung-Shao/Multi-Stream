// YouTube API 服務模組
// 用於搜尋頻道和查詢開台狀態

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
    const response = await fetch('/api/youtube-proxy', {
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

// YouTube API 配置
// 本地開發：從 config.js 讀取
// Cloudflare Pages：從環境變數讀取（通過代理）
function getYouTubeApiKey() {
  // 在 Cloudflare Pages 環境中，API Key 由後端代理處理，前端不需要
  // 本地開發時，從 config.js 讀取
  try {
    if (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.YOUTUBE_API_KEY) {
      return window.CONFIG.YOUTUBE_API_KEY;
    }
    if (typeof CONFIG !== 'undefined' && CONFIG.YOUTUBE_API_KEY) {
      return CONFIG.YOUTUBE_API_KEY;
    }
  } catch (e) {
    // 忽略錯誤
  }
  
  // 最後回退到 localStorage
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('youtubeApiKey') || '';
  }
  
  return '';
}

const YOUTUBE_API_CONFIG = {
  // API Key - 本地開發時從 config.js 讀取，Cloudflare Pages 環境由代理處理
  apiKey: getYouTubeApiKey(),
  
  // API 基礎 URL
  baseUrl: 'https://www.googleapis.com/youtube/v3',
  
  // 是否使用後端代理（解決 CORS 問題）
  // 自動檢測：在 Cloudflare Pages 環境使用代理，本地開發不使用
  useProxy: null, // null 表示需要自動檢測
  
  // 代理 URL（如果使用代理）
  proxyUrl: '/api/youtube-proxy',
  
  // 快取設定
  cacheEnabled: true,
  cacheDuration: 60000, // 1 分鐘快取
  
  // 流量限制設定（每日配額）
  quotaLimit: {
    dailyLimit: 10000, // 每日配額（預設 10,000，可根據實際配額調整）
    resetTime: null, // 每日重置時間（毫秒時間戳）
    currentUsage: 0, // 當前使用量
    isBlocked: false, // 是否因流量超限而被封鎖
    blockUntil: null // 封鎖直到此時間（毫秒時間戳）
  }
};

// 快取儲存
const youtubeApiCache = new Map();

// 流量限制追蹤（儲存在 localStorage 中以便跨頁面保持）
function loadQuotaTracking() {
  if (typeof localStorage === 'undefined') {
    return;
  }
  
  try {
    const saved = localStorage.getItem('youtubeApiQuotaTracking');
    if (saved) {
      const data = JSON.parse(saved);
      YOUTUBE_API_CONFIG.quotaLimit.currentUsage = data.currentUsage || 0;
      YOUTUBE_API_CONFIG.quotaLimit.resetTime = data.resetTime || null;
      YOUTUBE_API_CONFIG.quotaLimit.isBlocked = data.isBlocked || false;
      YOUTUBE_API_CONFIG.quotaLimit.blockUntil = data.blockUntil || null;
      
      // 檢查是否需要重置（每日重置）
      const now = Date.now();
      if (YOUTUBE_API_CONFIG.quotaLimit.resetTime && now > YOUTUBE_API_CONFIG.quotaLimit.resetTime) {
        // 重置每日配額
        resetDailyQuota();
      }
      
      // 檢查封鎖是否已過期
      if (YOUTUBE_API_CONFIG.quotaLimit.blockUntil && now > YOUTUBE_API_CONFIG.quotaLimit.blockUntil) {
        YOUTUBE_API_CONFIG.quotaLimit.isBlocked = false;
        YOUTUBE_API_CONFIG.quotaLimit.blockUntil = null;
        saveQuotaTracking();
      }
    } else {
      // 首次使用，設定重置時間為明天 00:00
      resetDailyQuota();
    }
  } catch (e) {
    // 解析失敗，重置
    resetDailyQuota();
  }
}

// 儲存流量限制追蹤
function saveQuotaTracking() {
  if (typeof localStorage === 'undefined') {
    return;
  }
  
  try {
    localStorage.setItem('youtubeApiQuotaTracking', JSON.stringify({
      currentUsage: YOUTUBE_API_CONFIG.quotaLimit.currentUsage,
      resetTime: YOUTUBE_API_CONFIG.quotaLimit.resetTime,
      isBlocked: YOUTUBE_API_CONFIG.quotaLimit.isBlocked,
      blockUntil: YOUTUBE_API_CONFIG.quotaLimit.blockUntil
    }));
  } catch (e) {
    // 儲存失敗，靜默處理
  }
}

// 重置每日配額
function resetDailyQuota() {
  const now = Date.now();
  const tomorrow = new Date(now);
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  YOUTUBE_API_CONFIG.quotaLimit.currentUsage = 0;
  YOUTUBE_API_CONFIG.quotaLimit.resetTime = tomorrow.getTime();
  YOUTUBE_API_CONFIG.quotaLimit.isBlocked = false;
  YOUTUBE_API_CONFIG.quotaLimit.blockUntil = null;
  saveQuotaTracking();
}

// 檢查流量限制
function checkQuotaLimit() {
  const now = Date.now();
  
  // 檢查是否需要重置（每日重置）
  if (YOUTUBE_API_CONFIG.quotaLimit.resetTime && now > YOUTUBE_API_CONFIG.quotaLimit.resetTime) {
    resetDailyQuota();
  }
  
  // 檢查是否被封鎖
  if (YOUTUBE_API_CONFIG.quotaLimit.isBlocked) {
    if (YOUTUBE_API_CONFIG.quotaLimit.blockUntil && now < YOUTUBE_API_CONFIG.quotaLimit.blockUntil) {
      const waitTime = Math.ceil((YOUTUBE_API_CONFIG.quotaLimit.blockUntil - now) / 1000 / 60); // 分鐘
      throw new Error(`YouTube API 流量已用完，請等待 ${waitTime} 分鐘後再試`);
    } else {
      // 封鎖已過期，解除封鎖
      YOUTUBE_API_CONFIG.quotaLimit.isBlocked = false;
      YOUTUBE_API_CONFIG.quotaLimit.blockUntil = null;
      saveQuotaTracking();
    }
  }
  
  // 檢查是否超過每日配額
  if (YOUTUBE_API_CONFIG.quotaLimit.currentUsage >= YOUTUBE_API_CONFIG.quotaLimit.dailyLimit) {
    // 設定封鎖直到明天 00:00
    const tomorrow = new Date(now);
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    YOUTUBE_API_CONFIG.quotaLimit.isBlocked = true;
    YOUTUBE_API_CONFIG.quotaLimit.blockUntil = tomorrow.getTime();
    saveQuotaTracking();
    
    // 顯示通知
    showQuotaExceededNotification();
    
    throw new Error('YouTube API 每日流量配額已用完，將於明天 00:00 恢復');
  }
}

// 記錄 API 使用量（根據 YouTube API 的配額成本）
function recordApiUsage(quotaCost) {
  YOUTUBE_API_CONFIG.quotaLimit.currentUsage += quotaCost;
  saveQuotaTracking();
  
  // 檢查是否接近配額限制（80% 時警告）
  const usagePercent = (YOUTUBE_API_CONFIG.quotaLimit.currentUsage / YOUTUBE_API_CONFIG.quotaLimit.dailyLimit) * 100;
  if (usagePercent >= 80 && usagePercent < 100) {
    showQuotaWarningNotification(usagePercent);
  }
}

// 顯示流量超限通知
function showQuotaExceededNotification() {
  // 檢查是否已經顯示過通知（避免重複顯示）
  if (document.getElementById('youtube-quota-exceeded-notification')) {
    return;
  }
  
  const notification = document.createElement('div');
  notification.id = 'youtube-quota-exceeded-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff4444;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    z-index: 10000;
    max-width: 400px;
    font-size: 14px;
    line-height: 1.6;
  `;
  
  const title = document.createElement('div');
  title.style.cssText = 'font-weight: bold; margin-bottom: 8px; font-size: 16px;';
  title.textContent = '⚠️ YouTube API 流量已用完';
  
  const message = document.createElement('div');
  message.style.cssText = 'margin-bottom: 10px;';
  message.textContent = 'YouTube API 的每日流量配額已用完，搜尋和開台狀態查詢功能將暫停使用，直到明天 00:00 恢復。';
  
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = `
    background: rgba(255,255,255,0.2);
    border: none;
    color: white;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    margin-top: 8px;
  `;
  closeBtn.textContent = '我知道了';
  closeBtn.onclick = () => {
    notification.remove();
  };
  
  notification.appendChild(title);
  notification.appendChild(message);
  notification.appendChild(closeBtn);
  
  document.body.appendChild(notification);
  
  // 10 秒後自動關閉
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 10000);
}

// 顯示流量警告通知
function showQuotaWarningNotification(usagePercent) {
  // 檢查是否已經顯示過通知（避免重複顯示）
  if (document.getElementById('youtube-quota-warning-notification')) {
    return;
  }
  
  const notification = document.createElement('div');
  notification.id = 'youtube-quota-warning-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ffaa00;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    z-index: 10000;
    max-width: 400px;
    font-size: 14px;
    line-height: 1.6;
  `;
  
  const title = document.createElement('div');
  title.style.cssText = 'font-weight: bold; margin-bottom: 8px; font-size: 16px;';
  title.textContent = '⚠️ YouTube API 流量警告';
  
  const message = document.createElement('div');
  message.style.cssText = 'margin-bottom: 10px;';
  message.textContent = `YouTube API 的每日流量配額已使用 ${Math.round(usagePercent)}%，請注意節約使用。`;
  
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = `
    background: rgba(255,255,255,0.2);
    border: none;
    color: white;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    margin-top: 8px;
  `;
  closeBtn.textContent = '我知道了';
  closeBtn.onclick = () => {
    notification.remove();
  };
  
  notification.appendChild(title);
  notification.appendChild(message);
  notification.appendChild(closeBtn);
  
  document.body.appendChild(notification);
  
  // 5 秒後自動關閉
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 5000);
}

// 取得快取鍵
function getCacheKey(endpoint, params) {
  return `${endpoint}_${JSON.stringify(params)}`;
}

// 檢查快取
function getCachedData(key) {
  if (!YOUTUBE_API_CONFIG.cacheEnabled) return null;
  
  const cached = youtubeApiCache.get(key);
  if (!cached) return null;
  
  const now = Date.now();
  if (now - cached.timestamp > YOUTUBE_API_CONFIG.cacheDuration) {
    youtubeApiCache.delete(key);
    return null;
  }
  
  return cached.data;
}

// 儲存快取
function setCachedData(key, data) {
  if (!YOUTUBE_API_CONFIG.cacheEnabled) return;
  youtubeApiCache.set(key, {
    data: data,
    timestamp: Date.now()
  });
}

// 確保代理設定已初始化
async function ensureProxyConfig() {
  if (YOUTUBE_API_CONFIG.useProxy === null) {
    // 自動檢測是否在 Cloudflare Pages 環境
    const isCloudflare = await checkCloudflarePagesEnvironment();
    YOUTUBE_API_CONFIG.useProxy = isCloudflare;
  }
  return YOUTUBE_API_CONFIG.useProxy;
}

// 建立 API 請求
async function makeApiRequest(endpoint, params = {}) {
  // 檢查流量限制
  checkQuotaLimit();
  
  // 建立快取鍵
  const cacheKey = getCacheKey(endpoint, params);
  const cached = getCachedData(cacheKey);
  if (cached) {
    return cached;
  }
  
  // 確保代理設定已初始化
  const useProxy = await ensureProxyConfig();
  
  // 建立 URL
  let url;
  if (useProxy && YOUTUBE_API_CONFIG.proxyUrl) {
    // 使用後端代理（解決 CORS 問題，在 Cloudflare Pages 環境）
    const proxyParams = new URLSearchParams({
      endpoint: endpoint,
      ...params
    });
    url = `${YOUTUBE_API_CONFIG.proxyUrl}?${proxyParams.toString()}`;
  } else {
    // 本地開發：直接調用 YouTube API（需要 API Key，但會遇到 CORS 問題）
    // 注意：這在本地開發時會失敗，因為 YouTube API 不支援 CORS
    // 建議在本地開發時使用代理服務器或等待部署到 Cloudflare Pages
    if (!YOUTUBE_API_CONFIG.apiKey) {
      throw new Error('YouTube API Key 未設定。請在 config.js 中提供 YOUTUBE_API_KEY。\n\n注意：本地開發時直接調用 YouTube API 會遇到 CORS 問題。建議：\n1. 部署到 Cloudflare Pages 並設定 YOUTUBE_API_KEY 環境變數（自動使用代理）\n2. 或在本地使用代理服務器');
    }
    
    const queryParams = new URLSearchParams({
      key: YOUTUBE_API_CONFIG.apiKey,
      ...params
    });
    url = `${YOUTUBE_API_CONFIG.baseUrl}${endpoint}?${queryParams.toString()}`;
  }
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // 處理 404 錯誤（本地開發時代理端點不存在）
    if (response.status === 404 && useProxy) {
      // 如果代理端點不存在，可能是本地開發環境
      // 嘗試不使用代理（但會遇到 CORS 問題）
      if (!YOUTUBE_API_CONFIG.apiKey) {
        throw new Error('YouTube API 代理端點不存在，且未設定 API Key。請在 config.js 中提供 YOUTUBE_API_KEY，或部署到 Cloudflare Pages 並設定 YOUTUBE_API_KEY 環境變數。');
      }
      
      // 回退到直接調用（會遇到 CORS 問題，但至少可以測試其他功能）
      const queryParams = new URLSearchParams({
        key: YOUTUBE_API_CONFIG.apiKey,
        ...params
      });
      const directUrl = `${YOUTUBE_API_CONFIG.baseUrl}${endpoint}?${queryParams.toString()}`;
      
      // 注意：這會因為 CORS 而失敗，但至少會給出正確的錯誤訊息
      const directResponse = await fetch(directUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!directResponse.ok) {
        if (directResponse.status === 403) {
          // 處理 403 錯誤
          const errorData = await directResponse.json().catch(() => ({}));
          if (errorData.error && errorData.error.errors) {
            const error = errorData.error.errors[0];
            if (error.reason === 'quotaExceeded' || error.reason === 'dailyLimitExceeded') {
              const now = Date.now();
              const tomorrow = new Date(now);
              tomorrow.setHours(0, 0, 0, 0);
              tomorrow.setDate(tomorrow.getDate() + 1);
              
              YOUTUBE_API_CONFIG.quotaLimit.isBlocked = true;
              YOUTUBE_API_CONFIG.quotaLimit.blockUntil = tomorrow.getTime();
              saveQuotaTracking();
              
              showQuotaExceededNotification();
              throw new Error('YouTube API 每日流量配額已用完，將於明天 00:00 恢復');
            }
          }
        }
        throw new Error(`YouTube API 請求失敗：${directResponse.status} ${directResponse.statusText}`);
      }
      
      const directData = await directResponse.json();
      let quotaCost = 1;
      if (endpoint.includes('/search')) {
        quotaCost = 100;
      }
      recordApiUsage(quotaCost);
      setCachedData(cacheKey, directData);
      return directData;
    }
    
    if (!response.ok) {
      if (response.status === 403) {
        // 403 可能是配額超限或 API Key 無效
        const errorData = await response.json().catch(() => ({}));
        if (errorData.error && errorData.error.errors) {
          const error = errorData.error.errors[0];
          if (error.reason === 'quotaExceeded' || error.reason === 'dailyLimitExceeded') {
            // 配額超限，設定封鎖
            const now = Date.now();
            const tomorrow = new Date(now);
            tomorrow.setHours(0, 0, 0, 0);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            YOUTUBE_API_CONFIG.quotaLimit.isBlocked = true;
            YOUTUBE_API_CONFIG.quotaLimit.blockUntil = tomorrow.getTime();
            saveQuotaTracking();
            
            showQuotaExceededNotification();
            throw new Error('YouTube API 每日流量配額已用完，將於明天 00:00 恢復');
          } else if (error.reason === 'keyInvalid') {
            throw new Error('YouTube API Key 無效，請檢查設定');
          }
        }
        throw new Error('YouTube API 請求被拒絕，請檢查 API Key 和配額設定');
      } else if (response.status === 404) {
        return null; // 資源不存在
      } else {
        throw new Error(`API 請求失敗：${response.status} ${response.statusText}`);
      }
    }
    
    const data = await response.json();
    
    // 記錄 API 使用量
    // YouTube API 配額成本：
    // - search.list: 100 units
    // - channels.list: 1 unit
    // - videos.list: 1 unit
    let quotaCost = 1; // 預設成本
    if (endpoint.includes('/search')) {
      quotaCost = 100; // search.list 成本較高
    }
    recordApiUsage(quotaCost);
    
    // 儲存快取
    setCachedData(cacheKey, data);
    
    return data;
  } catch (error) {
    if (error.message.includes('流量') || error.message.includes('配額') || error.message.includes('quota')) {
      throw error;
    }
    
    // 處理網路錯誤
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('無法連接到 YouTube API，請檢查網路連線');
    }
    
    throw error;
  }
}

// 搜尋 YouTube 頻道
async function searchYouTubeChannels(query, limit = 10) {
  if (!query || query.trim().length === 0) {
    return [];
  }
  
  try {
    const data = await makeApiRequest('/search', {
      part: 'snippet',
      q: query.trim(),
      type: 'channel',
      maxResults: limit,
      order: 'relevance'
    });
    
    if (!data || !data.items || data.items.length === 0) {
      return [];
    }
    
    // 取得頻道詳細資訊（包含訂閱數等）
    const channelIds = data.items.map(item => item.snippet.channelId).join(',');
    const channelData = await makeApiRequest('/channels', {
      part: 'snippet,statistics,contentDetails',
      id: channelIds
    });
    
    const channelMap = {};
    if (channelData && channelData.items) {
      channelData.items.forEach(channel => {
        channelMap[channel.id] = channel;
      });
    }
    
    // 檢查哪些頻道正在直播
    const liveChannelIds = [];
    if (channelData && channelData.items) {
      for (const channel of channelData.items) {
        if (channel.contentDetails && channel.contentDetails.relatedPlaylists && channel.contentDetails.relatedPlaylists.uploads) {
          // 檢查上傳列表中的最新影片是否為直播
          try {
            const uploadsData = await makeApiRequest('/playlistItems', {
              part: 'snippet',
              playlistId: channel.contentDetails.relatedPlaylists.uploads,
              maxResults: 1
            });
            
            if (uploadsData && uploadsData.items && uploadsData.items.length > 0) {
              const videoId = uploadsData.items[0].snippet.resourceId.videoId;
              const videoData = await makeApiRequest('/videos', {
                part: 'snippet,liveStreamingDetails',
                id: videoId
              });
              
              if (videoData && videoData.items && videoData.items.length > 0) {
                const video = videoData.items[0];
                if (video.snippet.liveBroadcastContent === 'live' && video.liveStreamingDetails) {
                  liveChannelIds.push({
                    channelId: channel.id,
                    videoId: videoId,
                    liveStreamingDetails: video.liveStreamingDetails
                  });
                }
              }
            }
          } catch (e) {
            // 檢查失敗，跳過
          }
        }
      }
    }
    
    return data.items.map(item => {
      const channel = channelMap[item.snippet.channelId] || {};
      const liveInfo = liveChannelIds.find(l => l.channelId === item.snippet.channelId);
      const isLive = !!liveInfo;
      
      return {
        id: item.snippet.channelId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnailUrl: item.snippet.thumbnails?.default?.url || item.snippet.thumbnails?.medium?.url,
        subscriberCount: channel.statistics ? parseInt(channel.statistics.subscriberCount || 0) : 0,
        videoCount: channel.statistics ? parseInt(channel.statistics.videoCount || 0) : 0,
        isLive: isLive,
        liveVideoId: liveInfo ? liveInfo.videoId : null,
        viewerCount: liveInfo && liveInfo.liveStreamingDetails ? parseInt(liveInfo.liveStreamingDetails.concurrentViewers || 0) : 0,
        url: `https://www.youtube.com/channel/${item.snippet.channelId}${isLive && liveInfo ? `/live` : ''}`
      };
    });
  } catch (error) {
    throw error;
  }
}

// 查詢頻道開台狀態（通過頻道 ID）
async function checkChannelLiveStatus(channelId) {
  if (!channelId) {
    return null;
  }
  
  try {
    // 取得頻道資訊
    const channelData = await makeApiRequest('/channels', {
      part: 'contentDetails',
      id: channelId
    });
    
    if (!channelData || !channelData.items || channelData.items.length === 0) {
      return {
        isLive: false,
        channelId: channelId
      };
    }
    
    const channel = channelData.items[0];
    if (!channel.contentDetails || !channel.contentDetails.relatedPlaylists || !channel.contentDetails.relatedPlaylists.uploads) {
      return {
        isLive: false,
        channelId: channelId
      };
    }
    
    // 檢查上傳列表中的最新影片
    const uploadsData = await makeApiRequest('/playlistItems', {
      part: 'snippet',
      playlistId: channel.contentDetails.relatedPlaylists.uploads,
      maxResults: 1
    });
    
    if (!uploadsData || !uploadsData.items || uploadsData.items.length === 0) {
      return {
        isLive: false,
        channelId: channelId
      };
    }
    
    const videoId = uploadsData.items[0].snippet.resourceId.videoId;
    
    // 檢查影片是否為直播
    const videoData = await makeApiRequest('/videos', {
      part: 'snippet,liveStreamingDetails',
      id: videoId
    });
    
    if (!videoData || !videoData.items || videoData.items.length === 0) {
      return {
        isLive: false,
        channelId: channelId
      };
    }
    
    const video = videoData.items[0];
    const isLive = video.snippet.liveBroadcastContent === 'live' && video.liveStreamingDetails;
    
    if (isLive) {
      return {
        isLive: true,
        channelId: channelId,
        videoId: videoId,
        title: video.snippet.title,
        viewerCount: video.liveStreamingDetails.concurrentViewers ? parseInt(video.liveStreamingDetails.concurrentViewers) : null,
        startedAt: video.liveStreamingDetails.actualStartTime || null
      };
    } else {
      return {
        isLive: false,
        channelId: channelId
      };
    }
  } catch (error) {
    // 發生錯誤時，返回未知狀態而不是拋出錯誤
    return {
      isLive: null, // null 表示未知
      channelId: channelId,
      error: error.message
    };
  }
}

// 批量查詢多個頻道開台狀態
async function checkMultipleChannelsLiveStatus(channelIds) {
  if (!channelIds || channelIds.length === 0) {
    return {};
  }
  
  const results = {};
  
  // 初始化所有頻道為未開台
  channelIds.forEach(id => {
    results[id] = {
      isLive: false,
      channelId: id
    };
  });
  
  try {
    // 批量查詢頻道資訊
    const channelIdsStr = channelIds.join(',');
    const channelData = await makeApiRequest('/channels', {
      part: 'contentDetails',
      id: channelIdsStr
    });
    
    if (!channelData || !channelData.items) {
      return results;
    }
    
    // 為每個頻道檢查最新影片
    for (const channel of channelData.items) {
      const channelId = channel.id;
      
      if (!channel.contentDetails || !channel.contentDetails.relatedPlaylists || !channel.contentDetails.relatedPlaylists.uploads) {
        continue;
      }
      
      try {
        // 檢查上傳列表中的最新影片
        const uploadsData = await makeApiRequest('/playlistItems', {
          part: 'snippet',
          playlistId: channel.contentDetails.relatedPlaylists.uploads,
          maxResults: 1
        });
        
        if (!uploadsData || !uploadsData.items || uploadsData.items.length === 0) {
          continue;
        }
        
        const videoId = uploadsData.items[0].snippet.resourceId.videoId;
        
        // 批量檢查影片是否為直播
        const videoData = await makeApiRequest('/videos', {
          part: 'snippet,liveStreamingDetails',
          id: videoId
        });
        
        if (videoData && videoData.items && videoData.items.length > 0) {
          const video = videoData.items[0];
          const isLive = video.snippet.liveBroadcastContent === 'live' && video.liveStreamingDetails;
          
          if (isLive) {
            results[channelId] = {
              isLive: true,
              channelId: channelId,
              videoId: videoId,
              title: video.snippet.title,
              viewerCount: video.liveStreamingDetails.concurrentViewers ? parseInt(video.liveStreamingDetails.concurrentViewers) : null,
              startedAt: video.liveStreamingDetails.actualStartTime || null
            };
          }
        }
      } catch (e) {
        // 單個頻道檢查失敗，繼續處理其他頻道
        results[channelId] = {
          isLive: null,
          channelId: channelId,
          error: e.message
        };
      }
    }
    
    return results;
  } catch (error) {
    // 發生錯誤時，返回部分結果或空結果
    return results;
  }
}

// 設定 YouTube API 配置
function setYouTubeApiConfig(config) {
  if (config.apiKey !== undefined) {
    YOUTUBE_API_CONFIG.apiKey = config.apiKey;
    localStorage.setItem('youtubeApiKey', config.apiKey);
  }
  
  if (config.useProxy !== undefined) {
    YOUTUBE_API_CONFIG.useProxy = config.useProxy;
    localStorage.setItem('youtubeUseProxy', config.useProxy.toString());
  }
  
  if (config.proxyUrl !== undefined) {
    YOUTUBE_API_CONFIG.proxyUrl = config.proxyUrl;
    localStorage.setItem('youtubeProxyUrl', config.proxyUrl);
  }
  
  if (config.dailyLimit !== undefined) {
    YOUTUBE_API_CONFIG.quotaLimit.dailyLimit = config.dailyLimit;
    saveQuotaTracking();
  }
}

// 取得 YouTube API 配置
function getYouTubeApiConfig() {
  return {
    apiKey: YOUTUBE_API_CONFIG.apiKey ? '***' : '', // 不返回實際 API Key
    hasApiKey: !!YOUTUBE_API_CONFIG.apiKey,
    useProxy: YOUTUBE_API_CONFIG.useProxy,
    proxyUrl: YOUTUBE_API_CONFIG.proxyUrl,
    dailyLimit: YOUTUBE_API_CONFIG.quotaLimit.dailyLimit,
    currentUsage: YOUTUBE_API_CONFIG.quotaLimit.currentUsage,
    usagePercent: (YOUTUBE_API_CONFIG.quotaLimit.currentUsage / YOUTUBE_API_CONFIG.quotaLimit.dailyLimit) * 100,
    isBlocked: YOUTUBE_API_CONFIG.quotaLimit.isBlocked,
    blockUntil: YOUTUBE_API_CONFIG.quotaLimit.blockUntil
  };
}

// 清除快取
function clearYouTubeApiCache() {
  youtubeApiCache.clear();
}

// 初始化（載入流量追蹤）
loadQuotaTracking();

// 匯出函數到全域
if (typeof window !== 'undefined') {
  window.youtubeApi = {
    searchChannels: searchYouTubeChannels,
    checkChannelLiveStatus: checkChannelLiveStatus,
    checkMultipleChannelsLiveStatus: checkMultipleChannelsLiveStatus,
    setConfig: setYouTubeApiConfig,
    getConfig: getYouTubeApiConfig,
    clearCache: clearYouTubeApiCache
  };
}

})(); // 結束 IIFE
