// Twitch API 服務模組
// 用於搜尋頻道和查詢開台狀態

// 使用 IIFE 封裝，避免全局作用域污染
(function() {
  'use strict';

// 嘗試獲取環境變數對象（如果代碼是 ES module 且使用構建工具）
// 根據 Grok 4.1 建議：使用 import.meta.env 獲取 Cloudflare Pages 環境變數
// 這些值只在 build 時存在，部署後瀏覽器看不到原始值
// 
// 注意：如果代碼是作為 ES module 載入的（type="module"），可以直接訪問 import.meta.env
// 如果使用 Vite 等構建工具，環境變數會在構建時注入到 import.meta.env 中
// 如果代碼不是 ES module，ENV 將保持為 null，會自動回退到 config.js
// 
// 重要：如果您的代碼是 ES module，可以直接在代碼中使用：
//   const TWITCH_ID = import.meta.env.VITE_TWITCH_CLIENT_ID;
//   const TWITCH_CLIENT_SECRET = import.meta.env.TWITCH_CLIENT_SECRET;
// 但由於當前代碼可能不是 ES module，我們使用函數來安全地訪問
let ENV = null;
// 注意：如果代碼是 ES module，可以直接使用 import.meta.env
// 但由於當前代碼可能不是 ES module，我們無法直接訪問
// 如果用戶將代碼轉換為 ES module 並使用構建工具，環境變數會被注入
// 在這種情況下，用戶需要確保代碼是作為 ES module 載入的（type="module"）

// Twitch API 配置
// 優先從環境變數（import.meta.env）讀取，然後從 config.js 讀取，最後從 localStorage 讀取（向後兼容）
// 
// 使用方式（在 Cloudflare Pages 中設定環境變數）：
// - VITE_TWITCH_CLIENT_ID: Twitch Client ID（會暴露給客戶端）
// - TWITCH_CLIENT_SECRET: Twitch Client Secret（如果使用構建工具，會在構建時注入）
// 
// 注意：如果代碼是作為 ES module 載入的（type="module"），可以直接使用 import.meta.env
// 如果使用 Vite 等構建工具，環境變數會在構建時注入到 import.meta.env 中
// 如果代碼不是 ES module，會自動回退到 config.js 或 localStorage
function getEnvValue(envKey, configKey, localStorageKey) {
  // 優先從環境變數讀取（Cloudflare Pages 環境變數）
  // 這些值只在 build 時存在，部署後瀏覽器看不到原始值
  
  // 方法 1: 如果代碼是 ES module 且 ENV 可用，直接從 import.meta.env 讀取
  if (ENV && ENV[envKey]) {
    const envValue = ENV[envKey];
    if (envValue && envValue !== 'undefined' && String(envValue).trim() !== '') {
      return String(envValue);
    }
  }
  
  // 方法 2: 嘗試通過全局變數訪問（某些構建工具可能會這樣做）
  try {
    if (window.__ENV__ && window.__ENV__[envKey]) {
      const envValue = window.__ENV__[envKey];
      if (envValue && envValue !== 'undefined' && String(envValue).trim() !== '') {
        return String(envValue);
      }
    }
  } catch (e) {
    // 忽略錯誤，繼續嘗試其他方法
  }
  
  // 回退到 config.js
  if (typeof CONFIG !== 'undefined' && CONFIG[configKey]) {
    return CONFIG[configKey];
  }
  
  // 最後回退到 localStorage
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(localStorageKey) || '';
  }
  
  return '';
}

// 從 Cloudflare Pages Function 取得 Client ID（異步）
let configClientIdPromise = null;
async function getClientIdFromPagesFunction() {
  if (configClientIdPromise) {
    console.log('[twitch-api.js] 使用已存在的 Client ID Promise');
    return configClientIdPromise;
  }
  
  console.log('[twitch-api.js] 開始從 Cloudflare Pages Function 獲取 Client ID');
  configClientIdPromise = (async () => {
    try {
      const apiUrl = '/api/twitch-config';
      console.log('[twitch-api.js] 發送請求到:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('[twitch-api.js] 收到回應', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[twitch-api.js] 解析回應數據', {
          hasClientId: !!data.clientId,
          clientIdLength: data.clientId ? data.clientId.length : 0
        });
        
        if (data.clientId) {
          console.log('[twitch-api.js] 成功獲取 Client ID');
          return data.clientId;
        } else {
          console.warn('[twitch-api.js] 回應中沒有 clientId');
        }
      } else {
        console.error('[twitch-api.js] API 請求失敗', {
          status: response.status,
          statusText: response.statusText
        });
      }
    } catch (error) {
      console.error('[twitch-api.js] 獲取 Client ID 時發生錯誤', {
        error: error.message,
        stack: error.stack
      });
    }
    return null;
  })();
  
  return configClientIdPromise;
}

const TWITCH_API_CONFIG = {
  // Client ID - 優先從環境變數讀取，然後從 config.js 或 localStorage 讀取（必須）
  // 如果都沒有，會在首次使用時嘗試從 Pages Function 取得
  clientId: getEnvValue('VITE_TWITCH_CLIENT_ID', 'TWITCH_CLIENT_ID', 'twitchClientId'),
  
  // Client Secret - 用於自動取得 App Access Token（可選）
  // 優先從環境變數讀取，然後從 config.js 或 localStorage 讀取
  clientSecret: getEnvValue('TWITCH_CLIENT_SECRET', 'TWITCH_CLIENT_SECRET', 'twitchClientSecret'),
  
  // Access Token - 如果提供則直接使用（可選）
  accessToken: (typeof CONFIG !== 'undefined' && CONFIG.TWITCH_ACCESS_TOKEN) 
    ? CONFIG.TWITCH_ACCESS_TOKEN 
    : (localStorage.getItem('twitchAccessToken') || ''),
  
  // API 基礎 URL
  baseUrl: 'https://api.twitch.tv/helix',
  
  // OAuth Token 端點
  oauthTokenUrl: 'https://id.twitch.tv/oauth2/token',
  
  // 後端代理 URL（如果使用代理來解決 CORS 問題）
  proxyUrl: (typeof CONFIG !== 'undefined' && CONFIG.TWITCH_PROXY_URL) 
    ? CONFIG.TWITCH_PROXY_URL 
    : (localStorage.getItem('twitchProxyUrl') || ''),
  
  // 是否使用代理
  useProxy: (typeof CONFIG !== 'undefined' && CONFIG.TWITCH_USE_PROXY !== undefined) 
    ? CONFIG.TWITCH_USE_PROXY 
    : (localStorage.getItem('twitchUseProxy') === 'true'),
  
  // 快取設定
  cacheEnabled: true,
  cacheDuration: 60000, // 1 分鐘快取
  
  // 速率限制
  rateLimit: {
    maxRequests: 30,
    windowMs: 60000 // 1 分鐘
  }
};

// Access Token 快取（避免重複取得）
let cachedAccessToken = {
  token: null,
  expiresAt: 0
};

// 快取儲存
const apiCache = new Map();
const rateLimitTracker = {
  requests: [],
  resetTime: Date.now() + TWITCH_API_CONFIG.rateLimit.windowMs
};

// 速率限制檢查
function checkRateLimit() {
  const now = Date.now();
  
  // 如果超過時間窗口，重置計數器
  if (now > rateLimitTracker.resetTime) {
    rateLimitTracker.requests = [];
    rateLimitTracker.resetTime = now + TWITCH_API_CONFIG.rateLimit.windowMs;
  }
  
  // 移除過期的請求記錄
  rateLimitTracker.requests = rateLimitTracker.requests.filter(
    time => now - time < TWITCH_API_CONFIG.rateLimit.windowMs
  );
  
  // 檢查是否超過限制
  if (rateLimitTracker.requests.length >= TWITCH_API_CONFIG.rateLimit.maxRequests) {
    const waitTime = rateLimitTracker.resetTime - now;
    const waitSeconds = Math.ceil(waitTime / 1000);
    
    // 顯示 1 分鐘計時器通知
    showTwitchRateLimitNotification(waitSeconds);
    
    throw new Error(`Twitch API 速率限制：請等待 ${waitSeconds} 秒後再試`);
  }
  
  // 記錄此次請求
  rateLimitTracker.requests.push(now);
}

// 取得快取鍵
function getCacheKey(endpoint, params) {
  return `${endpoint}_${JSON.stringify(params)}`;
}

// 檢查快取
function getCachedData(key) {
  if (!TWITCH_API_CONFIG.cacheEnabled) return null;
  
  const cached = apiCache.get(key);
  if (!cached) return null;
  
  const now = Date.now();
  if (now - cached.timestamp > TWITCH_API_CONFIG.cacheDuration) {
    apiCache.delete(key);
    return null;
  }
  
  return cached.data;
}

// 儲存快取
function setCachedData(key, data) {
  if (!TWITCH_API_CONFIG.cacheEnabled) return;
  apiCache.set(key, {
    data: data,
    timestamp: Date.now()
  });
}

// 檢測是否可以使用 Cloudflare Pages Function
let pagesFunctionAvailable = null; // null = 未檢測, true = 可用, false = 不可用

async function checkPagesFunctionAvailability() {
  // 如果已經檢測過，直接返回結果
  if (pagesFunctionAvailable !== null) {
    return pagesFunctionAvailable;
  }
  
  try {
    // 嘗試調用 Pages Function 端點來檢測是否可用
    const response = await fetch('/api/twitch-token', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // 如果回應是 404，表示端點不存在
    if (response.status === 404) {
      pagesFunctionAvailable = false;
      return pagesFunctionAvailable;
    }
    
    // 如果回應是 500 且是配置錯誤，表示端點存在但環境變數未設定，視為不可用
    if (response.status === 500) {
      try {
        const errorData = await response.json();
        if (errorData.error === '配置錯誤' || errorData.message?.includes('未設定')) {
          pagesFunctionAvailable = false;
          return pagesFunctionAvailable;
        }
      } catch (e) {
        // 無法解析錯誤訊息，假設是其他錯誤，端點存在但可能暫時不可用
      }
    }
    
    // 如果回應是 200，表示端點可用且配置正確
    if (response.status === 200) {
      pagesFunctionAvailable = true;
      return pagesFunctionAvailable;
    }
    
    // 其他狀態碼（如 401, 403 等），表示端點存在但可能有其他問題
    // 我們仍然認為端點存在，讓後續的 getTokenFromPagesFunction 處理具體錯誤
    pagesFunctionAvailable = true;
  } catch (error) {
    // 網路錯誤或其他錯誤，假設 Pages Function 不可用
    pagesFunctionAvailable = false;
  }
  
  return pagesFunctionAvailable;
}

// 從 Cloudflare Pages Function 取得 Token
async function getTokenFromPagesFunction() {
  try {
    const response = await fetch('/api/twitch-token', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Pages Function 回應錯誤：${response.status} - ${errorData.message || errorData.error || '未知錯誤'}`);
    }
    
    const data = await response.json();
    
    if (!data.access_token) {
      throw new Error('Pages Function 回應中沒有 access_token');
    }
    
    return {
      access_token: data.access_token,
      expires_in: data.expires_in || 3600
    };
  } catch (error) {
    throw error;
  }
}

// 直接從 Twitch OAuth 取得 Token（回退方案）
async function getTokenDirectly() {
  // 如果沒有 Client Secret，無法自動取得 Token
  if (!TWITCH_API_CONFIG.clientSecret) {
    throw new Error('無法取得 Access Token：請在 config.js 中提供 TWITCH_CLIENT_SECRET 或 TWITCH_ACCESS_TOKEN，或在 Cloudflare Pages 中設定環境變數');
  }
  
  // 如果沒有 Client ID，無法取得 Token
  if (!TWITCH_API_CONFIG.clientId) {
    throw new Error('無法取得 Access Token：請在 config.js 中提供 TWITCH_CLIENT_ID，或在 Cloudflare Pages 中設定環境變數');
  }
  
  // 使用 Client Credentials Grant Flow 取得 Token
  const params = new URLSearchParams({
    client_id: TWITCH_API_CONFIG.clientId,
    client_secret: TWITCH_API_CONFIG.clientSecret,
    grant_type: 'client_credentials'
  });
  
  const response = await fetch(TWITCH_API_CONFIG.oauthTokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`取得 Access Token 失敗：${response.status} ${response.statusText} - ${errorText}`);
  }
  
  const data = await response.json();
  
  if (!data.access_token) {
    throw new Error('取得 Access Token 失敗：回應中沒有 access_token');
  }
  
  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 3600
  };
}

// 取得 App Access Token（優先使用 Cloudflare Pages Function，回退到直接調用）
async function getAppAccessToken() {
  // 如果已有快取的 Token 且未過期，直接返回
  const now = Date.now();
  if (cachedAccessToken.token && now < cachedAccessToken.expiresAt) {
    return cachedAccessToken.token;
  }
  
  // 如果提供了手動設定的 Access Token，直接使用
  if (TWITCH_API_CONFIG.accessToken) {
    cachedAccessToken.token = TWITCH_API_CONFIG.accessToken;
    // 假設手動設定的 Token 有效期為 60 天（實際可能不同，但這是常見值）
    cachedAccessToken.expiresAt = now + (60 * 24 * 60 * 60 * 1000);
    return cachedAccessToken.token;
  }
  
  try {
    let data;
    
    // 優先使用 Cloudflare Pages Function（如果可用）
    const isPagesFunctionAvailable = await checkPagesFunctionAvailability();
    
    if (isPagesFunctionAvailable) {
      try {
        data = await getTokenFromPagesFunction();
      } catch (pagesError) {
        // Pages Function 失敗，回退到直接調用
        data = await getTokenDirectly();
      }
    } else {
      // Pages Function 不可用，使用直接調用
      data = await getTokenDirectly();
    }
    
    // 快取 Token（預留 5 分鐘緩衝時間，避免在邊界時過期）
    const expiresIn = (data.expires_in || 3600) * 1000; // 轉換為毫秒
    cachedAccessToken.token = data.access_token;
    cachedAccessToken.expiresAt = now + expiresIn - (5 * 60 * 1000); // 提前 5 分鐘過期
    
    // 儲存到 localStorage（可選，用於持久化）
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('twitchAccessToken', data.access_token);
      localStorage.setItem('twitchAccessTokenExpiresAt', cachedAccessToken.expiresAt.toString());
    }
    
    return cachedAccessToken.token;
  } catch (error) {
    throw error;
  }
}

// 確保有有效的 Access Token
async function ensureAccessToken() {
  // 如果使用代理，不需要 Token（代理會處理）
  if (TWITCH_API_CONFIG.useProxy) {
    return null;
  }
  
  // 嘗試從 localStorage 恢復快取的 Token
  if (typeof localStorage !== 'undefined' && !cachedAccessToken.token) {
    const storedToken = localStorage.getItem('twitchAccessToken');
    const storedExpiresAt = localStorage.getItem('twitchAccessTokenExpiresAt');
    
    if (storedToken && storedExpiresAt) {
      const expiresAt = parseInt(storedExpiresAt, 10);
      const now = Date.now();
      
      // 如果 Token 尚未過期，使用快取的 Token
      if (now < expiresAt) {
        cachedAccessToken.token = storedToken;
        cachedAccessToken.expiresAt = expiresAt;
        return cachedAccessToken.token;
      }
    }
  }
  
  // 取得新的 Access Token
  return await getAppAccessToken();
}

// 建立 API 請求
async function makeApiRequest(endpoint, params = {}) {
  checkRateLimit();
  
  // 建立快取鍵
  const cacheKey = getCacheKey(endpoint, params);
  const cached = getCachedData(cacheKey);
  if (cached) {
    return cached;
  }
  
  // 建立 URL
  let url;
  if (TWITCH_API_CONFIG.useProxy && TWITCH_API_CONFIG.proxyUrl) {
    // 使用後端代理
    url = `${TWITCH_API_CONFIG.proxyUrl}?endpoint=${encodeURIComponent(endpoint)}`;
    Object.keys(params).forEach(key => {
      const value = params[key];
      // 處理布林值參數
      const paramValue = typeof value === 'boolean' ? value.toString() : value;
      url += `&${key}=${encodeURIComponent(paramValue)}`;
    });
    } else {
      // 直接呼叫 API
      // 檢查 endpoint 是否已包含查詢字符串
      if (endpoint.includes('?')) {
        url = `${TWITCH_API_CONFIG.baseUrl}${endpoint}`;
        // 如果 endpoint 已有查詢參數，且 params 不為空，則追加
        if (Object.keys(params).length > 0) {
          // 處理布林值參數（Twitch API 需要 true/false 字串，不是 "true"/"false"）
          const processedParams = {};
          Object.keys(params).forEach(key => {
            const value = params[key];
            if (typeof value === 'boolean') {
              processedParams[key] = value.toString();
            } else {
              processedParams[key] = value;
            }
          });
          const queryString = new URLSearchParams(processedParams).toString();
          url += `&${queryString}`;
        }
      } else {
        url = `${TWITCH_API_CONFIG.baseUrl}${endpoint}`;
        // 處理布林值參數
        const processedParams = {};
        Object.keys(params).forEach(key => {
          const value = params[key];
          if (typeof value === 'boolean') {
            processedParams[key] = value.toString();
          } else {
            processedParams[key] = value;
          }
        });
        const queryString = new URLSearchParams(processedParams).toString();
        if (queryString) {
          url += `?${queryString}`;
        }
      }
    }
  
  // 建立請求標頭
  const headers = {
    'Content-Type': 'application/json'
  };
  
  // 如果使用代理，不需要設定認證標頭（代理會處理）
  if (!TWITCH_API_CONFIG.useProxy) {
    // 必須提供 Client ID
    let clientId = TWITCH_API_CONFIG.clientId;
    
    // 如果沒有 Client ID，嘗試從 Pages Function 取得
    if (!clientId) {
      try {
        const pagesClientId = await getClientIdFromPagesFunction();
        if (pagesClientId) {
          clientId = pagesClientId;
          TWITCH_API_CONFIG.clientId = clientId;
          // 儲存到 localStorage 以便後續使用
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('twitchClientId', clientId);
          }
        }
      } catch (error) {
      }
    }
    
    if (!clientId) {
      throw new Error('Twitch API Client ID 未設定。請在以下方式中選擇一種：\n1. 在 Cloudflare Pages 環境變數中設定 TWITCH_CLIENT_ID（推薦）\n2. 在 config.js 中提供 TWITCH_CLIENT_ID\n3. 在 localStorage 中設定 twitchClientId');
    }
    
    headers['Client-ID'] = clientId;
    
    // 取得 Access Token 並加入 Authorization 標頭
    try {
      const accessToken = await ensureAccessToken();
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
    } catch (tokenError) {
      // 如果取得 Token 失敗，拋出錯誤而不是靜默失敗
      throw new Error(`無法取得 Access Token：${tokenError.message}`);
    }
  }
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: headers
    });
    
    if (!response.ok) {
      // 嘗試讀取錯誤訊息
      let errorText = '';
      try {
        const errorData = await response.json().catch(() => ({}));
        errorText = JSON.stringify(errorData);
      } catch (e) {
        errorText = await response.text().catch(() => '無法讀取錯誤訊息');
      }
      
      // 如果是 401 錯誤，可能是 Token 過期，嘗試重新取得 Token
      if (response.status === 401 && !TWITCH_API_CONFIG.useProxy) {
        // 清除快取的 Token
        cachedAccessToken.token = null;
        cachedAccessToken.expiresAt = 0;
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('twitchAccessToken');
          localStorage.removeItem('twitchAccessTokenExpiresAt');
        }
        
        // 嘗試重新取得 Token 並重試一次
        try {
          const newToken = await getAppAccessToken();
          headers['Authorization'] = `Bearer ${newToken}`;
          
          const retryResponse = await fetch(url, {
            method: 'GET',
            headers: headers
          });
          
          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            setCachedData(cacheKey, retryData);
            return retryData;
          }
        } catch (retryError) {
          // 重試失敗，繼續處理原始錯誤
        }
        
        throw new Error('Twitch API 認證失敗，請檢查 Client ID 和 Client Secret 設定');
      } else if (response.status === 401) {
        throw new Error('Twitch API 認證失敗，請檢查後端代理設定');
      } else if (response.status === 429) {
        throw new Error('API 請求過於頻繁，請稍後再試');
      } else if (response.status === 404) {
        return null; // 資源不存在
      } else {
        throw new Error(`API 請求失敗：${response.status} ${response.statusText}`);
      }
    }
    
    const data = await response.json();
    
    // 儲存快取
    setCachedData(cacheKey, data);
    
    return data;
  } catch (error) {
    if (error.message.includes('API')) {
      throw error;
    }
    
    // 處理網路錯誤
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('無法連接到 Twitch API，請檢查網路連線或後端代理設定');
    }
    
    throw error;
  }
}

// 搜尋 Twitch 頻道
async function searchTwitchChannels(query, limit = 10) {
  if (!query || query.trim().length === 0) {
    return [];
  }
  
  try {
    const data = await makeApiRequest('/search/channels', {
      query: query.trim(),
      first: limit,
      live_only: false // 搜尋所有頻道，不只是開台的（布林值，不是字串）
    });
    
    if (!data) {
      return [];
    }
    
    if (!data.data) {
      return [];
    }
    
    if (!Array.isArray(data.data)) {
      return [];
    }
    
    if (data.data.length === 0) {
      return [];
    }
    
    const mappedResults = data.data.map(channel => ({
      id: channel.id,
      login: channel.broadcaster_login,
      displayName: channel.display_name,
      title: channel.title,
      isLive: channel.is_live,
      thumbnailUrl: channel.thumbnail_url,
      gameName: channel.game_name,
      viewerCount: channel.is_live ? (channel.viewer_count || 0) : 0,
      startedAt: channel.started_at,
      url: `https://www.twitch.tv/${channel.broadcaster_login}`
    }));
    
    return mappedResults;
  } catch (error) {
    throw error;
  }
}

// 查詢單一頻道開台狀態
async function checkChannelLiveStatus(channelLogin) {
  if (!channelLogin) {
    return null;
  }
  
  try {
    const data = await makeApiRequest('/streams', {
      user_login: channelLogin
    });
    
    if (!data || !data.data || data.data.length === 0) {
      return {
        isLive: false,
        channelLogin: channelLogin
      };
    }
    
    const stream = data.data[0];
    return {
      isLive: true,
      channelLogin: channelLogin,
      title: stream.title,
      gameName: stream.game_name,
      viewerCount: stream.viewer_count,
      startedAt: stream.started_at,
      thumbnailUrl: stream.thumbnail_url
    };
  } catch (error) {
    // 發生錯誤時，返回未知狀態而不是拋出錯誤
    return {
      isLive: null, // null 表示未知
      channelLogin: channelLogin,
      error: error.message
    };
  }
}

// 批量查詢多個頻道開台狀態
async function checkMultipleChannelsLiveStatus(channelLogins) {
  if (!channelLogins || channelLogins.length === 0) {
    return {};
  }
  
  // Twitch API 一次最多查詢 100 個頻道
  const batchSize = 100;
  const results = {};
  
  try {
    // 分批查詢
    for (let i = 0; i < channelLogins.length; i += batchSize) {
      const batch = channelLogins.slice(i, i + batchSize);
      
      // Twitch API 支援多個 user_login 參數
      // 注意：此處的 params 實際上不會被使用，因為我們使用 URLSearchParams 來處理多個同名參數
      
      // 使用 URLSearchParams 來處理多個同名參數
      const queryParams = new URLSearchParams();
      batch.forEach(login => {
        queryParams.append('user_login', login);
      });
      
      const data = await makeApiRequest('/streams?' + queryParams.toString(), {});
      
      // 初始化所有頻道為未開台
      batch.forEach(login => {
        results[login] = {
          isLive: false,
          channelLogin: login
        };
      });
      
      // 更新開台頻道的資訊
      if (data && data.data) {
        data.data.forEach(stream => {
          const login = stream.user_login.toLowerCase();
          results[login] = {
            isLive: true,
            channelLogin: login,
            title: stream.title,
            gameName: stream.game_name,
            viewerCount: stream.viewer_count,
            startedAt: stream.started_at,
            thumbnailUrl: stream.thumbnail_url
          };
        });
      }
      
      // 避免速率限制，在批次之間稍作延遲
      if (i + batchSize < channelLogins.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return results;
  } catch (error) {
    // 發生錯誤時，返回部分結果或空結果
    return results;
  }
}

// 設定 Twitch API 配置
function setTwitchApiConfig(config) {
  if (config.clientId !== undefined) {
    TWITCH_API_CONFIG.clientId = config.clientId;
    localStorage.setItem('twitchClientId', config.clientId);
  }
  
  if (config.clientSecret !== undefined) {
    TWITCH_API_CONFIG.clientSecret = config.clientSecret;
    localStorage.setItem('twitchClientSecret', config.clientSecret);
    // 清除快取的 Token，因為配置已變更
    cachedAccessToken.token = null;
    cachedAccessToken.expiresAt = 0;
  }
  
  if (config.accessToken !== undefined) {
    TWITCH_API_CONFIG.accessToken = config.accessToken;
    localStorage.setItem('twitchAccessToken', config.accessToken);
    // 更新快取的 Token
    cachedAccessToken.token = config.accessToken;
    cachedAccessToken.expiresAt = Date.now() + (60 * 24 * 60 * 60 * 1000); // 假設 60 天有效期
  }
  
  if (config.proxyUrl !== undefined) {
    TWITCH_API_CONFIG.proxyUrl = config.proxyUrl;
    localStorage.setItem('twitchProxyUrl', config.proxyUrl);
  }
  
  if (config.useProxy !== undefined) {
    TWITCH_API_CONFIG.useProxy = config.useProxy;
    localStorage.setItem('twitchUseProxy', config.useProxy.toString());
  }
}

// 取得 Twitch API 配置
function getTwitchApiConfig() {
  return {
    clientId: TWITCH_API_CONFIG.clientId,
    // 不返回敏感資訊（Client Secret）
    hasClientSecret: !!TWITCH_API_CONFIG.clientSecret,
    hasAccessToken: !!TWITCH_API_CONFIG.accessToken,
    proxyUrl: TWITCH_API_CONFIG.proxyUrl,
    useProxy: TWITCH_API_CONFIG.useProxy
  };
}

// 顯示 Twitch API 速率限制通知
function showTwitchRateLimitNotification(waitSeconds) {
  // 檢查是否已經顯示過通知（避免重複顯示）
  const existingNotification = document.getElementById('twitch-rate-limit-notification');
  if (existingNotification) {
    return; // 已經有通知在顯示
  }
  
  const notification = document.createElement('div');
  notification.id = 'twitch-rate-limit-notification';
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
  title.textContent = '⚠️ Twitch API 速率限制';
  
  const message = document.createElement('div');
  message.style.cssText = 'margin-bottom: 10px;';
  const countdownSpan = document.createElement('span');
  countdownSpan.id = 'twitch-rate-limit-countdown';
  countdownSpan.style.cssText = 'font-weight: bold; font-size: 18px;';
  countdownSpan.textContent = waitSeconds;
  message.appendChild(document.createTextNode('Twitch API 每分鐘請求次數已達上限，請等待 '));
  message.appendChild(countdownSpan);
  message.appendChild(document.createTextNode(' 秒後再試。'));
  
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
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }
    notification.remove();
  };
  
  notification.appendChild(title);
  notification.appendChild(message);
  notification.appendChild(closeBtn);
  
  document.body.appendChild(notification);
  
  // 倒數計時器
  let remainingSeconds = waitSeconds;
  const countdownInterval = setInterval(() => {
    remainingSeconds--;
    if (countdownSpan) {
      countdownSpan.textContent = remainingSeconds;
    }
    
    if (remainingSeconds <= 0) {
      clearInterval(countdownInterval);
      // 自動關閉通知
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 1000);
    }
  }, 1000);
}

// 清除快取
function clearTwitchApiCache() {
  apiCache.clear();
}

// 匯出函數到全域
if (typeof window !== 'undefined') {
  console.log('[twitch-api.js] 初始化 Twitch API...');
  window.twitchApi = {
    searchChannels: searchTwitchChannels,
    checkChannelLiveStatus: checkChannelLiveStatus,
    checkMultipleChannelsLiveStatus: checkMultipleChannelsLiveStatus,
    setConfig: setTwitchApiConfig,
    getConfig: getTwitchApiConfig,
    clearCache: clearTwitchApiCache
  };
  console.log('[twitch-api.js] Twitch API 已初始化', {
    twitchApi: !!window.twitchApi,
    methods: Object.keys(window.twitchApi),
    config: getTwitchApiConfig()
  });
}

})(); // 結束 IIFE
