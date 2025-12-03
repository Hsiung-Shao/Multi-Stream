// 主入口和初始化

// 立即暴露測試函數到全局（在任何其他代碼之前）
(function() {
  window.testSearchFunction = function() {
    const result = typeof initSearchFunctionality === 'function' ? initSearchFunctionality() : false;
    return result;
  };
})();

// 全局變數
let streamCount = 0;
const container = document.getElementById('container');

// 布局更新防抖定時器
let layoutUpdateTimeout = null;
let pendingLayoutUpdate = false;
const players = {}; // 儲存播放器實例
const streamData = {}; // 儲存串流資訊

// 將 players 和 streamData 暴露到全局作用域，以便其他模組訪問
window.players = players;
window.streamData = streamData;

// 頁面載入時檢查協議和恢復控制面板狀態
window.addEventListener('DOMContentLoaded', () => {
  // 恢復控制面板狀態（使用統一的檢查函數）
  // 優先級：如果沒有任何串流，強制展開；否則使用用戶設置
  if (typeof checkAndAdjustControlPanel === 'function') {
    checkAndAdjustControlPanel();
  } else {
    // 如果函數尚未載入，使用基本邏輯
    const savedState = localStorage.getItem('controlPanelCollapsed');
    const panel = document.getElementById('control-panel');
    const toggleCollapsed = document.getElementById('control-panel-toggle-collapsed');
    
    // 檢查是否有串流
    const hasStreams = document.querySelectorAll('.stream-box').length > 0;
    
    // 默認展開狀態：移除 collapsed 類
    if (panel) {
      panel.classList.remove('collapsed');
    }
    
    // 如果沒有任何串流，強制展開（優先於用戶設置）
    if (!hasStreams) {
      if (panel) {
        panel.classList.remove('collapsed');
      }
      if (toggleCollapsed) {
        toggleCollapsed.style.display = 'none';
      }
    } else {
      // 有串流時，使用用戶保存的設置
      if (savedState === 'true') {
        if (panel) {
          panel.classList.add('collapsed');
        }
        if (toggleCollapsed) {
          toggleCollapsed.style.display = 'block';
        }
      } else {
        // 默認展開狀態：隱藏收起按鈕
        if (toggleCollapsed) {
          toggleCollapsed.style.display = 'none';
        }
        // 如果沒有保存的狀態，設置為展開（false）
        if (savedState === null) {
          localStorage.setItem('controlPanelCollapsed', 'false');
        }
      }
    }
  }
  
  // 控制面板已改为固定侧边栏，不再需要恢复位置
  
  // 控制面板已改为固定侧边栏，不再需要拖曳功能
  
  // 初始化總音量控制
  const masterVolSlider = document.getElementById('master-volume');
  if (masterVolSlider) {
    masterVolSlider.addEventListener('input', updateMasterVolume);
    updateMasterVolume();
  }
  
  // 初始化串流順序列表
  if (typeof updateStreamOrderList === 'function') {
    updateStreamOrderList();
  }
  
  // 初始化所有聊天室按鈕狀態
  if (typeof updateAllChatsButton === 'function') {
    updateAllChatsButton();
  }
  
  // 載入用戶設置
  if (typeof loadUserSettings === 'function') {
    // 延遲載入，確保所有元素都已初始化
    setTimeout(() => {
      loadUserSettings();
    }, 500);
  }
  
  // 初始化收藏開台狀態自動刷新
  if (typeof startFavoriteLiveStatusAutoRefresh === 'function') {
    // 檢查是否啟用自動刷新
    const autoRefreshEnabled = localStorage.getItem('favoriteLiveStatusAutoRefresh') !== 'false';
    if (autoRefreshEnabled) {
      const intervalMinutes = parseInt(localStorage.getItem('favoriteLiveStatusAutoRefreshInterval') || '5', 10);
      // 延遲啟動，確保 Twitch API 已載入
      setTimeout(() => {
        startFavoriteLiveStatusAutoRefresh(intervalMinutes);
      }, 2000);
    }
  }
  
  // 延遲讀取備份數據（頁面載入後）
  if (typeof indexedDBBackup !== 'undefined') {
    setTimeout(async () => {
      // 嘗試自動從 IndexedDB 恢復數據（如果 localStorage 沒有數據）
      const result = await indexedDBBackup.autoLoadBackup();
      if (result && result.success) {
        // 重新載入頁面以應用恢復的數據
        window.location.reload();
      }
    }, 1000);
  }
  
  // 初始化控制面板中的收藏列表顯示（確保 DOM 元素已準備好）
  function initFavoriteListDisplay() {
    const displayDiv = document.getElementById('favorite-list-display');
    
    if (!displayDiv) {
      return false; // 元素還未準備好
    }
    
    // 確保 updateFavoriteListDisplay 函數已定義
    if (typeof window.updateFavoriteListDisplay === 'function') {
      window.updateFavoriteListDisplay();
      return true; // 成功初始化
    } else if (typeof updateFavoriteListDisplay === 'function') {
      updateFavoriteListDisplay();
      return true;
    }
    
    return false;
  }
  
  // 立即嘗試初始化，如果失敗則延遲重試
  let retryCount = 0;
  const maxRetries = 15;
  
  function tryInitFavoriteList() {
    if (initFavoriteListDisplay()) {
      // 初始化成功
    } else if (retryCount < maxRetries) {
      retryCount++;
      setTimeout(tryInitFavoriteList, 100);
    }
    // 静默失败，不输出警告
  }
  
  // 立即嘗試，然後多次重試（確保在所有腳本載入後）
  // 使用 window.onload 確保所有腳本都已載入
  if (document.readyState === 'complete') {
    tryInitFavoriteList();
  } else {
    window.addEventListener('load', () => {
      tryInitFavoriteList();
    });
  }
  
  // 額外的重試機制（確保函數和元素都已準備好）
  setTimeout(tryInitFavoriteList, 50);
  setTimeout(tryInitFavoriteList, 200);
  setTimeout(tryInitFavoriteList, 500);
  setTimeout(tryInitFavoriteList, 1000);
  
  // 定期更新串流順序列表（當有新增或刪除時）
  setInterval(() => {
    updateStreamOrderList();
    if (typeof updateAllChatsButton === 'function') {
      updateAllChatsButton();
    }
  }, 1000);
  
  // 頁面載入時自動應用布局（立即執行）
  const boxes = document.querySelectorAll('.stream-box');
  if (boxes.length > 0) {
    const layoutType = autoSelectLayout();
    setLayout(layoutType, true); // 立即執行，不使用防抖
  }
  
  // 初始化廣告系統
  if (typeof initAdSystem === 'function') {
    // 延遲初始化，確保頁面完全載入
    setTimeout(() => {
      initAdSystem();
    }, 1000);
  }
  
  const protocol = window.location.protocol;
  if (protocol === 'file:') {
    const warning = document.createElement('div');
    warning.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 68, 68, 0.95);
      color: white;
      padding: 20px 30px;
      border-radius: 8px;
      z-index: 10000;
      text-align: center;
      max-width: 500px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    `;
    // 使用安全的 DOM 操作
    const h3 = document.createElement('h3');
    h3.style.cssText = 'margin: 0 0 15px 0;';
    h3.textContent = '⚠️ 連線警告';
    
    const p1 = document.createElement('p');
    p1.style.cssText = 'margin: 0 0 15px 0; line-height: 1.6;';
    p1.textContent = '您正在使用 file:// 協議開啟網頁，這會導致 Twitch 和 YouTube 嵌入無法正常運作。';
    
    const p2 = document.createElement('p');
    p2.style.cssText = 'margin: 0 0 20px 0; line-height: 1.6; font-weight: bold;';
    p2.appendChild(document.createTextNode('請使用本地伺服器開啟，例如：'));
    p2.appendChild(document.createElement('br'));
    const code1 = document.createElement('code');
    code1.style.cssText = 'background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 4px;';
    code1.textContent = 'http://localhost:8000';
    p2.appendChild(code1);
    
    const p3 = document.createElement('p');
    p3.style.cssText = 'margin: 0 0 15px 0; font-size: 12px; opacity: 0.9;';
    p3.appendChild(document.createTextNode('可以使用 Python: '));
    const code2 = document.createElement('code');
    code2.textContent = 'python -m http.server 8000';
    p3.appendChild(code2);
    p3.appendChild(document.createElement('br'));
    p3.appendChild(document.createTextNode('或 Node.js: '));
    const code3 = document.createElement('code');
    code3.textContent = 'npx http-server -p 8000';
    p3.appendChild(code3);
    
    const btn = document.createElement('button');
    btn.style.cssText = 'padding: 10px 20px; background: white; color: #ff4444; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;';
    btn.textContent = '我知道了';
    btn.onclick = () => warning.remove();
    
    warning.appendChild(h3);
    warning.appendChild(p1);
    warning.appendChild(p2);
    warning.appendChild(p3);
    warning.appendChild(btn);
    document.body.appendChild(warning);
  }
});

// 搜尋建議相關變數
let searchDebounceTimer = null;
let currentSearchResults = [];
let selectedSearchIndex = -1;

// 初始化搜尋建議功能
function initSearchSuggestions() {
  const urlInput = document.getElementById('url-input');
  const suggestionsDiv = document.getElementById('search-suggestions');
  
  if (!urlInput) {
    return;
  }
  
  if (!suggestionsDiv) {
    return;
  }
  
  // 輸入事件處理（防抖搜尋）
  urlInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    // 清除之前的定時器
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    
    // 如果是 URL，不顯示搜尋建議
    if (query.includes('http://') || query.includes('https://') || 
        query.includes('twitch.tv/') || query.includes('youtube.com') || 
        query.includes('youtu.be/')) {
      hideSearchSuggestions();
      return;
    }
    
    // 如果輸入為空，隱藏建議
    if (query.length === 0) {
      hideSearchSuggestions();
      return;
    }
    
    // 防抖：延遲 300ms 後執行搜尋
    searchDebounceTimer = setTimeout(async () => {
      await performSearch(query);
    }, 300);
  });
  
  // 鍵盤導航
  urlInput.addEventListener('keydown', (e) => {
    if (suggestionsDiv.style.display === 'none') return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedSearchIndex = Math.min(selectedSearchIndex + 1, currentSearchResults.length - 1);
      updateSelectedSuggestion();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedSearchIndex = Math.max(selectedSearchIndex - 1, -1);
      updateSelectedSuggestion();
    } else if (e.key === 'Enter' && selectedSearchIndex >= 0) {
      e.preventDefault();
      selectSearchResult(currentSearchResults[selectedSearchIndex]);
    } else if (e.key === 'Escape') {
      hideSearchSuggestions();
    }
  });
  
  // 點擊外部關閉建議
  document.addEventListener('click', (e) => {
    if (!urlInput.contains(e.target) && !suggestionsDiv.contains(e.target)) {
      hideSearchSuggestions();
    }
  });
}

// 執行搜尋
async function performSearch(query) {
  const suggestionsDiv = document.getElementById('search-suggestions');
  if (!suggestionsDiv) {
    return;
  }
  
  // 獲取選擇的平台
  const platformSelect = document.getElementById('search-platform-select');
  const selectedPlatform = platformSelect ? platformSelect.value : 'twitch';
  
  // 顯示載入狀態
  suggestionsDiv.innerHTML = '<div style="padding: 12px; text-align: center; color: #aaa;">搜尋中...</div>';
  suggestionsDiv.style.display = 'block';
  
  try {
    // 根據選擇的平台進行搜尋
    const searchPromises = [];
    
    // Twitch 搜尋（如果選擇了 twitch）
    if (selectedPlatform === 'twitch' && 
        window.twitchApi && typeof window.twitchApi.searchChannels === 'function') {
      searchPromises.push(
        window.twitchApi.searchChannels(query, 5)
          .then(results => {
            if (results && Array.isArray(results) && results.length > 0) {
              const mappedResults = results.map(r => ({ 
                ...r, 
                platform: 'twitch', 
                source: 'twitch',
                // 確保 displayName 存在
                displayName: r.displayName || r.display_name || r.login || r.title || '未知頻道'
              }));
              return mappedResults;
            }
            return [];
          })
          .catch(error => {
            // Twitch API 錯誤，靜默處理，返回空陣列
            console.warn('Twitch 搜尋失敗:', error.message);
            return [];
          })
      );
    } else if (selectedPlatform === 'twitch') {
      console.warn('Twitch API 未載入或 searchChannels 函數不存在');
    }
    
    // YouTube 搜尋（暫時關閉）
    // YouTube API 功能已暫時關閉
    if (selectedPlatform === 'youtube') {
      console.warn('YouTube API 功能已暫時關閉');
    }
    
    // 等待所有搜尋完成（使用 Promise.allSettled 確保即使一個失敗，另一個仍能顯示結果）
    const allResults = await Promise.allSettled(searchPromises);
    
    const results = allResults
      .filter(result => result.status === 'fulfilled')
      .map(result => {
        const value = result.value;
        return Array.isArray(value) ? value : [];
      })
      .flat();
    
    currentSearchResults = results;
    selectedSearchIndex = -1;
    
    if (results.length === 0) {
      suggestionsDiv.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--text-secondary);">未找到頻道</div>';
      return;
    }
    
    // 顯示搜尋結果
    suggestionsDiv.innerHTML = '';
    results.forEach((channel, index) => {
      const item = document.createElement('div');
      item.className = 'search-suggestion-item';
      item.style.cssText = `
        padding: 10px 12px;
        cursor: pointer;
        border-bottom: 1px solid var(--border-color);
        display: flex;
        align-items: center;
        gap: 10px;
        transition: background 0.2s;
        background: var(--bg-input);
      `;
      item.dataset.index = index;
      
      // 確定平台
      const platform = channel.platform || channel.source || 'unknown';
      item.dataset.platform = platform;
      
      // 平台標籤
      const platformTag = document.createElement('div');
      const isYouTube = platform === 'youtube' || channel.source === 'youtube';
      platformTag.style.cssText = `
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 3px;
        background: ${isYouTube ? '#ff0000' : '#9147ff'};
        color: white;
        font-weight: bold;
        flex-shrink: 0;
      `;
      platformTag.textContent = isYouTube ? 'YT' : 'TW';
      
      // 開台狀態指示器
      const liveIndicator = document.createElement('div');
      liveIndicator.style.cssText = `
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: ${channel.isLive ? '#00ff00' : '#666'};
        flex-shrink: 0;
      `;
      liveIndicator.title = channel.isLive ? '正在直播' : '未開台';
      
      // 頻道資訊
      const info = document.createElement('div');
      info.style.cssText = 'flex: 1; min-width: 0;';
      
      const name = document.createElement('div');
      name.style.cssText = 'font-weight: bold; color: var(--text-primary); margin-bottom: 2px;';
      // 處理不同平台的顯示名稱
      let displayName = channel.displayName || channel.display_name || channel.title || channel.name || channel.login || '未知頻道';
      name.textContent = displayName;
      
      const details = document.createElement('div');
      details.style.cssText = 'font-size: 11px; color: var(--text-secondary);';
      if (channel.isLive) {
        // 顯示直播標題（如果有）和觀看人數
        const liveTitle = channel.liveTitle || channel.title || '';
        const viewerText = channel.viewerCount > 0 ? `${channel.viewerCount.toLocaleString()} 觀看者` : '正在直播';
        if (liveTitle) {
          details.textContent = `${liveTitle} • ${viewerText}`;
        } else {
          details.textContent = `正在直播 • ${viewerText}`;
        }
      } else {
        // 對於 Twitch，顯示 title 或 gameName；對於 YouTube，顯示 description
        const detailText = channel.title || channel.gameName || channel.description || '未開台';
        details.textContent = detailText;
      }
      
      info.appendChild(name);
      info.appendChild(details);
      
      item.appendChild(platformTag);
      item.appendChild(liveIndicator);
      item.appendChild(info);
      
      // 點擊事件
      item.addEventListener('click', () => {
        selectSearchResult(channel);
      });
      
      // 滑鼠懸停效果
      item.addEventListener('mouseenter', () => {
        item.style.background = 'var(--bg-button-hover)';
        selectedSearchIndex = index;
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'var(--bg-input)';
      });
      
      suggestionsDiv.appendChild(item);
    });
  } catch (error) {
    let errorMessage = '搜尋失敗';
    
    // 提供更詳細的錯誤訊息
    if (error.message) {
      errorMessage = error.message;
      
      // 如果是認證相關錯誤，提供更明確的提示
      if (error.message.includes('Access Token') || error.message.includes('Client ID') || error.message.includes('Client Secret')) {
        errorMessage = `認證失敗：${error.message}<br><small style="color: #999;">請檢查 config.js 中的 API 設定</small>`;
      } else if (error.message.includes('API Key')) {
        errorMessage = `API Key 錯誤：${error.message}<br><small style="color: #999;">請檢查 config.js 中的 API Key 設定</small>`;
      } else if (error.message.includes('CORS')) {
        errorMessage = `CORS 錯誤：${error.message}<br><small style="color: #999;">請考慮使用後端代理或檢查瀏覽器設定</small>`;
      }
    }
    
    suggestionsDiv.innerHTML = `<div style="padding: 12px; text-align: center; color: #ff6666;">${errorMessage}</div>`;
  }
}

// 更新選中的建議項
function updateSelectedSuggestion() {
  const suggestionsDiv = document.getElementById('search-suggestions');
  if (!suggestionsDiv) return;
  
  const items = suggestionsDiv.querySelectorAll('.search-suggestion-item');
  items.forEach((item, index) => {
    if (index === selectedSearchIndex) {
      item.style.background = 'var(--bg-button-hover)';
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      item.style.background = 'var(--bg-input)';
    }
  });
}

// 選擇搜尋結果
function selectSearchResult(channel) {
  const urlInput = document.getElementById('url-input');
  if (urlInput && channel.url) {
    // 對於 YouTube，如果搜尋結果中有直播影片 ID，使用直播 URL
    if (channel.platform === 'youtube' && channel.liveVideoId) {
      urlInput.value = `https://www.youtube.com/watch?v=${channel.liveVideoId}`;
    } else {
      // 否則使用提供的 URL
      urlInput.value = channel.url;
    }
    hideSearchSuggestions();
    urlInput.focus();
  }
}

// 隱藏搜尋建議
function hideSearchSuggestions() {
  const suggestionsDiv = document.getElementById('search-suggestions');
  if (suggestionsDiv) {
    suggestionsDiv.style.display = 'none';
    selectedSearchIndex = -1;
    currentSearchResults = [];
  }
}

// 初始化搜尋功能（確保在 DOM 準備好後執行）
function initSearchFunctionality() {
  const urlInput = document.getElementById('url-input');
  
  if (urlInput) {
    // 檢查是否已經初始化過（避免重複綁定事件）
    if (urlInput.dataset.searchInitialized === 'true') {
      return true;
    }
    
    urlInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') {
        // 如果有選中的搜尋結果，先選擇它
        if (selectedSearchIndex >= 0 && currentSearchResults[selectedSearchIndex]) {
          selectSearchResult(currentSearchResults[selectedSearchIndex]);
          // 延遲執行 addStream，確保 URL 已更新
          setTimeout(() => addStream(), 100);
        } else {
          addStream();
        }
      }
    });
    
    // 標記為已初始化
    urlInput.dataset.searchInitialized = 'true';
    
    // 初始化搜尋建議
    initSearchSuggestions();
    return true;
  } else {
    return false;
  }
}

// 在 DOMContentLoaded 時初始化搜尋功能
window.addEventListener('DOMContentLoaded', () => {
  // 延遲一點時間確保所有元素都已渲染
  setTimeout(() => {
    if (!initSearchFunctionality()) {
      // 如果第一次失敗，再重試幾次
      let retries = 0;
      const maxRetries = 5;
      const retryInterval = setInterval(() => {
        retries++;
        if (initSearchFunctionality() || retries >= maxRetries) {
          clearInterval(retryInterval);
        }
      }, 200);
    }
  }, 100);
});

// 如果 DOM 已經載入完成，立即嘗試初始化
if (document.readyState !== 'loading') {
  // DOM 已經載入完成，立即初始化
  setTimeout(() => {
    initSearchFunctionality();
  }, 100);
}

// 測試函數已在文件開頭定義

// 點擊外部關閉收藏管理界面
document.addEventListener('click', (e) => {
  const favoriteManager = document.getElementById('favorite-streams-manager');
  if (favoriteManager && favoriteManager.classList.contains('show')) {
    const managerContent = favoriteManager.querySelector('.favorite-manager-content');
    const managerHeader = favoriteManager.querySelector('.favorite-manager-header');
    if (managerContent && !managerContent.contains(e.target) && 
        managerHeader && !managerHeader.contains(e.target)) {
      // 如果點擊的是背景遮罩區域，關閉界面
      if (e.target === favoriteManager) {
        if (typeof closeFavoriteStreamsManager === 'function') {
          closeFavoriteStreamsManager();
        }
      }
    }
  }
});

