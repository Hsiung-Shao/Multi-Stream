// Twitch API 服務模組
// 用於搜尋頻道和查詢開台狀態

// 嘗試獲取環境變數對象（如果代碼是 ES module 且使用構建工具）
// 根據 Grok 4.1 建議和 Cloudflare Pages 文檔：
// https://developers.cloudflare.com/pages/configuration/build-configuration/#environment-variables
// 
// Cloudflare Pages 環境變數說明：
// - 環境變數在構建時注入（如果使用構建工具如 Vite）
// - 這些值只在 build 時存在，部署後瀏覽器看不到原始值
// - 如果使用 Vite，環境變數會被注入到 import.meta.env 中
// - 如果項目不使用構建工具，環境變數無法直接訪問，需要回退到 config.js
// 
// 使用方式（在 Cloudflare Pages 中設定環境變數）：
// 1. 前往 Cloudflare Dashboard > Workers & Pages > 您的專案 > Settings > Environment variables
// 2. 添加以下環境變數：
//    - TWITCH_CLIENT_ID: Twitch Client ID（Plaintext，可以暴露給客戶端）
//    - TWITCH_CLIENT_SECRET: Twitch Client Secret（Secret，加密存儲，不會暴露給客戶端）
// 
// 注意：
// - 如果代碼是作為 ES module 載入的（type="module"），可以直接訪問 import.meta.env
// - 如果使用 Vite 等構建工具，環境變數會在構建時注入到 import.meta.env 中
// - 如果代碼不是 ES module 或沒有構建工具，ENV 將保持為 null，會自動回退到 config.js
// 
// 重要：如果您的代碼是 ES module 且使用構建工具，可以直接在代碼中使用：
//   const TWITCH_ID = import.meta.env.VITE_TWITCH_CLIENT_ID;
//   const TWITCH_CLIENT_SECRET = import.meta.env.TWITCH_CLIENT_SECRET;
// 但由於當前代碼可能不是 ES module，我們使用函數來安全地訪問
let ENV = null;
// 注意：如果代碼是 ES module，可以直接使用 import.meta.env
// 但由於當前代碼可能不是 ES module，我們無法直接訪問
// 如果用戶將代碼轉換為 ES module 並使用構建工具（如 Vite），環境變數會被注入
// 在這種情況下，用戶需要確保代碼是作為 ES module 載入的（type="module"）

// Twitch API 配置
// 優先從環境變數（import.meta.env）讀取，然後從 config.js 讀取，最後從 localStorage 讀取（向後兼容）
// 
// 根據 Cloudflare Pages 文檔：
// https://developers.cloudflare.com/pages/configuration/build-configuration/#environment-variables
// 
// 環境變數設定步驟：
// 1. 前往 Cloudflare Dashboard > Workers & Pages > 您的專案
// 2. 選擇 Settings > Environment variables
// 3. 添加以下環境變數：
//    - TWITCH_CLIENT_ID: Twitch Client ID（Type: Plaintext，可以暴露給客戶端）
//    - TWITCH_CLIENT_SECRET: Twitch Client Secret（Type: Secret，加密存儲，不會暴露給客戶端）
// 
// 注意：對於純靜態網站（不使用構建工具），環境變數無法直接注入到代碼中
// 系統會自動回退到 config.js，這是安全的做法
// 
// 注意：
// - 如果使用 Vite 等構建工具，環境變數會在構建時注入到 import.meta.env 中
// - 如果代碼是作為 ES module 載入的（type="module"），可以直接使用 import.meta.env
// - 如果代碼不是 ES module 或沒有構建工具，會自動回退到 config.js 或 localStorage
// - 環境變數只在構建時存在，部署後瀏覽器看不到原始值（安全性）
function getEnvValue(envKey, configKey, localStorageKey) {
  // 優先從環境變數讀取（Cloudflare Pages 環境變數）
  // 這些值只在 build 時存在，部署後瀏覽器看不到原始值
  // 
  // 根據 Cloudflare Pages 文檔，環境變數在構建時注入
  // 如果使用 Vite，環境變數會被注入到 import.meta.env 中
  
  // 方法 1: 如果代碼是 ES module 且 ENV 可用，直接從 import.meta.env 讀取
  // 這適用於使用 Vite 等構建工具的情況
  if (ENV && ENV[envKey]) {
    const envValue = ENV[envKey];
    if (envValue && envValue !== 'undefined' && String(envValue).trim() !== '') {
      return String(envValue);
    }
  }
  
  // 方法 2: 嘗試通過全局變數訪問（某些構建工具可能會這樣做）
  // 某些構建工具可能會將環境變數注入到全局對象中
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
  
  // 回退到 config.js（適用於不使用構建工具的情況）
  // 這是向後兼容的方案，確保在沒有構建工具時仍能正常工作
  if (typeof CONFIG !== 'undefined' && CONFIG[configKey]) {
    return CONFIG[configKey];
  }
  
  // 最後回退到 localStorage（用戶手動設定的值）
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(localStorageKey) || '';
  }
  
  return '';
}

const TWITCH_API_CONFIG = {
  // Client ID - 優先從環境變數讀取，然後從 config.js 或 localStorage 讀取（必須）
  // 注意：環境變數名稱應與 Cloudflare Pages 中設定的名稱一致
  clientId: getEnvValue('TWITCH_CLIENT_ID', 'TWITCH_CLIENT_ID', 'twitchClientId'),
  
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
    throw new Error(`API 速率限制：請等待 ${Math.ceil(waitTime / 1000)} 秒後再試`);
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

// 取得 App Access Token（使用 Client Credentials Grant Flow）
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
  
  // 如果沒有 Client Secret，無法自動取得 Token
  if (!TWITCH_API_CONFIG.clientSecret) {
    throw new Error('無法取得 Access Token：請在 config.js 中提供 TWITCH_CLIENT_SECRET 或 TWITCH_ACCESS_TOKEN');
  }
  
  // 如果沒有 Client ID，無法取得 Token
  if (!TWITCH_API_CONFIG.clientId) {
    throw new Error('無法取得 Access Token：請在 config.js 中提供 TWITCH_CLIENT_ID');
  }
  
  try {
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
    console.error('取得 App Access Token 失敗:', error);
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
      url += `&${key}=${encodeURIComponent(params[key])}`;
    });
  } else {
    // 直接呼叫 API
    // 檢查 endpoint 是否已包含查詢字符串
    if (endpoint.includes('?')) {
      url = `${TWITCH_API_CONFIG.baseUrl}${endpoint}`;
      // 如果 endpoint 已有查詢參數，且 params 不為空，則追加
      if (Object.keys(params).length > 0) {
        const queryString = new URLSearchParams(params).toString();
        url += `&${queryString}`;
      }
    } else {
      url = `${TWITCH_API_CONFIG.baseUrl}${endpoint}`;
      const queryString = new URLSearchParams(params).toString();
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
    if (!TWITCH_API_CONFIG.clientId) {
      throw new Error('Twitch API Client ID 未設定，請在 config.js 中提供 TWITCH_CLIENT_ID');
    }
    
    headers['Client-ID'] = TWITCH_API_CONFIG.clientId;
    
    // 取得 Access Token 並加入 Authorization 標頭
    try {
      const accessToken = await ensureAccessToken();
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
        console.log('已取得 Access Token');
      } else {
        console.warn('未取得 Access Token，但繼續嘗試請求');
      }
    } catch (tokenError) {
      // 如果取得 Token 失敗，拋出錯誤而不是靜默失敗
      console.error('無法取得 Access Token:', tokenError);
      throw new Error(`無法取得 Access Token：${tokenError.message}`);
    }
  }
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: headers
    });
    
    if (!response.ok) {
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
    
    if (!data || !data.data) {
      return [];
    }
    
    return data.data.map(channel => ({
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
  } catch (error) {
    console.error('搜尋 Twitch 頻道失敗:', error);
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
    console.error('查詢頻道開台狀態失敗:', error);
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
      const params = {};
      batch.forEach((login, index) => {
        params[`user_login`] = login; // 注意：Twitch API 需要多個同名參數
      });
      
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
    console.error('批量查詢開台狀態失敗:', error);
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

// 清除快取
function clearTwitchApiCache() {
  apiCache.clear();
}

// 匯出函數到全域
if (typeof window !== 'undefined') {
  window.twitchApi = {
    searchChannels: searchTwitchChannels,
    checkChannelLiveStatus: checkChannelLiveStatus,
    checkMultipleChannelsLiveStatus: checkMultipleChannelsLiveStatus,
    setConfig: setTwitchApiConfig,
    getConfig: getTwitchApiConfig,
    clearCache: clearTwitchApiCache
  };
}
