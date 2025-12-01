// 主入口和初始化

// 立即暴露測試函數到全局（在任何其他代碼之前）
(function() {
  window.testSearchFunction = function() {
    console.log('=== 搜尋功能測試 ===');
    console.log('1. 檢查 url-input 元素:', document.getElementById('url-input'));
    console.log('2. 檢查 search-suggestions 元素:', document.getElementById('search-suggestions'));
    console.log('3. 檢查 twitchApi:', window.twitchApi);
    console.log('4. 檢查 initSearchSuggestions 函數:', typeof initSearchSuggestions);
    console.log('5. 檢查 initSearchFunctionality 函數:', typeof initSearchFunctionality);
    console.log('6. 檢查 document.readyState:', document.readyState);
    console.log('7. 嘗試初始化搜尋功能...');
    const result = typeof initSearchFunctionality === 'function' ? initSearchFunctionality() : false;
    console.log('8. 初始化結果:', result ? '成功' : '失敗');
    return result;
  };
  console.log('[搜尋功能] testSearchFunction 已暴露到全局（在腳本開頭）');
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
        console.log('[IndexedDB 備份] 已從 IndexedDB 恢復數據');
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
    console.error('無法找到 url-input 元素，搜尋功能無法初始化');
    return;
  }
  
  if (!suggestionsDiv) {
    console.error('無法找到 search-suggestions 元素，搜尋功能無法初始化');
    return;
  }
  
  console.log('搜尋建議功能已初始化');
  
  // 輸入事件處理（防抖搜尋）
  urlInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    console.log('輸入事件觸發，輸入內容:', query);
    
    // 清除之前的定時器
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    
    // 如果是 URL，不顯示搜尋建議
    if (query.includes('http://') || query.includes('https://') || 
        query.includes('twitch.tv/') || query.includes('youtube.com') || 
        query.includes('youtu.be/')) {
      console.log('檢測到 URL 格式，隱藏搜尋建議');
      hideSearchSuggestions();
      return;
    }
    
    // 如果輸入為空，隱藏建議
    if (query.length === 0) {
      console.log('輸入為空，隱藏搜尋建議');
      hideSearchSuggestions();
      return;
    }
    
    // 防抖：延遲 300ms 後執行搜尋
    console.log('設置防抖定時器，將在 300ms 後搜尋:', query);
    searchDebounceTimer = setTimeout(async () => {
      console.log('開始搜尋:', query);
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
  if (!window.twitchApi || !window.twitchApi.searchChannels) {
    console.error('Twitch API 未載入，請檢查 twitch-api.js 是否正確載入');
    const suggestionsDiv = document.getElementById('search-suggestions');
    if (suggestionsDiv) {
      suggestionsDiv.innerHTML = '<div style="padding: 12px; text-align: center; color: #ff6666;">Twitch API 未載入，請檢查設定</div>';
      suggestionsDiv.style.display = 'block';
    }
    return; // Twitch API 未載入
  }
  
  const suggestionsDiv = document.getElementById('search-suggestions');
  if (!suggestionsDiv) {
    console.error('搜尋建議容器未找到');
    return;
  }
  
  // 顯示載入狀態
  suggestionsDiv.innerHTML = '<div style="padding: 12px; text-align: center; color: #aaa;">搜尋中...</div>';
  suggestionsDiv.style.display = 'block';
  
  try {
    const results = await window.twitchApi.searchChannels(query, 10);
    currentSearchResults = results;
    selectedSearchIndex = -1;
    
    if (results.length === 0) {
      suggestionsDiv.innerHTML = '<div style="padding: 12px; text-align: center; color: #666;">未找到頻道</div>';
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
        border-bottom: 1px solid #333;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: background 0.2s;
      `;
      item.dataset.index = index;
      
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
      name.style.cssText = 'font-weight: bold; color: #fff; margin-bottom: 2px;';
      name.textContent = channel.displayName;
      
      const details = document.createElement('div');
      details.style.cssText = 'font-size: 11px; color: #aaa;';
      if (channel.isLive) {
        details.textContent = `正在直播 • ${channel.viewerCount || 0} 觀看者`;
      } else {
        details.textContent = channel.title || '未開台';
      }
      
      info.appendChild(name);
      info.appendChild(details);
      
      item.appendChild(liveIndicator);
      item.appendChild(info);
      
      // 點擊事件
      item.addEventListener('click', () => {
        selectSearchResult(channel);
      });
      
      // 滑鼠懸停效果
      item.addEventListener('mouseenter', () => {
        item.style.background = '#2a2a2a';
        selectedSearchIndex = index;
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = '';
      });
      
      suggestionsDiv.appendChild(item);
    });
  } catch (error) {
    console.error('搜尋失敗:', error);
    let errorMessage = '搜尋失敗';
    
    // 提供更詳細的錯誤訊息
    if (error.message) {
      errorMessage = error.message;
      
      // 如果是認證相關錯誤，提供更明確的提示
      if (error.message.includes('Access Token') || error.message.includes('Client ID') || error.message.includes('Client Secret')) {
        errorMessage = `認證失敗：${error.message}<br><small style="color: #999;">請檢查 config.js 中的 TWITCH_CLIENT_ID 和 TWITCH_CLIENT_SECRET 設定</small>`;
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
      item.style.background = '#2a2a2a';
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      item.style.background = '';
    }
  });
}

// 選擇搜尋結果
function selectSearchResult(channel) {
  const urlInput = document.getElementById('url-input');
  if (urlInput && channel.url) {
    urlInput.value = channel.url;
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
  console.log('[搜尋功能] initSearchFunctionality() 被調用');
  const urlInput = document.getElementById('url-input');
  console.log('[搜尋功能] url-input 元素:', urlInput);
  
  if (urlInput) {
    console.log('[搜尋功能] 找到 url-input 元素，開始初始化搜尋功能');
    
    // 檢查是否已經初始化過（避免重複綁定事件）
    if (urlInput.dataset.searchInitialized === 'true') {
      console.log('[搜尋功能] 已經初始化過，跳過');
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
    console.log('[搜尋功能] 初始化完成');
    return true;
  } else {
    console.warn('[搜尋功能] 無法找到 url-input 元素');
    return false;
  }
}

// 在 DOMContentLoaded 時初始化搜尋功能
window.addEventListener('DOMContentLoaded', () => {
  console.log('[搜尋功能] DOMContentLoaded 事件觸發，準備初始化搜尋功能');
  // 延遲一點時間確保所有元素都已渲染
  setTimeout(() => {
    console.log('[搜尋功能] 開始初始化...');
    if (!initSearchFunctionality()) {
      console.warn('[搜尋功能] 第一次初始化失敗，將重試');
      // 如果第一次失敗，再重試幾次
      let retries = 0;
      const maxRetries = 5;
      const retryInterval = setInterval(() => {
        retries++;
        console.log(`[搜尋功能] 重試 ${retries}/${maxRetries}`);
        if (initSearchFunctionality() || retries >= maxRetries) {
          clearInterval(retryInterval);
          if (retries >= maxRetries) {
            console.error('[搜尋功能] 初始化失敗：無法找到 url-input 元素');
          } else {
            console.log('[搜尋功能] 初始化成功！');
          }
        }
      }, 200);
    } else {
      console.log('[搜尋功能] 初始化成功！');
    }
  }, 100);
});

// 如果 DOM 已經載入完成，立即嘗試初始化
if (document.readyState === 'loading') {
  console.log('[搜尋功能] DOM 正在載入中，等待 DOMContentLoaded 事件');
  // DOM 還在載入中，等待 DOMContentLoaded（已在上面處理）
} else {
  console.log('[搜尋功能] DOM 已載入完成，立即嘗試初始化');
  // DOM 已經載入完成，立即初始化
  setTimeout(() => {
    const result = initSearchFunctionality();
    if (result) {
      console.log('[搜尋功能] 立即初始化成功！');
    } else {
      console.warn('[搜尋功能] 立即初始化失敗，將在 DOMContentLoaded 時重試');
    }
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

