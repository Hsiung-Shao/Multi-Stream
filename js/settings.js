// 用戶設置和收藏管理功能

// IndexedDB 備份系統（替代本地文件系統）
const indexedDBBackup = {
  dbName: 'MultiStreamBackup',
  dbVersion: 1,
  storeName: 'backup',
  db: null,
  
  // 初始化數據庫
  async init() {
    if (!window.indexedDB) {
      return false;
    }
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => {
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve(true);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id' });
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  },
  
  // 檢查是否啟用備份
  isEnabled: () => {
    const enabled = localStorage.getItem('indexedDBBackupEnabled');
    if (enabled === null) {
      // 首次使用，默認啟用
      localStorage.setItem('indexedDBBackupEnabled', 'true');
      return true;
    }
    return enabled === 'true';
  },
  
  // 設置是否啟用備份
  setEnabled: (enabled) => {
    localStorage.setItem('indexedDBBackupEnabled', enabled ? 'true' : 'false');
  },
  
  // 獲取所有數據（從 localStorage）
  getAllData() {
    return {
      version: '1.0',
      exportDate: new Date().toISOString(),
      userSettings: safeJSONParse(localStorage.getItem('userSettings'), null),
      favoriteStreams: safeJSONParse(localStorage.getItem('favoriteStreams'), []),
      favoriteCategories: safeJSONParse(localStorage.getItem('favoriteCategories'), []),
      controlPanelCollapsed: localStorage.getItem('controlPanelCollapsed'),
      controlPanelPosition: safeJSONParse(localStorage.getItem('controlPanelPosition'), null),
      multiStreamLayout: safeJSONParse(localStorage.getItem('multiStreamLayout'), null),
      adConfig: safeJSONParse(localStorage.getItem('adConfig'), null)
    };
  },
  
  // 檢查 localStorage 是否有數據
  hasLocalStorageData: () => {
    const favoriteStreams = localStorage.getItem('favoriteStreams');
    const favoriteCategories = localStorage.getItem('favoriteCategories');
    const userSettings = localStorage.getItem('userSettings');
    
    // 檢查是否有任何重要數據
    if (favoriteStreams && favoriteStreams !== '[]' && favoriteStreams !== 'null') {
      return true;
    }
    if (favoriteCategories && favoriteCategories !== '[]' && favoriteCategories !== 'null') {
      return true;
    }
    if (userSettings && userSettings !== '{}' && userSettings !== 'null') {
      return true;
    }
    
    return false;
  },
  
  // 備份數據到 IndexedDB
  async backup() {
    if (!this.isEnabled()) {
      return false;
    }
    
    // 確保數據庫已初始化
    if (!this.db) {
      try {
        await this.init();
      } catch (error) {
        return false;
      }
    }
    
    if (!this.db) {
      return false;
    }
    
    try {
      const data = this.getAllData();
      const backupData = {
        id: 'latest',
        timestamp: Date.now(),
        data: data
      };
      
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      await store.put(backupData);
      
      return true;
    } catch (error) {
      return false;
    }
  },
  
  // 從 IndexedDB 恢復數據
  async restore() {
    // 檢查 localStorage 是否有數據
    if (this.hasLocalStorageData()) {
      return { success: false, message: 'localStorage 中已有數據，以 localStorage 為主', skipped: true };
    }
    
    // 確保數據庫已初始化
    if (!this.db) {
      try {
        await this.init();
      } catch (error) {
        return { success: false, message: '數據庫初始化失敗' };
      }
    }
    
    if (!this.db) {
      return { success: false, message: '數據庫未初始化' };
    }
    
    try {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get('latest');
      
      return new Promise((resolve) => {
        request.onsuccess = () => {
          const result = request.result;
          if (!result || !result.data) {
            resolve({ success: false, message: '沒有找到備份數據' });
            return;
          }
          
          const data = result.data;
          
          // 驗證數據格式
          if (!data.version) {
            resolve({ success: false, message: '無效的備份數據格式' });
            return;
          }
          
          // 恢復數據到 localStorage
          if (data.userSettings) {
            localStorage.setItem('userSettings', JSON.stringify(data.userSettings));
          }
          if (data.favoriteStreams && Array.isArray(data.favoriteStreams)) {
            localStorage.setItem('favoriteStreams', JSON.stringify(data.favoriteStreams));
          }
          if (data.favoriteCategories && Array.isArray(data.favoriteCategories)) {
            localStorage.setItem('favoriteCategories', JSON.stringify(data.favoriteCategories));
          }
          if (data.controlPanelCollapsed !== undefined) {
            localStorage.setItem('controlPanelCollapsed', data.controlPanelCollapsed);
          }
          if (data.controlPanelPosition) {
            localStorage.setItem('controlPanelPosition', JSON.stringify(data.controlPanelPosition));
          }
          if (data.multiStreamLayout) {
            localStorage.setItem('multiStreamLayout', JSON.stringify(data.multiStreamLayout));
          }
          if (data.adConfig) {
            localStorage.setItem('adConfig', JSON.stringify(data.adConfig));
          }
          
          resolve({ success: true, message: '數據恢復成功' });
        };
        
        request.onerror = () => {
          resolve({ success: false, message: '讀取備份失敗' });
        };
      });
    } catch (error) {
      return { success: false, message: '恢復數據失敗' };
    }
  },
  
  // 自動載入備份（頁面載入時）
  async autoLoadBackup() {
    if (!this.isEnabled()) {
      return false;
    }
    
    return await this.restore();
  }
};

// 初始化 IndexedDB 備份系統（頁面載入時）
if (window.indexedDB) {
  indexedDBBackup.init().catch(() => {
    // 初始化失敗，靜默處理
  });
}

// 顯示保存消息（在收藏管理界面下方）
function showSaveMessage(message) {
  const manager = document.getElementById('favorite-streams-manager');
  if (!manager) return;
  
  const managerContent = manager.querySelector('.favorite-manager-content');
  if (!managerContent) return;
  
  let messageDiv = document.getElementById('favorite-save-message');
  if (!messageDiv) {
    messageDiv = document.createElement('div');
    messageDiv.id = 'favorite-save-message';
    messageDiv.style.cssText = 'margin-top: 10px; padding: 8px; font-size: 11px; color: #28a745; text-align: center; background: rgba(40, 167, 69, 0.1); border-radius: 4px;';
    managerContent.appendChild(messageDiv);
  }
  
  messageDiv.textContent = message;
  messageDiv.style.display = 'block';
  
  // 3秒後自動隱藏
  setTimeout(() => {
    messageDiv.style.display = 'none';
  }, 3000);
}

// 切換備份功能開關
function toggleBackupEnabled() {
  const checkbox = document.getElementById('backup-enabled-checkbox');
  if (!checkbox) return;
  
  const enabled = checkbox.checked;
  indexedDBBackup.setEnabled(enabled);
  
  // 如果啟用備份，立即觸發一次備份
  if (enabled) {
    // 清除計時器，立即備份
    if (window.backupTimeout) {
      clearTimeout(window.backupTimeout);
    }
    indexedDBBackup.backup().then((success) => {
      if (success) {
        showSaveMessage('備份功能已啟用，當前數據已備份到 IndexedDB');
      } else {
        showSaveMessage('備份功能已啟用，但備份失敗');
      }
    }).catch(() => {
      // 備份錯誤，靜默處理
    });
  } else {
    showSaveMessage('數據備份已關閉');
  }
  
  // 更新設定頁面顯示
  updateBackupSettingsDisplay();
}

// 匯出 JSON 檔案
function exportToJSON() {
  try {
    const data = indexedDBBackup.getAllData();
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `multistream-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSaveMessage('數據已匯出為 JSON 檔案');
  } catch (error) {
    showSaveMessage('匯出失敗，請稍後再試');
  }
}

// 匯入 JSON 檔案
function importFromJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = safeJSONParse(text, null);
      
      if (!data) {
        showSaveMessage('匯入失敗：檔案格式錯誤');
        return;
      }
      
      // 驗證數據格式
      if (!data.version) {
        showSaveMessage('匯入失敗：無效的備份檔案格式');
        return;
      }
      
      // 檢查 localStorage 是否有數據
      if (indexedDBBackup.hasLocalStorageData()) {
        if (!confirm('localStorage 中已有數據，匯入將會覆蓋現有數據。確定要繼續嗎？')) {
          return;
        }
      }
      
      // 匯入數據到 localStorage
      if (data.userSettings) {
        localStorage.setItem('userSettings', JSON.stringify(data.userSettings));
      }
      if (data.favoriteStreams && Array.isArray(data.favoriteStreams)) {
        localStorage.setItem('favoriteStreams', JSON.stringify(data.favoriteStreams));
      }
      if (data.favoriteCategories && Array.isArray(data.favoriteCategories)) {
        localStorage.setItem('favoriteCategories', JSON.stringify(data.favoriteCategories));
      }
      if (data.controlPanelCollapsed !== undefined) {
        localStorage.setItem('controlPanelCollapsed', data.controlPanelCollapsed);
      }
      if (data.controlPanelPosition) {
        localStorage.setItem('controlPanelPosition', JSON.stringify(data.controlPanelPosition));
      }
      if (data.multiStreamLayout) {
        localStorage.setItem('multiStreamLayout', JSON.stringify(data.multiStreamLayout));
      }
      if (data.adConfig) {
        localStorage.setItem('adConfig', JSON.stringify(data.adConfig));
      }
      
      // 如果已啟用備份，立即備份到 IndexedDB
      if (indexedDBBackup.isEnabled()) {
        if (window.backupTimeout) {
          clearTimeout(window.backupTimeout);
        }
        await indexedDBBackup.backup();
      }
      
      showSaveMessage('數據已匯入成功，頁面將重新載入');
      
      // 重新載入設置
      if (typeof loadUserSettings === 'function') {
        loadUserSettings();
      }
      
      // 重新載入頁面以確保所有設置生效
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      showSaveMessage('匯入失敗：' + (error.message || '未知錯誤'));
    }
  };
  input.click();
}

// 更新備份設定顯示
function updateBackupSettingsDisplay() {
  const backupStatusDiv = document.getElementById('backup-status');
  if (backupStatusDiv) {
    const backupEnabled = indexedDBBackup.isEnabled();
    const i18n = window.i18n || { t: (key) => key };
    backupStatusDiv.textContent = backupEnabled ? i18n.t('backupEnabled') || '已啟用' : i18n.t('backupDisabled') || '已停用';
    backupStatusDiv.style.color = backupEnabled ? '#28a745' : '#ffa500';
  }
}

// 保存用戶設置
function saveUserSettings() {
  const settings = {
    // 控制面板設置
    controlPanel: {
      collapsed: document.getElementById('control-panel').classList.contains('collapsed'),
      position: (() => {
        const panel = document.getElementById('control-panel');
        const savedPosition = localStorage.getItem('controlPanelPosition');
        if (savedPosition) {
          return safeJSONParse(savedPosition, null);
        }
        return null;
      })()
    },
    // 總音量設置
    masterVolume: (() => {
      const slider = document.getElementById('master-volume');
      return slider ? parseInt(slider.value) : 100;
    })(),
    // 布局偏好
    preferredLayout: (() => {
      // 可以根據當前布局保存偏好
      const boxes = document.querySelectorAll('.stream-box');
      if (boxes.length === 0) return null;
      if (typeof autoSelectLayout === 'function') {
        return autoSelectLayout();
      }
      return null;
    })(),
    // 聊天室設置
    allChatsVisible: (() => {
      const boxes = document.querySelectorAll('.stream-box');
      if (boxes.length === 0) return true;
      let visibleCount = 0;
      boxes.forEach(box => {
        const id = parseInt(box.dataset.streamId);
        const chatDiv = document.getElementById('chat' + id);
        if (chatDiv && !chatDiv.classList.contains('hidden')) {
          visibleCount++;
        }
      });
      return visibleCount > boxes.length / 2;
    })()
  };
  
  localStorage.setItem('userSettings', JSON.stringify(settings));
  // 用戶設置已保存
  
  // 如果已啟用備份，觸發防抖備份
  if (indexedDBBackup.isEnabled()) {
    debouncedBackup();
  }
  
  // 顯示保存消息（如果收藏管理界面打開）
  const manager = document.getElementById('favorite-streams-manager');
  if (manager && manager.classList.contains('show')) {
    showSaveMessage('資料已儲存');
  }
}

// 載入用戶設置
function loadUserSettings() {
  const saved = localStorage.getItem('userSettings');
  if (!saved) return;
  
  try {
    const settings = safeJSONParse(saved, {});
    if (!settings) return;
    
    // 恢復總音量
    if (settings.masterVolume !== undefined) {
      const slider = document.getElementById('master-volume');
      const valueSpan = document.getElementById('master-volume-value');
      if (slider) {
        slider.value = settings.masterVolume;
        if (valueSpan) {
          valueSpan.textContent = settings.masterVolume + '%';
        }
        if (typeof updateMasterVolume === 'function') {
          updateMasterVolume();
        }
      }
    }
    
    // 恢復聊天室設置
    if (settings.allChatsVisible !== undefined) {
      const boxes = document.querySelectorAll('.stream-box');
      boxes.forEach(box => {
        const id = parseInt(box.dataset.streamId);
        const chatDiv = document.getElementById('chat' + id);
        const resizer = document.getElementById('chat-resizer' + id);
        
        if (chatDiv) {
          if (!settings.allChatsVisible) {
            chatDiv.classList.add('hidden');
            if (resizer) resizer.style.display = 'none';
            if (streamData[id]) streamData[id].chatVisible = false;
          } else {
            chatDiv.classList.remove('hidden');
            if (resizer) resizer.style.display = '';
            if (streamData[id]) streamData[id].chatVisible = true;
          }
        }
      });
      
      // 更新按鈕狀態
      if (typeof updateAllChatsButton === 'function') {
        updateAllChatsButton();
      }
    }
    
    // 用戶設置已載入
  } catch (e) {
    // 載入用戶設置失敗，靜默處理
  }
}

// 收藏分類管理
const favoriteCategories = {
  // 獲取分類列表
  getList: () => {
    const saved = localStorage.getItem('favoriteCategories');
    return safeJSONParse(saved, []);
  },
  
  // 保存分類列表
  saveList: (list) => {
    localStorage.setItem('favoriteCategories', JSON.stringify(list));
    // 觸發防抖備份（10秒後無新操作才備份）
    debouncedBackup();
  },
  
  // 添加分類
  add: (name) => {
    const list = favoriteCategories.getList();
    
    const i18n = window.i18n || { t: (key) => key };
    // 檢查是否已存在
    if (list.some(cat => cat.name === name)) {
      return { success: false, message: i18n.t('categoryExists') };
    }
    
    const newCategory = {
      id: Date.now().toString(),
      name: name,
      createdAt: new Date().toISOString()
    };
    
    list.push(newCategory);
    favoriteCategories.saveList(list);
    
    return { success: true, message: i18n.t('categoryAdded'), category: newCategory };
  },
  
  // 更新分類
  update: (id, newName) => {
    const list = favoriteCategories.getList();
    const category = list.find(cat => cat.id === id);
    
    if (!category) {
      const i18n = window.i18n || { t: (key) => key };
      return { success: false, message: i18n.t('categoryNotFound') };
    }
    
    const i18n = window.i18n || { t: (key) => key };
    // 檢查新名稱是否與其他分類重複
    if (list.some(cat => cat.id !== id && cat.name === newName)) {
      return { success: false, message: i18n.t('categoryExists') };
    }
    
    category.name = newName;
    favoriteCategories.saveList(list);
    
    return { success: true, message: i18n.t('categoryUpdated') };
  },
  
  // 移除分類
  remove: (id) => {
    const list = favoriteCategories.getList();
    const filtered = list.filter(cat => cat.id !== id);
    favoriteCategories.saveList(filtered);
    
    // 將該分類下的所有收藏移到"未分類"
    const favorites = favoriteStreams.getList();
    favorites.forEach(fav => {
      if (fav.categoryId === id) {
        fav.categoryId = null;
      }
    });
    favoriteStreams.saveList(favorites);
    
    // 刪除操作立即備份（不等待防抖）
    if (indexedDBBackup.isEnabled()) {
      // 清除防抖計時器
      if (window.backupTimeout) {
        clearTimeout(window.backupTimeout);
      }
      // 立即執行備份
      indexedDBBackup.backup().catch(() => {
        // 備份錯誤，靜默處理
      });
    }
    
    const i18n = window.i18n || { t: (key) => key };
    return { success: true, message: i18n.t('categoryRemoved') };
  }
};

// 收藏串流管理
const favoriteStreams = {
  // 獲取收藏列表
  getList: () => {
    const saved = localStorage.getItem('favoriteStreams');
    return safeJSONParse(saved, []);
  },
  
  // 保存收藏列表
  saveList: (list) => {
    localStorage.setItem('favoriteStreams', JSON.stringify(list));
    // 觸發防抖備份（10秒後無新操作才備份）
    debouncedBackup();
  },
  
  // 添加收藏
  add: (url, name = '', categoryId = null) => {
    const list = favoriteStreams.getList();
    
    // 檢查是否已存在
    if (list.some(item => item.url === url)) {
      const i18n = window.i18n || { t: (key) => key };
      return { success: false, message: i18n.t('streamAlreadyInFavorites') };
    }
    
    // 解析平台和ID
    let platform = '';
    let channelId = '';
    let videoId = '';
    
    if (url.includes('twitch.tv')) {
      const match = url.match(/twitch\.tv\/([^\/\?]+)/);
      if (match) {
        platform = 'twitch';
        channelId = match[1];
        if (!name) name = channelId;
      }
    } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
      // 嘗試提取 channelId（優先）
      if (url.includes('youtube.com/channel/')) {
        const channelMatch = url.match(/youtube\.com\/channel\/([^\/\?]+)/);
        if (channelMatch) {
          channelId = channelMatch[1];
          platform = 'youtube';
          if (!name) name = channelId;
        }
      } else if (url.includes('youtube.com/c/') || url.includes('youtube.com/user/') || url.includes('youtube.com/@')) {
        // 這些 URL 格式需要通過 API 查詢才能獲得 channelId，暫時不處理
        // 用戶可以通過搜尋功能添加頻道，這樣會自動獲得 channelId
      }
      
      // 如果沒有 channelId，嘗試提取 videoId（但對於收藏，我們希望使用 channelId）
      // 如果只有 videoId，我們需要通過 API 查詢來獲取 channelId
      if (!channelId) {
        if (url.includes('youtube.com/live/')) {
          videoId = url.split('live/')[1]?.split('?')[0];
        } else if (url.includes('youtube.com/watch')) {
          videoId = new URL(url).searchParams.get('v');
        } else if (url.includes('youtu.be/')) {
          videoId = url.split('youtu.be/')[1]?.split('?')[0];
        }
        if (videoId) {
          platform = 'youtube';
          if (!name) name = videoId;
          // 注意：如果只有 videoId，channelId 會是空的，這在收藏系統中可能會有問題
          // 但為了向後兼容，我們仍然允許這種情況
        }
      }
    }
    
    if (!platform) {
      const i18n = window.i18n || { t: (key) => key };
      return { success: false, message: i18n.t('cannotParseStreamUrl') };
    }
    
    // 對於 YouTube，確保 URL 使用頻道 ID（如果有的話）
    // 這樣可以確保收藏系統使用固定的頻道 ID，而不是會變化的影片 ID
    let finalUrl = url;
    if (platform === 'youtube' && channelId) {
      // 如果已經有 channelId，使用頻道 URL
      finalUrl = `https://www.youtube.com/channel/${channelId}`;
    }
    
    const newItem = {
      id: Date.now().toString(),
      url: finalUrl, // 對於 YouTube，使用頻道 URL（包含 channelId）
      name: name,
      platform: platform,
      channelId: channelId, // 對於 YouTube，優先使用 channelId
      videoId: videoId,
      categoryId: categoryId,
      addedAt: new Date().toISOString(),
      // 開台狀態相關欄位
      isLive: null, // null 表示未知，true/false 表示已知狀態
      lastChecked: null, // 最後檢查時間
      viewerCount: null, // 觀看人數（僅在開台時有效）
      liveTitle: null, // 直播標題（僅在開台時有效）
      gameName: null, // 遊戲名稱（僅在開台時有效）
      liveVideoId: null // 當前直播的影片 ID（如果正在直播）
    };
    
    list.push(newItem);
    favoriteStreams.saveList(list);
    
    const i18n = window.i18n || { t: (key) => key };
    return { success: true, message: i18n.t('addedToFavorites') };
  },
  
  // 更新收藏
  update: (id, updates) => {
    const list = favoriteStreams.getList();
    const item = list.find(fav => fav.id === id);
    
    if (!item) {
      const i18n = window.i18n || { t: (key) => key };
      return { success: false, message: i18n.t('favoriteNotFound') };
    }
    
    // 更新字段
    if (updates.name !== undefined) item.name = updates.name;
    if (updates.categoryId !== undefined) item.categoryId = updates.categoryId;
    
    favoriteStreams.saveList(list);
    
    const i18n = window.i18n || { t: (key) => key };
    return { success: true, message: i18n.t('favoriteUpdated') };
  },
  
  // 移除收藏
  remove: (id) => {
    const list = favoriteStreams.getList();
    const filtered = list.filter(item => item.id !== id);
    favoriteStreams.saveList(filtered);
    
    // 刪除操作立即備份（不等待防抖）
    if (indexedDBBackup.isEnabled()) {
      // 清除防抖計時器
      if (window.backupTimeout) {
        clearTimeout(window.backupTimeout);
      }
      // 立即執行備份
      indexedDBBackup.backup().catch(() => {
        // 備份錯誤，靜默處理
      });
    }
    
    const i18n = window.i18n || { t: (key) => key };
    return { success: true, message: i18n.t('favoriteRemoved') };
  },
  
  // 從收藏加載串流
  load: async (item) => {
    if (!item) {
      const i18n = window.i18n || { t: (key) => key };
      return { success: false, message: i18n.t('invalidFavoriteItem') };
    }
    
    // 對於 YouTube 頻道，先檢查是否正在直播，如果開台則使用直播 URL
    // YouTube API 功能已暫時關閉，直接使用 URL
    if (item.platform === 'youtube' && item.channelId) {
      // YouTube API 功能已暫時關閉，直接使用收藏的 URL
      addStream(item.url);
      return { success: true };
    } else {
      // Twitch 或其他平台，直接使用 URL
      if (item.url) {
        addStream(item.url);
        return { success: true };
      }
      const i18n = window.i18n || { t: (key) => key };
      return { success: false, message: i18n.t('invalidFavoriteItem') };
    }
  },
  
  // 批量加載收藏
  loadMultiple: async (items) => {
    if (!items || items.length === 0) {
      const i18n = window.i18n || { t: (key) => key };
      return { success: false, message: i18n.t('noFavoritesToLoad') };
    }
    
    // 對於批量加載，我們需要等待每個項目的異步操作完成
    // 但為了不阻塞，我們仍然使用 setTimeout 來間隔加載
    items.forEach((item, index) => {
      setTimeout(async () => {
        await favoriteStreams.load(item);
      }, index * 300); // 每個串流間隔300毫秒加載
    });
    
    const i18n = window.i18n || { t: (key) => key };
    return { success: true, message: `${i18n.t('loadingStreams')} ${items.length} ${i18n.t('streams')}` };
  }
};

// 顯示收藏管理界面（使用全局变量保存筛选状态）
let currentCategoryFilter = null;

function showFavoriteStreamsManager() {
  const list = favoriteStreams.getList();
  const categories = favoriteCategories.getList();
  const i18n = window.i18n || { t: (key) => key };
  
  // 創建或獲取管理界面
  let manager = document.getElementById('favorite-streams-manager');
  if (!manager) {
    manager = document.createElement('div');
    manager.id = 'favorite-streams-manager';
    manager.className = 'favorite-streams-manager';
    document.body.appendChild(manager);
    
    // 點擊外部關閉
    manager.addEventListener('click', (e) => {
      if (e.target === manager) {
        closeFavoriteStreamsManager();
      }
    });
  }
  
  // 構建界面內容
  let content = `
    <div class="favorite-manager-header">
      <h3>${escapeHtml(i18n.t('favoriteManager'))}</h3>
      <button onclick="closeFavoriteStreamsManager()" class="close-btn">×</button>
    </div>
    <div class="favorite-manager-content">
      <div class="favorite-tabs">
        <button class="tab-btn active" data-tab="favorites">${escapeHtml(i18n.t('favoriteStreamsTab'))}</button>
        <button class="tab-btn" data-tab="categories">${escapeHtml(i18n.t('categoryManagementTab'))}</button>
        <button class="tab-btn" data-tab="settings">${escapeHtml(i18n.t('settingsTab'))}</button>
      </div>
      
      <!-- 收藏串流標籤頁 -->
      <div class="tab-content active" id="tab-favorites">
        <div class="favorite-controls">
          <div class="favorite-add-section">
            <input type="text" id="favorite-url-input" placeholder="${escapeHtml(i18n.t('pasteStreamUrl'))}" style="flex: 1; padding: 6px; margin-right: 8px;">
            <input type="text" id="favorite-name-input" placeholder="${escapeHtml(i18n.t('customNameOptional'))}" style="flex: 1; padding: 6px; margin-right: 8px;">
            <select id="favorite-category-select" style="padding: 6px; margin-right: 8px; background: #2a2a2a; border: 1px solid #444; color: #fff; border-radius: 4px;">
              <option value="">${escapeHtml(i18n.t('uncategorized'))}</option>
  `;
  
  // 填充分類選擇器
  categories.forEach(cat => {
    content += `<option value="${cat.id}">${cat.name}</option>`;
  });
  
  content += `
            </select>
            <button onclick="addToFavorites()" style="padding: 6px 12px;">${escapeHtml(i18n.t('addToFavorites'))}</button>
          </div>
          <div class="favorite-filter-section">
            <select id="category-filter" style="padding: 6px; margin-right: 8px; background: #2a2a2a; border: 1px solid #444; color: #fff; border-radius: 4px;">
              <option value="">${escapeHtml(i18n.t('all'))}</option>
              <option value="null">${escapeHtml(i18n.t('uncategorized'))}</option>
  `;
  
  // 填充分類篩選器
  categories.forEach(cat => {
    content += `<option value="${cat.id}">${cat.name}</option>`;
  });
  
  content += `
            </select>
            <button onclick="selectAllFavorites()" style="padding: 6px 12px; font-size: 11px;">${escapeHtml(i18n.t('selectAll'))}</button>
            <button onclick="deselectAllFavorites()" style="padding: 6px 12px; font-size: 11px;">${escapeHtml(i18n.t('deselectAll'))}</button>
            <button onclick="loadSelectedFavorites()" style="padding: 6px 12px; font-size: 11px; background: #9147ff;">${escapeHtml(i18n.t('loadSelected'))}</button>
          </div>
        </div>
        <div class="favorite-list" id="favorite-list">
  `;
  
  // 過濾收藏列表
  let filteredList = list;
  if (currentCategoryFilter !== null) {
    if (currentCategoryFilter === 'null') {
      filteredList = list.filter(item => !item.categoryId);
    } else {
      filteredList = list.filter(item => item.categoryId === currentCategoryFilter);
    }
  }
  
  if (filteredList.length === 0) {
    content += `<div style="padding: 20px; text-align: center; color: #888;">${escapeHtml(i18n.t('noFavorites'))}</div>`;
  } else {
    filteredList.forEach((item) => {
      // 转义所有用户输入以防止 XSS
      const safeDisplayName = escapeHtml(item.name || (item.platform === 'twitch' ? item.channelId : item.videoId));
      const platformIcon = item.platform === 'twitch' ? '🎮' : '📺';
      const safeCategoryName = escapeHtml(item.categoryId ? categories.find(c => c.id === item.categoryId)?.name || i18n.t('unknownCategory') : i18n.t('uncategorized'));
      const safeItemId = escapeHtml(item.id);
      const safeItemUrl = escapeHtml(item.url);
      
      // 生成分類選項（转义）
      let categoryOptions = `<option value="">${escapeHtml(i18n.t('uncategorized'))}</option>`;
      categories.forEach(cat => {
        const selected = item.categoryId === cat.id ? 'selected' : '';
        const safeCatId = escapeHtml(cat.id);
        const safeCatName = escapeHtml(cat.name);
        categoryOptions += `<option value="${safeCatId}" ${selected}>${safeCatName}</option>`;
      });
      
      content += `
        <div class="favorite-item" data-id="${safeItemId}" data-category-id="${escapeHtml(item.categoryId || '')}">
          <div class="favorite-item-checkbox">
            <input type="checkbox" class="favorite-checkbox" data-favorite-id="${safeItemId}">
          </div>
          <div class="favorite-item-info">
            <span class="favorite-platform-icon">${platformIcon}</span>
            <span class="favorite-item-name">${safeDisplayName}</span>
            <span class="favorite-item-category">📁 ${safeCategoryName}</span>
            <span class="favorite-item-url">${safeItemUrl}</span>
          </div>
          <div class="favorite-item-edit" style="display: none;">
            <input type="text" class="favorite-edit-name" value="${safeDisplayName}" style="flex: 1; padding: 4px; margin-right: 8px; background: #2a2a2a; border: 1px solid #444; color: #fff; border-radius: 4px; font-size: 12px;">
            <select class="favorite-edit-category" style="padding: 4px; margin-right: 8px; background: #2a2a2a; border: 1px solid #444; color: #fff; border-radius: 4px; font-size: 12px;">
              ${categoryOptions}
            </select>
            <button class="save-favorite-btn" data-favorite-id="${safeItemId}" style="padding: 4px 8px; margin-right: 4px; background: #9147ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">${escapeHtml(i18n.t('save'))}</button>
            <button class="cancel-edit-btn" data-favorite-id="${safeItemId}" style="padding: 4px 8px; background: #444; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">${escapeHtml(i18n.t('cancel'))}</button>
          </div>
          <div class="favorite-item-actions">
            <button class="edit-favorite-btn" data-favorite-id="${safeItemId}" title="${escapeHtml(i18n.t('edit'))}">✏️</button>
            <button class="load-favorite-btn" data-favorite-id="${safeItemId}" title="${escapeHtml(i18n.t('load'))}">▶</button>
            <button class="remove-favorite-btn" data-favorite-id="${safeItemId}" title="${escapeHtml(i18n.t('remove'))}">🗑</button>
          </div>
        </div>
      `;
    });
  }
  
  content += `
        </div>
      </div>
      
      <!-- 分類管理標籤頁 -->
      <div class="tab-content" id="tab-categories">
        <div class="category-add-section">
          <input type="text" id="category-name-input" placeholder="${escapeHtml(i18n.t('categoryName'))}" style="flex: 1; padding: 6px; margin-right: 8px;">
          <button onclick="addCategory()" style="padding: 6px 12px;">${escapeHtml(i18n.t('addCategory'))}</button>
        </div>
        <div class="category-list" id="category-list">
  `;
  
  if (categories.length === 0) {
    content += `<div style="padding: 20px; text-align: center; color: #888;">${escapeHtml(i18n.t('noCategories'))}</div>`;
  } else {
    categories.forEach((cat) => {
      // 转义用户输入以防止 XSS
      const safeCatId = escapeHtml(cat.id);
      const safeCatName = escapeHtml(cat.name);
      const count = list.filter(item => item.categoryId === cat.id).length;
      content += `
        <div class="category-item" data-id="${safeCatId}">
          <div class="category-item-info">
            <span class="category-item-name">📁 ${safeCatName}</span>
            <span class="category-item-count">(${count} ${escapeHtml(i18n.t('favoritesCount'))})</span>
          </div>
          <div class="category-item-actions">
            <button class="load-category-btn" data-category-id="${safeCatId}" title="${escapeHtml(i18n.t('loadCategory'))}">▶ ${escapeHtml(i18n.t('load'))}</button>
            <button class="edit-category-btn" data-category-id="${safeCatId}" title="${escapeHtml(i18n.t('edit'))}">✏️</button>
            <button class="remove-category-btn" data-category-id="${safeCatId}" title="${escapeHtml(i18n.t('remove'))}">🗑</button>
          </div>
        </div>
      `;
    });
  }
  
  // 獲取備份功能狀態
  const backupEnabled = indexedDBBackup.isEnabled();
  
  content += `
        </div>
      </div>
      
      <!-- 設定標籤頁 -->
      <div class="tab-content" id="tab-settings">
        <div style="padding: 20px;">
          <div style="margin-bottom: 20px;">
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
              <input type="checkbox" id="backup-enabled-checkbox" ${backupEnabled ? 'checked' : ''} onchange="toggleBackupEnabled()" style="width: 18px; height: 18px; cursor: pointer;">
              <span style="font-size: 14px; color: #fff;">${escapeHtml(i18n.t('enableAutoBackup'))}</span>
            </label>
            <div style="margin-top: 8px; font-size: 12px; color: #28a745; margin-left: 28px; padding: 8px; background: rgba(40, 167, 69, 0.1); border-radius: 4px; border-left: 3px solid #28a745;">
              數據將自動備份到瀏覽器的 IndexedDB，無需選擇文件位置
            </div>
          </div>
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #333;">
            <div style="margin-bottom: 12px;">
              <div style="font-size: 13px; color: #fff; margin-bottom: 8px;">備份狀態</div>
              <div id="backup-status" style="font-size: 12px; color: ${backupEnabled ? '#28a745' : '#ffa500'}; margin-bottom: 8px; padding: 6px; background: rgba(255, 255, 255, 0.05); border-radius: 4px;">
                ${backupEnabled ? (i18n.t('backupEnabled') || '已啟用') : (i18n.t('backupDisabled') || '已停用')}
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button onclick="exportToJSON()" style="padding: 6px 12px; background: #28a745; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">匯出 JSON 檔案</button>
                <button onclick="importFromJSON()" style="padding: 6px 12px; background: #007bff; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">匯入 JSON 檔案</button>
              </div>
              <div style="margin-top: 6px; font-size: 11px; color: #aaa;">
                數據會自動備份到瀏覽器的 IndexedDB。您也可以手動匯出/匯入 JSON 檔案進行備份或遷移<br>
                ${escapeHtml(i18n.t('createNewFileDesc'))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  manager.innerHTML = content;
  manager.classList.add('show');
  
  // 更新備份設定顯示
  updateBackupSettingsDisplay();
  
  // 標籤頁切換
  const tabBtns = manager.querySelectorAll('.tab-btn');
  const tabContents = manager.querySelectorAll('.tab-content');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${tab}`).classList.add('active');
    });
  });
  
  // 分類篩選
  const categoryFilter = document.getElementById('category-filter');
  if (categoryFilter) {
    // 設置當前篩選值
    if (currentCategoryFilter === null) {
      categoryFilter.value = '';
    } else if (currentCategoryFilter === 'null') {
      categoryFilter.value = 'null';
    } else {
      categoryFilter.value = currentCategoryFilter;
    }
    
    categoryFilter.addEventListener('change', (e) => {
      const value = e.target.value;
      currentCategoryFilter = value === '' ? null : (value === 'null' ? 'null' : value);
      showFavoriteStreamsManager(); // 重新渲染
    });
  }
  
  // 事件委托处理按钮点击
  const favoriteList = manager.querySelector('.favorite-list');
  if (favoriteList) {
    favoriteList.addEventListener('click', (e) => {
      const target = e.target;
      if (target.classList.contains('load-favorite-btn')) {
        const favoriteId = target.getAttribute('data-favorite-id');
        if (favoriteId) {
          loadFavoriteStream(favoriteId);
        }
      } else if (target.classList.contains('edit-favorite-btn')) {
        const favoriteId = target.getAttribute('data-favorite-id');
        if (favoriteId) {
          enterEditMode(favoriteId);
        }
      } else if (target.classList.contains('save-favorite-btn')) {
        const favoriteId = target.getAttribute('data-favorite-id');
        if (favoriteId) {
          saveFavoriteEdit(favoriteId);
        }
      } else if (target.classList.contains('cancel-edit-btn')) {
        const favoriteId = target.getAttribute('data-favorite-id');
        if (favoriteId) {
          cancelEditMode(favoriteId);
        }
      } else if (target.classList.contains('remove-favorite-btn')) {
        const favoriteId = target.getAttribute('data-favorite-id');
        if (favoriteId) {
          removeFavoriteStream(favoriteId);
        }
      }
    });
  }
  
  // 分類管理事件
  const categoryList = manager.querySelector('.category-list');
  if (categoryList) {
    categoryList.addEventListener('click', (e) => {
      const target = e.target;
      if (target.classList.contains('load-category-btn')) {
        const categoryId = target.getAttribute('data-category-id');
        if (categoryId) {
          loadCategoryFavorites(categoryId);
        }
      } else if (target.classList.contains('edit-category-btn')) {
        const categoryId = target.getAttribute('data-category-id');
        if (categoryId) {
          editCategory(categoryId);
        }
      } else if (target.classList.contains('remove-category-btn')) {
        const categoryId = target.getAttribute('data-category-id');
        if (categoryId) {
          removeCategory(categoryId);
        }
      }
    });
  }
  
  // 按Enter添加收藏
  const urlInput = document.getElementById('favorite-url-input');
  if (urlInput) {
    // Enter 鍵添加收藏
    urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addToFavorites();
      }
    });
    
    // 初始化收藏管理的搜尋功能
    initFavoriteSearchSuggestions();
  }
  
  // 按Enter添加分類
  const categoryNameInput = document.getElementById('category-name-input');
  if (categoryNameInput) {
    categoryNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addCategory();
      }
    });
  }
  
  // 編輯模式中按Enter保存，按Esc取消
  const favoriteListForKeyboard = manager.querySelector('.favorite-list');
  if (favoriteListForKeyboard) {
    favoriteListForKeyboard.addEventListener('keydown', (e) => {
      const target = e.target;
      if (target.classList.contains('favorite-edit-name') || target.classList.contains('favorite-edit-category')) {
        const favoriteItem = target.closest('.favorite-item');
        if (favoriteItem) {
          const favoriteId = favoriteItem.getAttribute('data-id');
          if (e.key === 'Enter') {
            e.preventDefault();
            if (favoriteId) {
              saveFavoriteEdit(favoriteId);
            }
          } else if (e.key === 'Escape') {
            e.preventDefault();
            if (favoriteId) {
              cancelEditMode(favoriteId);
            }
          }
        }
      }
    });
  }
}

// 關閉收藏管理界面
function closeFavoriteStreamsManager() {
  const manager = document.getElementById('favorite-streams-manager');
  if (manager) {
    manager.classList.remove('show');
  }
}

// 添加到收藏
function addToFavorites() {
  const urlInput = document.getElementById('favorite-url-input');
  const nameInput = document.getElementById('favorite-name-input');
  const categorySelect = document.getElementById('favorite-category-select');
  
  const i18n = window.i18n || { t: (key) => key };
  if (!urlInput || !urlInput.value.trim()) {
    showSaveMessage(i18n.t('pleaseEnterStreamUrl'));
    return;
  }
  
  const url = urlInput.value.trim();
  const name = nameInput ? nameInput.value.trim() : '';
  const categoryId = categorySelect && categorySelect.value ? categorySelect.value : null;
  
  const result = favoriteStreams.add(url, name, categoryId);
  
  if (result.success) {
    urlInput.value = '';
    if (nameInput) nameInput.value = '';
    if (categorySelect) categorySelect.value = '';
    showFavoriteStreamsManager(); // 刷新列表
    // 更新控制面板中的收藏列表
    if (typeof updateFavoriteListDisplay === 'function') {
      updateFavoriteListDisplay();
    }
    // 如果是 YouTube 頻道，立即觸發一次開台狀態檢查（不等待間隔）
    const list = favoriteStreams.getList();
    const addedItem = list.find(item => (item.url === url || item.url.includes(url.split('?')[0])) && item.platform === 'youtube');
    if (addedItem && addedItem.platform === 'youtube' && addedItem.channelId) {
      // 立即檢查一次開台狀態（不等待 15 分鐘間隔）
      setTimeout(async () => {
        if (window.youtubeApi && typeof window.youtubeApi.checkChannelLiveStatus === 'function') {
          const youtubeConfig = window.youtubeApi.getConfig();
          if (!youtubeConfig.isBlocked) {
            try {
              const liveStatus = await window.youtubeApi.checkChannelLiveStatus(addedItem.channelId);
              const updatedList = favoriteStreams.getList().map(item => {
                if (item.id === addedItem.id && item.platform === 'youtube') {
                  return {
                    ...item,
                    isLive: liveStatus ? liveStatus.isLive : null,
                    lastChecked: new Date().toISOString(),
                    viewerCount: liveStatus && liveStatus.viewerCount ? liveStatus.viewerCount : null,
                    liveTitle: liveStatus && liveStatus.title ? liveStatus.title : null,
                    liveVideoId: liveStatus && liveStatus.videoId ? liveStatus.videoId : null
                  };
                }
                return item;
              });
              favoriteStreams.saveList(updatedList);
              if (typeof updateFavoriteListDisplay === 'function') {
                updateFavoriteListDisplay();
              }
            } catch (error) {
              console.error('立即檢查 YouTube 開台狀態失敗:', error);
            }
          }
        }
      }, 1000); // 延遲 1 秒後檢查，確保列表已更新
    }
    // 自動保存設置
    autoSaveSettings();
    // 防抖備份會在 saveList() 中自動觸發
    showSaveMessage(i18n.t('dataSaved'));
  } else {
    // 嘗試翻譯錯誤訊息
    const errorMessages = {
      '此串流已在收藏列表中': i18n.t('streamAlreadyInFavorites'),
      '無法解析串流網址': i18n.t('cannotParseStreamUrl'),
      '收藏不存在': i18n.t('favoriteNotFound'),
      '收藏已更新': i18n.t('favoriteUpdated'),
      '已移除收藏': i18n.t('favoriteRemoved'),
      '無效的收藏項目': i18n.t('invalidFavoriteItem'),
      '沒有可加載的收藏': i18n.t('noFavoritesToLoad'),
      '分類不存在': i18n.t('categoryNotFound'),
      '此分類名稱已存在': i18n.t('categoryExists'),
      '分類已添加': i18n.t('categoryAdded'),
      '分類已更新': i18n.t('categoryUpdated'),
      '分類已移除': i18n.t('categoryRemoved')
    };
    const translatedMessage = errorMessages[result.message] || result.message;
    showSaveMessage(translatedMessage);
  }
}

// 添加分類
function addCategory() {
  const nameInput = document.getElementById('category-name-input');
  
  const i18n = window.i18n || { t: (key) => key };
  if (!nameInput || !nameInput.value.trim()) {
    showSaveMessage(i18n.t('pleaseEnterCategoryName'));
    return;
  }
  
  const name = nameInput.value.trim();
  const result = favoriteCategories.add(name);
  
  if (result.success) {
    nameInput.value = '';
    showFavoriteStreamsManager(); // 刷新列表
    // 更新控制面板中的收藏列表
    if (typeof updateFavoriteListDisplay === 'function') {
      updateFavoriteListDisplay();
    }
    autoSaveSettings();
    // 防抖備份會在 saveList() 中自動觸發
    showSaveMessage(i18n.t('dataSaved'));
  } else {
    // 嘗試翻譯錯誤訊息
    const errorMessages = {
      '此串流已在收藏列表中': i18n.t('streamAlreadyInFavorites'),
      '無法解析串流網址': i18n.t('cannotParseStreamUrl'),
      '收藏不存在': i18n.t('favoriteNotFound'),
      '收藏已更新': i18n.t('favoriteUpdated'),
      '已移除收藏': i18n.t('favoriteRemoved'),
      '無效的收藏項目': i18n.t('invalidFavoriteItem'),
      '沒有可加載的收藏': i18n.t('noFavoritesToLoad'),
      '分類不存在': i18n.t('categoryNotFound'),
      '此分類名稱已存在': i18n.t('categoryExists'),
      '分類已添加': i18n.t('categoryAdded'),
      '分類已更新': i18n.t('categoryUpdated'),
      '分類已移除': i18n.t('categoryRemoved')
    };
    const translatedMessage = errorMessages[result.message] || result.message;
    showSaveMessage(translatedMessage);
  }
}

// 編輯分類
function editCategory(categoryId) {
  const categories = favoriteCategories.getList();
  const category = categories.find(c => c.id === categoryId);
  
  if (!category) {
    const i18n = window.i18n || { t: (key) => key };
    showSaveMessage(i18n.t('categoryNotFound'));
    return;
  }
  
  // 進入編輯模式
  const categoryItem = document.querySelector(`.category-item[data-id="${categoryId}"]`);
  if (categoryItem) {
    const infoDiv = categoryItem.querySelector('.category-item-info');
    const actionsDiv = categoryItem.querySelector('.category-item-actions');
    
    if (infoDiv && actionsDiv) {
      const nameSpan = infoDiv.querySelector('.category-item-name');
      if (nameSpan) {
        const currentName = nameSpan.textContent.replace('📁 ', '');
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.style.cssText = 'padding: 4px; background: #2a2a2a; border: 1px solid #444; color: #fff; border-radius: 4px; font-size: 13px; width: 200px;';
        input.onblur = () => {
          const newName = input.value.trim();
          if (newName && newName !== currentName) {
            const result = favoriteCategories.update(categoryId, newName);
            if (result.success) {
              showFavoriteStreamsManager();
              // 更新控制面板中的收藏列表
              if (typeof updateFavoriteListDisplay === 'function') {
                updateFavoriteListDisplay();
              }
              autoSaveSettings();
              // 防抖備份會在 saveList() 中自動觸發
              showSaveMessage('資料已儲存');
            } else {
              showSaveMessage(result.message);
            }
          } else {
            showFavoriteStreamsManager();
          }
        };
        input.onkeydown = (e) => {
          if (e.key === 'Enter') {
            input.blur();
          } else if (e.key === 'Escape') {
            showFavoriteStreamsManager();
          }
        };
        nameSpan.replaceWith(input);
        input.focus();
        input.select();
      }
    }
  }
}

// 刪除分類
function removeCategory(categoryId) {
  const result = favoriteCategories.remove(categoryId);
  
  if (result.success) {
    showFavoriteStreamsManager(); // 刷新列表
    autoSaveSettings();
    // 防抖備份會在 saveList() 中自動觸發
    showSaveMessage(i18n.t('dataSaved'));
  } else {
    // 嘗試翻譯錯誤訊息
    const errorMessages = {
      '此串流已在收藏列表中': i18n.t('streamAlreadyInFavorites'),
      '無法解析串流網址': i18n.t('cannotParseStreamUrl'),
      '收藏不存在': i18n.t('favoriteNotFound'),
      '收藏已更新': i18n.t('favoriteUpdated'),
      '已移除收藏': i18n.t('favoriteRemoved'),
      '無效的收藏項目': i18n.t('invalidFavoriteItem'),
      '沒有可加載的收藏': i18n.t('noFavoritesToLoad'),
      '分類不存在': i18n.t('categoryNotFound'),
      '此分類名稱已存在': i18n.t('categoryExists'),
      '分類已添加': i18n.t('categoryAdded'),
      '分類已更新': i18n.t('categoryUpdated'),
      '分類已移除': i18n.t('categoryRemoved')
    };
    const translatedMessage = errorMessages[result.message] || result.message;
    showSaveMessage(translatedMessage);
  }
}

// 進入編輯模式
function enterEditMode(favoriteId) {
  const favoriteItem = document.querySelector(`.favorite-item[data-id="${favoriteId}"]`);
  if (!favoriteItem) return;
  
  // 隱藏顯示模式，顯示編輯模式
  const infoDiv = favoriteItem.querySelector('.favorite-item-info');
  const actionsDiv = favoriteItem.querySelector('.favorite-item-actions');
  const editDiv = favoriteItem.querySelector('.favorite-item-edit');
  
  if (infoDiv) infoDiv.style.display = 'none';
  if (actionsDiv) actionsDiv.style.display = 'none';
  if (editDiv) editDiv.style.display = 'flex';
  
  // 聚焦到名稱輸入框
  const nameInput = favoriteItem.querySelector('.favorite-edit-name');
  if (nameInput) {
    setTimeout(() => {
      nameInput.focus();
      nameInput.select();
    }, 50);
  }
}

// 取消編輯模式
function cancelEditMode(favoriteId) {
  const favoriteItem = document.querySelector(`.favorite-item[data-id="${favoriteId}"]`);
  if (!favoriteItem) return;
  
  // 顯示顯示模式，隱藏編輯模式
  const infoDiv = favoriteItem.querySelector('.favorite-item-info');
  const actionsDiv = favoriteItem.querySelector('.favorite-item-actions');
  const editDiv = favoriteItem.querySelector('.favorite-item-edit');
  
  if (infoDiv) infoDiv.style.display = 'flex';
  if (actionsDiv) actionsDiv.style.display = 'flex';
  if (editDiv) editDiv.style.display = 'none';
}

// 保存編輯
function saveFavoriteEdit(favoriteId) {
  const favoriteItem = document.querySelector(`.favorite-item[data-id="${favoriteId}"]`);
  if (!favoriteItem) return;
  
  const nameInput = favoriteItem.querySelector('.favorite-edit-name');
  const categorySelect = favoriteItem.querySelector('.favorite-edit-category');
  
  if (!nameInput) return;
  
  const newName = nameInput.value.trim();
  if (!newName) {
    const i18n = window.i18n || { t: (key) => key };
    showSaveMessage(i18n.t('favoriteNameCannotBeEmpty'));
    return;
  }
  
  const categoryId = categorySelect && categorySelect.value ? categorySelect.value : null;
  
  const updates = {
    name: newName,
    categoryId: categoryId
  };
  
  const result = favoriteStreams.update(favoriteId, updates);
  
  if (result.success) {
    // 刷新列表以顯示更新後的值
    showFavoriteStreamsManager();
    // 更新控制面板中的收藏列表
    if (typeof updateFavoriteListDisplay === 'function') {
      updateFavoriteListDisplay();
    }
    autoSaveSettings();
    // 防抖備份會在 saveList() 中自動觸發
    showSaveMessage(i18n.t('dataSaved'));
  } else {
    // 嘗試翻譯錯誤訊息
    const errorMessages = {
      '此串流已在收藏列表中': i18n.t('streamAlreadyInFavorites'),
      '無法解析串流網址': i18n.t('cannotParseStreamUrl'),
      '收藏不存在': i18n.t('favoriteNotFound'),
      '收藏已更新': i18n.t('favoriteUpdated'),
      '已移除收藏': i18n.t('favoriteRemoved'),
      '無效的收藏項目': i18n.t('invalidFavoriteItem'),
      '沒有可加載的收藏': i18n.t('noFavoritesToLoad'),
      '分類不存在': i18n.t('categoryNotFound'),
      '此分類名稱已存在': i18n.t('categoryExists'),
      '分類已添加': i18n.t('categoryAdded'),
      '分類已更新': i18n.t('categoryUpdated'),
      '分類已移除': i18n.t('categoryRemoved')
    };
    const translatedMessage = errorMessages[result.message] || result.message;
    showSaveMessage(translatedMessage);
  }
}

// 全選收藏
function selectAllFavorites() {
  const checkboxes = document.querySelectorAll('.favorite-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = true;
  });
}

// 取消全選收藏
function deselectAllFavorites() {
  const checkboxes = document.querySelectorAll('.favorite-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = false;
  });
}

// 載入選中的收藏
function loadSelectedFavorites() {
  const checkboxes = document.querySelectorAll('.favorite-checkbox:checked');
  if (checkboxes.length === 0) {
    const i18n = window.i18n || { t: (key) => key };
    showSaveMessage(i18n.t('pleaseSelectAtLeastOneFavorite'));
    return;
  }
  
  const list = favoriteStreams.getList();
  const selectedItems = [];
  
  checkboxes.forEach(cb => {
    const favoriteId = cb.getAttribute('data-favorite-id');
    const item = list.find(fav => fav.id === favoriteId);
    if (item) {
      selectedItems.push(item);
    }
  });
  
  if (selectedItems.length > 0) {
    const result = favoriteStreams.loadMultiple(selectedItems);
    if (result.success) {
      showSaveMessage(result.message);
      setTimeout(() => {
        closeFavoriteStreamsManager();
      }, 1000);
    }
  }
}

// 載入分類下的所有收藏
function loadCategoryFavorites(categoryId) {
  const list = favoriteStreams.getList();
  const categoryItems = list.filter(item => item.categoryId === categoryId);
  
  if (categoryItems.length === 0) {
    const i18n = window.i18n || { t: (key) => key };
    showSaveMessage(i18n.t('noFavoritesInCategory'));
    return;
  }
  
  const result = favoriteStreams.loadMultiple(categoryItems);
  if (result.success) {
    showSaveMessage(result.message);
    setTimeout(() => {
      closeFavoriteStreamsManager();
    }, 1000);
  }
}

// 載入收藏的串流
function loadFavoriteStream(id) {
  const list = favoriteStreams.getList();
  const item = list.find(fav => fav.id === id);
  
  if (item) {
    favoriteStreams.load(item);
    closeFavoriteStreamsManager();
  }
}

// 移除收藏
function removeFavoriteStream(id) {
  favoriteStreams.remove(id);
  showFavoriteStreamsManager(); // 刷新列表
  // 更新控制面板中的收藏列表
  if (typeof updateFavoriteListDisplay === 'function') {
    updateFavoriteListDisplay();
  }
  // 自動保存設置
  autoSaveSettings();
  // 防抖備份會在 saveList() 中自動觸發
  showSaveMessage('資料已儲存');
}

// 更新控制面板中的收藏列表顯示
function updateFavoriteListDisplay() {
  const list = favoriteStreams.getList();
  const categories = favoriteCategories.getList();
  const filterSelect = document.getElementById('favorite-display-filter');
  const displayDiv = document.getElementById('favorite-list-display');
  const i18n = window.i18n || { t: (key) => key };
  
  if (!displayDiv) {
    // 收藏列表顯示區域未找到
    return;
  }
  
  // 獲取當前選擇的過濾器
  const filterValue = filterSelect ? filterSelect.value : 'all';
  
  // 更新下拉選單（添加分類選項）
  if (filterSelect) {
    // 保存當前選擇
    const currentValue = filterSelect.value;
    
    // 清空並重新填充選項
    filterSelect.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = i18n.t('allFavorites');
    filterSelect.appendChild(allOption);
    const uncatOption = document.createElement('option');
    uncatOption.value = 'uncategorized';
    uncatOption.textContent = i18n.t('uncategorized');
    filterSelect.appendChild(uncatOption);
    
    // 添加分類選項
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = `📁 ${cat.name}`;
      filterSelect.appendChild(option);
    });
    
    // 恢復選擇
    filterSelect.value = currentValue;
  }
  
  // 如果選擇了分類，顯示分類標題和分類中的收藏項目
  if (filterValue && filterValue !== 'all' && filterValue !== 'uncategorized') {
    const category = categories.find(c => c.id === filterValue);
    let categoryItems = list.filter(item => item.categoryId === filterValue);
    
    // 根據開台狀態排序分類中的收藏項目
    categoryItems.sort((a, b) => {
      const aIsLive = a.isLive === true;
      const bIsLive = b.isLive === true;
      
      if (aIsLive && !bIsLive) {
        return -1;
      }
      if (!aIsLive && bIsLive) {
        return 1;
      }
      
      if (aIsLive && bIsLive) {
        const aViewers = a.viewerCount || 0;
        const bViewers = b.viewerCount || 0;
        return bViewers - aViewers;
      }
      
      const aName = (a.name || (a.platform === 'twitch' ? a.channelId : a.videoId) || '').toLowerCase();
      const bName = (b.name || (b.platform === 'twitch' ? b.channelId : b.videoId) || '').toLowerCase();
      return aName.localeCompare(bName);
    });
    
    displayDiv.innerHTML = '';
    
    // 創建分類標題區域
    const categoryHeader = document.createElement('div');
    categoryHeader.style.cssText = 'padding: 12px; background: rgba(145, 71, 255, 0.15); border-radius: 4px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;';
    
    const categoryNameDiv = document.createElement('div');
    categoryNameDiv.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    
    const categoryIcon = document.createElement('span');
    categoryIcon.textContent = '📁';
    categoryIcon.style.fontSize = '16px';
    
    const categoryName = document.createElement('span');
    categoryName.style.cssText = 'font-size: 14px; color: #fff; font-weight: bold;';
    categoryName.textContent = category ? escapeHtml(category.name) : i18n.t('unknownCategory');
    
    const categoryCount = document.createElement('span');
    categoryCount.style.cssText = 'font-size: 11px; color: #aaa;';
    categoryCount.textContent = `(${categoryItems.length})`;
    
    categoryNameDiv.appendChild(categoryIcon);
    categoryNameDiv.appendChild(categoryName);
    categoryNameDiv.appendChild(categoryCount);
    
    // 一鍵載入按鈕
    const loadBtn = document.createElement('button');
    loadBtn.style.cssText = 'padding: 6px 12px; background: #9147ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;';
    loadBtn.textContent = '▶ 載入全部';
    loadBtn.onclick = () => loadCategoryFavoritesFromPanel(filterValue);
    
    categoryHeader.appendChild(categoryNameDiv);
    categoryHeader.appendChild(loadBtn);
    displayDiv.appendChild(categoryHeader);
    
    // 如果分類中沒有收藏，顯示提示
    if (categoryItems.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.cssText = 'padding: 20px; text-align: center; color: #888; font-size: 12px;';
      emptyDiv.textContent = i18n.t('noFavoritesInCategory');
      displayDiv.appendChild(emptyDiv);
      return;
    }
    
    // 顯示分類中的收藏項目
    const listContainer = document.createElement('div');
    listContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    
    categoryItems.forEach((item) => {
      const displayName = item.name || (item.platform === 'twitch' ? item.channelId : item.videoId);
      const platformIcon = item.platform === 'twitch' ? '🎮' : '📺';
      const itemId = item.id;
      
      const itemDiv = document.createElement('div');
      itemDiv.className = 'favorite-list-item';
      itemDiv.dataset.favoriteId = itemId;
      itemDiv.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 6px; background: rgba(255, 255, 255, 0.05); border-radius: 4px; cursor: pointer; transition: background 0.2s;';
      itemDiv.onmouseover = () => itemDiv.style.background = 'rgba(145, 71, 255, 0.2)';
      itemDiv.onmouseout = () => itemDiv.style.background = 'rgba(255, 255, 255, 0.05)';
      itemDiv.onclick = () => loadFavoriteStreamFromPanel(itemId);
      
      const iconSpan = document.createElement('span');
      iconSpan.style.fontSize = '14px';
      iconSpan.textContent = platformIcon;
      
      // 開台狀態指示器（Twitch 和 YouTube 頻道）
      const liveIndicator = document.createElement('span');
      // 檢查是否有 channelId（對於 YouTube，必須有 channelId 才能檢查開台狀態）
      const hasChannelId = item.channelId && item.channelId.trim() !== '';
      if ((item.platform === 'twitch' || item.platform === 'youtube') && hasChannelId) {
        if (item.isLive === true) {
          liveIndicator.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: #00ff00; flex-shrink: 0; box-shadow: 0 0 4px #00ff00;';
          // 對於 YouTube，不顯示觀看人數；對於 Twitch，顯示觀看人數
          if (item.platform === 'twitch' && item.viewerCount) {
            liveIndicator.title = `正在直播 • ${item.viewerCount.toLocaleString()} 觀看者`;
          } else {
            liveIndicator.title = '正在直播';
          }
        } else if (item.isLive === false) {
          liveIndicator.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: #666; flex-shrink: 0;';
          liveIndicator.title = '未開台';
        } else {
          // isLive 為 null 或 undefined，顯示灰色（狀態未知）
          liveIndicator.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: #444; flex-shrink: 0;';
          liveIndicator.title = '狀態未知';
        }
      } else {
        // 沒有 channelId 或不是支持的平台，不顯示指示器
        liveIndicator.style.display = 'none';
      }
      
      const contentDiv = document.createElement('div');
      contentDiv.style.cssText = 'flex: 1; min-width: 0;';
      
      const nameDiv = document.createElement('div');
      nameDiv.style.cssText = 'font-size: 14px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px;';
      
      const nameText = document.createElement('span');
      nameText.textContent = escapeHtml(displayName);
      nameDiv.appendChild(nameText);
      
      // 如果正在直播，只對 Twitch 顯示觀看人數（YouTube 不顯示）
      if (item.isLive === true && item.platform === 'twitch' && item.viewerCount !== null && item.viewerCount !== undefined) {
        const viewerCount = document.createElement('span');
        viewerCount.style.cssText = 'font-size: 10px; color: #00ff00; font-weight: bold;';
        viewerCount.textContent = `👁 ${item.viewerCount.toLocaleString()}`;
        nameDiv.appendChild(viewerCount);
      }
      
      contentDiv.appendChild(nameDiv);
      
      const arrowSpan = document.createElement('span');
      arrowSpan.style.cssText = 'font-size: 12px; color: #9147ff;';
      arrowSpan.textContent = '▶';
      
      // 統一順序：iconSpan -> liveIndicator -> contentDiv -> arrowSpan
      itemDiv.appendChild(iconSpan);
      itemDiv.appendChild(liveIndicator);
      itemDiv.appendChild(contentDiv);
      itemDiv.appendChild(arrowSpan);
      
      listContainer.appendChild(itemDiv);
    });
    
    displayDiv.appendChild(listContainer);
    return;
  }
  
  // 過濾收藏列表（全部或未分類）
  let filteredList = list;
  if (filterValue === 'uncategorized') {
    filteredList = list.filter(item => !item.categoryId);
  }
  
  // 根據開台狀態排序：優先顯示開台的頻道
  filteredList.sort((a, b) => {
    // 首先按開台狀態排序：開台的排在前面
    const aIsLive = a.isLive === true;
    const bIsLive = b.isLive === true;
    
    if (aIsLive && !bIsLive) {
      return -1; // a 開台，b 未開台，a 排在前面
    }
    if (!aIsLive && bIsLive) {
      return 1; // a 未開台，b 開台，b 排在前面
    }
    
    // 如果都是開台狀態，按觀看人數降序排列
    if (aIsLive && bIsLive) {
      const aViewers = a.viewerCount || 0;
      const bViewers = b.viewerCount || 0;
      return bViewers - aViewers; // 觀看人數多的排在前面
    }
    
    // 如果都未開台，保持原有順序（或按名稱排序）
    // 可以選擇按名稱排序或保持原順序
    const aName = (a.name || (a.platform === 'twitch' ? a.channelId : a.videoId) || '').toLowerCase();
    const bName = (b.name || (b.platform === 'twitch' ? b.channelId : b.videoId) || '').toLowerCase();
    return aName.localeCompare(bName);
  });
  
  // 生成列表（使用安全的 DOM 操作）
  displayDiv.innerHTML = '';
  
  if (filteredList.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.cssText = 'padding: 20px; text-align: center; color: #888; font-size: 12px;';
    emptyDiv.textContent = i18n.t('noFavorites');
    displayDiv.appendChild(emptyDiv);
    return;
  }
  
  const listContainer = document.createElement('div');
  listContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
  
  filteredList.forEach((item) => {
    const displayName = item.name || (item.platform === 'twitch' ? item.channelId : item.videoId);
    const platformIcon = item.platform === 'twitch' ? '🎮' : '📺';
    const categoryName = item.categoryId ? categories.find(c => c.id === item.categoryId)?.name || i18n.t('unknownCategory') : i18n.t('uncategorized');
    const itemId = item.id;
    
    const itemDiv = document.createElement('div');
    itemDiv.className = 'favorite-list-item';
    itemDiv.dataset.favoriteId = itemId;
    itemDiv.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 6px; background: rgba(255, 255, 255, 0.05); border-radius: 4px; cursor: pointer; transition: background 0.2s;';
    itemDiv.onmouseover = () => itemDiv.style.background = 'rgba(145, 71, 255, 0.2)';
    itemDiv.onmouseout = () => itemDiv.style.background = 'rgba(255, 255, 255, 0.05)';
    itemDiv.onclick = () => loadFavoriteStreamFromPanel(itemId);
    
    const iconSpan = document.createElement('span');
    iconSpan.style.fontSize = '14px';
    iconSpan.textContent = platformIcon;
    
    // 開台狀態指示器（Twitch 和 YouTube 頻道）
    const liveIndicator = document.createElement('span');
    // 檢查是否有 channelId（對於 YouTube，必須有 channelId 才能檢查開台狀態）
    const hasChannelId = item.channelId && item.channelId.trim() !== '';
    if ((item.platform === 'twitch' || item.platform === 'youtube') && hasChannelId) {
      if (item.isLive === true) {
        liveIndicator.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: #00ff00; flex-shrink: 0; box-shadow: 0 0 4px #00ff00;';
        // 對於 YouTube，不顯示觀看人數；對於 Twitch，顯示觀看人數
        if (item.platform === 'twitch' && item.viewerCount) {
          liveIndicator.title = `正在直播 • ${item.viewerCount.toLocaleString()} 觀看者`;
        } else {
          liveIndicator.title = '正在直播';
        }
      } else if (item.isLive === false) {
        liveIndicator.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: #666; flex-shrink: 0;';
        liveIndicator.title = '未開台';
      } else {
        // isLive 為 null 或 undefined，顯示灰色（狀態未知）
        liveIndicator.style.cssText = 'width: 8px; height: 8px; border-radius: 50%; background: #444; flex-shrink: 0;';
        liveIndicator.title = '狀態未知';
      }
    } else {
      // 沒有 channelId 或不是支持的平台，不顯示指示器
      liveIndicator.style.display = 'none';
    }
    
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'flex: 1; min-width: 0;';
    
    const nameDiv = document.createElement('div');
    nameDiv.style.cssText = 'font-size: 14px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px;';
    
    const nameText = document.createElement('span');
    nameText.textContent = escapeHtml(displayName);
    nameDiv.appendChild(nameText);
    
    // 如果正在直播，只對 Twitch 顯示觀看人數（YouTube 不顯示）
    if (item.isLive === true && item.platform === 'twitch' && item.viewerCount !== null && item.viewerCount !== undefined) {
      const viewerCount = document.createElement('span');
      viewerCount.style.cssText = 'font-size: 10px; color: #00ff00; font-weight: bold;';
      viewerCount.textContent = `👁 ${item.viewerCount.toLocaleString()}`;
      nameDiv.appendChild(viewerCount);
    }
    
    const categoryDiv = document.createElement('div');
    categoryDiv.style.cssText = 'font-size: 10px; color: #aaa;';
    categoryDiv.textContent = '📁 ' + escapeHtml(categoryName);
    
    contentDiv.appendChild(nameDiv);
    contentDiv.appendChild(categoryDiv);
    
    const arrowSpan = document.createElement('span');
    arrowSpan.style.cssText = 'font-size: 12px; color: #9147ff;';
    arrowSpan.textContent = '▶';
    
    // 統一順序：iconSpan -> liveIndicator -> contentDiv -> arrowSpan
    itemDiv.appendChild(iconSpan);
    itemDiv.appendChild(liveIndicator);
    itemDiv.appendChild(contentDiv);
    itemDiv.appendChild(arrowSpan);
    
    listContainer.appendChild(itemDiv);
  });
  
  displayDiv.appendChild(listContainer);
}

// 批量更新收藏頻道的開台狀態
async function updateFavoriteLiveStatuses() {
  const list = favoriteStreams.getList();
  const twitchFavorites = list.filter(item => item.platform === 'twitch' && item.channelId);
  const youtubeFavorites = list.filter(item => item.platform === 'youtube' && item.channelId);
  
  let updatedCount = 0;
  let updatedList = [...list];
  
  // 處理 Twitch 收藏
  if (twitchFavorites.length > 0 && window.twitchApi && window.twitchApi.checkMultipleChannelsLiveStatus) {
    try {
      // 收集所有 Twitch 頻道 ID
      const channelLogins = twitchFavorites.map(item => item.channelId.toLowerCase());
      
      // 批量查詢開台狀態
      const liveStatuses = await window.twitchApi.checkMultipleChannelsLiveStatus(channelLogins);
      
      // 更新收藏列表中的開台狀態
      updatedList = updatedList.map(item => {
        if (item.platform === 'twitch' && item.channelId) {
          const login = item.channelId.toLowerCase();
          const status = liveStatuses[login];
          
          if (status) {
            updatedCount++;
            return {
              ...item,
              isLive: status.isLive,
              lastChecked: new Date().toISOString(),
              viewerCount: status.viewerCount || null,
              liveTitle: status.title || null,
              gameName: status.gameName || null
            };
          } else {
            // 如果查詢失敗，保持原有狀態，但更新檢查時間
            return {
              ...item,
              lastChecked: new Date().toISOString()
            };
          }
        }
        return item;
      });
    } catch (error) {
      // Twitch API 錯誤，繼續處理 YouTube
    }
  }
  
  // YouTube API 功能已暫時關閉，跳過檢查
  // 處理 YouTube 收藏（檢查是否被封鎖，並且距離上次檢查已超過 15 分鐘）
  const now = Date.now();
  // const shouldCheckYouTube = now - lastYouTubeCheckTime >= YOUTUBE_CHECK_INTERVAL_MS;
  
  // YouTube API 功能已暫時關閉
  if (youtubeFavorites.length > 0) {
    // YouTube API 功能已暫時關閉，跳過開台狀態檢查
  }
  
  // 保存更新後的列表（只要有更新或檢查過，就保存）
  if (updatedCount > 0 || twitchFavorites.length > 0 || youtubeFavorites.length > 0) {
    favoriteStreams.saveList(updatedList);
    
    // 更新顯示（無論是否有更新，都刷新顯示，確保狀態正確顯示）
    if (typeof updateFavoriteListDisplay === 'function') {
      updateFavoriteListDisplay();
    }
  }
  
  return { success: true, updated: updatedCount };
}

// 定期自動刷新開台狀態的定時器
let favoriteLiveStatusInterval = null;
let youtubeCheckInterval = null;
let lastYouTubeCheckTime = 0;
const YOUTUBE_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 分鐘（較長間隔以避免流量過度使用）

// 啟動定期自動刷新
// Twitch: 預設每 5 分鐘
// YouTube: 每 15 分鐘（較長間隔以避免流量過度使用）
function startFavoriteLiveStatusAutoRefresh(intervalMinutes = 5) {
  // 清除現有的定時器
  if (favoriteLiveStatusInterval) {
    clearInterval(favoriteLiveStatusInterval);
  }
  if (youtubeCheckInterval) {
    clearInterval(youtubeCheckInterval);
  }
  
  // 立即執行一次
  updateFavoriteLiveStatuses();
  
  // 設定定期刷新（主要用於 Twitch）
  const intervalMs = intervalMinutes * 60 * 1000;
  favoriteLiveStatusInterval = setInterval(() => {
    updateFavoriteLiveStatuses();
  }, intervalMs);
  
  // 為 YouTube 設定較長的檢查間隔
  youtubeCheckInterval = setInterval(() => {
    const now = Date.now();
    // 如果距離上次 YouTube 檢查已經超過 15 分鐘，執行檢查
    if (now - lastYouTubeCheckTime >= YOUTUBE_CHECK_INTERVAL_MS) {
      lastYouTubeCheckTime = now;
      updateFavoriteLiveStatuses();
    }
  }, YOUTUBE_CHECK_INTERVAL_MS);
  
  // 保存設定到 localStorage
  localStorage.setItem('favoriteLiveStatusAutoRefresh', 'true');
  localStorage.setItem('favoriteLiveStatusAutoRefreshInterval', intervalMinutes.toString());
}

// 停止定期自動刷新
function stopFavoriteLiveStatusAutoRefresh() {
  if (favoriteLiveStatusInterval) {
    clearInterval(favoriteLiveStatusInterval);
    favoriteLiveStatusInterval = null;
  }
  if (youtubeCheckInterval) {
    clearInterval(youtubeCheckInterval);
    youtubeCheckInterval = null;
  }
  lastYouTubeCheckTime = 0;
  localStorage.setItem('favoriteLiveStatusAutoRefresh', 'false');
}

// 確保函數是全局的
if (typeof window !== 'undefined') {
  window.updateFavoriteListDisplay = updateFavoriteListDisplay;
  window.updateFavoriteLiveStatuses = updateFavoriteLiveStatuses;
  window.startFavoriteLiveStatusAutoRefresh = startFavoriteLiveStatusAutoRefresh;
  window.stopFavoriteLiveStatusAutoRefresh = stopFavoriteLiveStatusAutoRefresh;
}

// 從控制面板一鍵載入分類下的所有收藏
function loadCategoryFavoritesFromPanel(categoryId) {
  loadCategoryFavorites(categoryId);
}

// 從控制面板載入收藏串流
function loadFavoriteStreamFromPanel(id) {
  loadFavoriteStream(id);
}

// 收藏當前所有串流
function addCurrentStreamToFavorites() {
  const boxes = document.querySelectorAll('.stream-box');
  if (boxes.length === 0) {
    const i18n = window.i18n || { t: (key) => key };
    showSaveMessage(i18n.t('noStreamsToFavorite'));
    return;
  }
  
  let addedCount = 0;
  let skippedCount = 0;
  
  // 使用延遲確保每個收藏項都有唯一的時間戳
  boxes.forEach((box, index) => {
    setTimeout(() => {
      const id = parseInt(box.dataset.streamId);
      const data = streamData[id];
      if (data && data.originalUrl) {
        // 為每個串流生成自訂名稱（如果可能）
        let customName = '';
        if (data.platform === 'twitch' && data.channelId) {
          customName = data.channelId;
        } else if (data.platform === 'youtube' && data.videoId) {
          customName = data.videoId;
        }
        
        const result = favoriteStreams.add(data.originalUrl, customName, null);
        if (result.success) {
          addedCount++;
        } else {
          skippedCount++;
        }
        
        // 最後一個串流處理完後顯示結果
        if (index === boxes.length - 1) {
          setTimeout(() => {
            if (addedCount > 0) {
              showFavoriteStreamsManager(); // 顯示管理界面
              // 更新控制面板中的收藏列表
              if (typeof updateFavoriteListDisplay === 'function') {
                updateFavoriteListDisplay();
              }
              // 自動保存設置
              autoSaveSettings();
              // 防抖備份會在 saveList() 中自動觸發
              const i18n = window.i18n || { t: (key) => key };
              showSaveMessage(`${i18n.t('successfullyFavorited')} ${addedCount} ${i18n.t('streams')}${skippedCount > 0 ? `，${skippedCount} ${i18n.t('alreadyExists')}` : ''}`);
            } else if (skippedCount > 0) {
              const i18n = window.i18n || { t: (key) => key };
              showSaveMessage(i18n.t('allStreamsAlreadyInFavorites'));
            }
          }, 100);
        }
      }
    }, index * 10); // 每個串流間隔10毫秒，確保唯一時間戳
  });
}

// 自動保存設置（在設置改變時調用）
function autoSaveSettings() {
  // 使用防抖，避免頻繁保存
  if (window.settingsSaveTimeout) {
    clearTimeout(window.settingsSaveTimeout);
  }
  
  window.settingsSaveTimeout = setTimeout(() => {
    saveUserSettings();
  }, 1000); // 1秒後保存
}

// 防抖備份函數（在收藏操作後等待10秒無新操作才觸發備份）
function debouncedBackup() {
  // 清除之前的計時器
  if (window.backupTimeout) {
    clearTimeout(window.backupTimeout);
  }
  
  // 設置新的計時器，10秒後執行備份
  window.backupTimeout = setTimeout(() => {
    if (indexedDBBackup.isEnabled()) {
      indexedDBBackup.backup().catch(() => {
        // 備份錯誤，靜默處理
      });
    }
  }, 10000); // 10秒後備份
}

// 版本紀錄功能
function showVersionHistory() {
  // 檢查是否已經存在版本紀錄視窗
  let versionModal = document.getElementById('version-history-modal');
  if (versionModal) {
    versionModal.style.display = 'flex';
    // 如果已存在，更新語言
    if (typeof window.i18n !== 'undefined') {
      updateVersionHistoryContent(versionModal);
    }
    return;
  }
  
  // 創建版本紀錄視窗
  versionModal = document.createElement('div');
  versionModal.id = 'version-history-modal';
  versionModal.className = 'favorite-streams-manager';
  versionModal.style.display = 'flex';
  
  // 更新內容
  updateVersionHistoryContent(versionModal);
  
  document.body.appendChild(versionModal);
  
  // 點擊外部關閉
  versionModal.addEventListener('click', (e) => {
    if (e.target === versionModal) {
      closeVersionHistory();
    }
  });
}

// 更新版本紀錄內容
function updateVersionHistoryContent(versionModal) {
  // 確保正確獲取 i18n 對象
  const i18n = window.i18n;
  // 使用 bind 確保正確的 this 上下文
  const t = i18n && typeof i18n.t === 'function' ? i18n.t.bind(i18n) : (key) => key;
  
  // 版本紀錄內容（使用 i18n key）
  const versionHistory = [
    {
      version: '1.6.0',
      date: '2025-12-2',
      changeKeys: [
        'version1.6.0.change1',
        'version1.6.0.change2',
        'version1.6.0.change3',
        'version1.6.0.change4',
        'version1.6.0.change5',
        'version1.6.0.change6'
      ]
    },
    {
      version: '1.5.0',
      date: '2025-11-30',
      changeKeys: [
        'version1.5.0.change1',
        'version1.5.0.change2',
        'version1.5.0.change3',
        'version1.5.0.change4',
        'version1.5.0.change5'
      ]
    },
    {
      version: '1.4.1',
      date: '2025-11-29',
      changeKeys: [
        'version1.4.1.change1',
        'version1.4.1.change2'
      ]
    },
    {
      version: '1.3.0',
      date: '2025-11-28',
      changeKeys: [
        'version1.3.0.change1',
        'version1.3.0.change2',
        'version1.3.0.change3',
        'version1.3.0.change4',
        'version1.3.0.change5',
        'version1.3.0.change6'
      ]
    },
    {
      version: '1.2.0',
      date: '2025-11-28',
      changeKeys: [
        'version1.2.0.change1',
        'version1.2.0.change2',
        'version1.2.0.change3',
        'version1.2.0.change4',
        'version1.2.0.change5',
        'version1.2.0.change6',
        'version1.2.0.change7',
        'version1.2.0.change8'
      ]
    },
    {
      version: '1.1.0',
      date: '2025-11-27',
      changeKeys: [
        'version1.1.0.change1',
        'version1.1.0.change2',
        'version1.1.0.change3',
        'version1.1.0.change4'
      ]
    },
    {
      version: '1.0.0',
      date: '2025-11-26',
      changeKeys: [
        'version1.0.0.change1',
        'version1.0.0.change2',
        'version1.0.0.change3',
        'version1.0.0.change4',
        'version1.0.0.change5',
        'version1.0.0.change6'
      ]
    }
  ];
  
  // 構建版本紀錄 HTML
  let content = `
    <div class="favorite-manager-header">
      <h3>${escapeHtml(t('versionHistory'))}</h3>
      <button onclick="closeVersionHistory()" class="close-btn">×</button>
    </div>
    <div class="favorite-manager-content" style="max-height: 70vh; overflow-y: auto;">
  `;
  
  versionHistory.forEach((version, index) => {
    content += `
      <div style="margin-bottom: 24px; padding-bottom: 24px; border-bottom: ${index < versionHistory.length - 1 ? '1px solid #444' : 'none'};">
        <div style="display: flex; align-items: center; margin-bottom: 12px;">
          <h4 style="margin: 0; color: #9147ff; font-size: 18px;">${escapeHtml(t('version'))} ${escapeHtml(version.version)}</h4>
          <span style="margin-left: 12px; color: #888; font-size: 12px;">${escapeHtml(version.date)}</span>
        </div>
        <ul style="margin: 0; padding-left: 20px; color: #ccc; line-height: 1.8;">
    `;
    
    version.changeKeys.forEach(changeKey => {
      const changeText = t(changeKey);
      content += `<li style="margin-bottom: 6px;">${escapeHtml(changeText)}</li>`;
    });
    
    content += `
        </ul>
      </div>
    `;
  });
  
  content += `
    </div>
  `;
  
  versionModal.innerHTML = content;
}

// 關閉版本紀錄
function closeVersionHistory() {
  const versionModal = document.getElementById('version-history-modal');
  if (versionModal) {
    versionModal.style.display = 'none';
  }
}

// 確保函數是全局的
if (typeof window !== 'undefined') {
  window.showVersionHistory = showVersionHistory;
  window.closeVersionHistory = closeVersionHistory;
}

// 使用教學功能
function showUserGuide() {
  // 檢查是否已經存在使用教學視窗
  let guideModal = document.getElementById('user-guide-modal');
  if (guideModal) {
    guideModal.style.display = 'flex';
    // 如果已存在，更新語言
    if (typeof window.i18n !== 'undefined') {
      updateUserGuideContent(guideModal);
    }
    return;
  }
  
  // 創建使用教學視窗
  guideModal = document.createElement('div');
  guideModal.id = 'user-guide-modal';
  guideModal.className = 'favorite-streams-manager';
  guideModal.style.display = 'flex';
  
  // 更新內容
  updateUserGuideContent(guideModal);
  
  document.body.appendChild(guideModal);
  
  // 點擊外部關閉
  guideModal.addEventListener('click', (e) => {
    if (e.target === guideModal) {
      closeUserGuide();
    }
  });
}

// 更新使用教學內容
function updateUserGuideContent(guideModal) {
  // 確保正確獲取 i18n 對象
  const i18n = window.i18n;
  // 使用 bind 確保正確的 this 上下文
  const t = i18n && typeof i18n.t === 'function' ? i18n.t.bind(i18n) : (key) => key;
  
  // 使用教學內容
  const guideContent = `
    <div class="favorite-manager-header">
      <h3>${escapeHtml(t('userGuide'))}</h3>
      <button onclick="closeUserGuide()" class="close-btn">×</button>
    </div>
    <div class="favorite-manager-content" style="max-height: 70vh; overflow-y: auto; padding: 20px;">
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('addStreamTitle'))}</h4>
        <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">${escapeHtml(t('addStreamStep1'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('addStreamStep2'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('addStreamStep3'))}</li>
        </ol>
        <div style="margin-top: 10px; padding: 10px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; font-size: 11px; color: #aaa;">
          ${escapeHtml(t('addStreamTip'))}
          <br>${escapeHtml(t('addStreamTipTwitch'))}
          <br>${escapeHtml(t('addStreamTipYouTube'))}
          <br>${escapeHtml(t('addStreamTipSearch'))}
        </div>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('searchTitle'))}</h4>
        <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">${escapeHtml(t('searchStep1'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('searchStep2'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('searchStep3'))}</li>
        </ol>
        <div style="margin-top: 10px; padding: 10px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; font-size: 11px; color: #aaa;">
          ${escapeHtml(t('searchTip'))}
        </div>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('layoutTitle'))}</h4>
        <div style="margin-bottom: 16px;">
          <h5 style="color: #aaa; font-size: 14px; margin-bottom: 8px;">${escapeHtml(t('layoutBasic'))}</h5>
          <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutBasicStep1'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutBasicStep2'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutBasicStep3'))}</li>
          </ol>
        </div>
        <div style="margin-top: 16px;">
          <h5 style="color: #aaa; font-size: 14px; margin-bottom: 8px;">${escapeHtml(t('layoutSideChat'))}</h5>
          <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutSideChatStep1'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutSideChatStep2'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutSideChatStep3'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutSideChatStep4'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutSideChatStep5'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutSideChatStep6'))}</li>
          </ol>
          <div style="margin-top: 10px; padding: 10px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; font-size: 11px; color: #aaa;">
            ${escapeHtml(t('layoutSideChatTip'))}
          </div>
        </div>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('chatTitle'))}</h4>
        <div style="margin-bottom: 16px;">
          <h5 style="color: #aaa; font-size: 14px; margin-bottom: 8px;">${escapeHtml(t('chatBasic'))}</h5>
          <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
            <li style="margin-bottom: 8px;">${escapeHtml(t('chatBasicStep1'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('chatBasicStep2'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('chatBasicStep3'))}</li>
          </ol>
        </div>
        <div style="margin-top: 16px;">
          <h5 style="color: #aaa; font-size: 14px; margin-bottom: 8px;">${escapeHtml(t('chatSideLayout'))}</h5>
          <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
            <li style="margin-bottom: 8px;">${escapeHtml(t('chatSideLayoutStep1'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('chatSideLayoutStep2'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('chatSideLayoutStep3'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('chatSideLayoutStep4'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('chatSideLayoutStep5'))}</li>
          </ol>
        </div>
        <div style="margin-top: 10px; padding: 10px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; font-size: 11px; color: #aaa;">
          ${escapeHtml(t('chatWarning'))}
        </div>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('volumeTitle'))}</h4>
        <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">${escapeHtml(t('volumeStep1'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('volumeStep2'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('volumeStep3'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('volumeStep4'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('volumeStep5'))}</li>
        </ol>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('reloadStreamTitle'))}</h4>
        <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">${escapeHtml(t('reloadStreamStep1'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('reloadStreamStep2'))}</li>
        </ol>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('favoriteTitle'))}</h4>
        <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">${escapeHtml(t('favoriteStep1'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('favoriteStep2'))}
            <ul style="margin-top: 6px; padding-left: 20px;">
              <li>${escapeHtml(t('favoriteStep2Item1'))}</li>
              <li>${escapeHtml(t('favoriteStep2Item2'))}</li>
              <li>${escapeHtml(t('favoriteStep2Item3'))}</li>
            </ul>
          </li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('favoriteStep3'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('favoriteStep4'))}
            <ul style="margin-top: 6px; padding-left: 20px;">
              <li>${escapeHtml(t('favoriteStep4Item1'))}</li>
              <li>${escapeHtml(t('favoriteStep4Item2'))}</li>
            </ul>
          </li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('favoriteStep5'))}
            <ul style="margin-top: 6px; padding-left: 20px;">
              <li>${escapeHtml(t('favoriteStep5Item1'))}</li>
              <li>${escapeHtml(t('favoriteStep5Item2'))}</li>
              <li>${escapeHtml(t('favoriteStep5Item3'))}</li>
            </ul>
          </li>
        </ol>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('liveStatusTitle'))}</h4>
        <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">${escapeHtml(t('liveStatusStep1'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('liveStatusStep2'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('liveStatusStep3'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('liveStatusStep4'))}</li>
        </ol>
        <div style="margin-top: 10px; padding: 10px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; font-size: 11px; color: #aaa;">
          ${escapeHtml(t('liveStatusTip'))}
        </div>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('backupTitle'))}</h4>
        <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">${escapeHtml(t('backupStep1'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('backupStep2'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('backupStep3'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('backupStep4'))}</li>
        </ol>
        <div style="margin-top: 10px; padding: 10px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; font-size: 11px; color: #aaa;">
          ${escapeHtml(t('backupTip'))}
        </div>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('controlPanelTitle'))}</h4>
        <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">${escapeHtml(t('controlPanelStep1'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('controlPanelStep2'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('controlPanelStep3'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('controlPanelStep4'))}</li>
        </ol>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('mobileTitle'))}</h4>
        <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">${escapeHtml(t('mobileStep1'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('mobileStep2'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('mobileStep3'))}</li>
        </ol>
      </div>
      
      <div style="margin-bottom: 20px; padding: 15px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; border-left: 3px solid #9147ff;">
        <h4 style="color: #9147ff; font-size: 14px; margin: 0 0 8px 0;">${escapeHtml(t('tipsTitle'))}</h4>
        <ul style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0; font-size: 12px;">
          <li>${escapeHtml(t('tip1'))}</li>
          <li>${escapeHtml(t('tip2'))}</li>
          <li>${escapeHtml(t('tip3'))}</li>
          <li>${escapeHtml(t('tip4'))}</li>
        </ul>
      </div>
    </div>
  `;
  
  guideModal.innerHTML = guideContent;
}

// 關閉使用教學
function closeUserGuide() {
  const guideModal = document.getElementById('user-guide-modal');
  if (guideModal) {
    guideModal.style.display = 'none';
  }
}

// 收藏管理搜尋功能
let favoriteSearchDebounceTimer = null;
let favoriteCurrentSearchResults = [];
let favoriteSelectedSearchIndex = -1;

// 初始化收藏管理的搜尋建議
function initFavoriteSearchSuggestions() {
  const urlInput = document.getElementById('favorite-url-input');
  if (!urlInput) return;
  
  // 創建搜尋建議容器
  let suggestionsDiv = document.getElementById('favorite-search-suggestions');
  if (!suggestionsDiv) {
    suggestionsDiv = document.createElement('div');
    suggestionsDiv.id = 'favorite-search-suggestions';
    suggestionsDiv.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: #1a1a1a;
      border: 1px solid #444;
      border-radius: 4px;
      max-height: 300px;
      overflow-y: auto;
      z-index: 1000;
      margin-top: 4px;
      display: none;
    `;
    
    // 將搜尋建議容器添加到輸入框的父容器
    const addSection = urlInput.closest('.favorite-add-section');
    if (addSection) {
      addSection.style.position = 'relative';
      addSection.appendChild(suggestionsDiv);
    }
  }
  
  // 輸入事件處理（防抖搜尋）
  urlInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    // 清除之前的定時器
    if (favoriteSearchDebounceTimer) {
      clearTimeout(favoriteSearchDebounceTimer);
    }
    
    // 如果是 URL，不顯示搜尋建議
    if (query.includes('http://') || query.includes('https://') || 
        query.includes('twitch.tv/') || query.includes('youtube.com') || 
        query.includes('youtu.be/')) {
      hideFavoriteSearchSuggestions();
      return;
    }
    
    // 如果輸入為空，隱藏建議
    if (query.length === 0) {
      hideFavoriteSearchSuggestions();
      return;
    }
    
    // 防抖：延遲 300ms 後執行搜尋
    favoriteSearchDebounceTimer = setTimeout(async () => {
      await performFavoriteSearch(query);
    }, 300);
  });
  
  // 鍵盤導航
  urlInput.addEventListener('keydown', (e) => {
    if (suggestionsDiv.style.display === 'none') return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      favoriteSelectedSearchIndex = Math.min(favoriteSelectedSearchIndex + 1, favoriteCurrentSearchResults.length - 1);
      updateFavoriteSelectedSuggestion();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      favoriteSelectedSearchIndex = Math.max(favoriteSelectedSearchIndex - 1, -1);
      updateFavoriteSelectedSuggestion();
    } else if (e.key === 'Enter' && favoriteSelectedSearchIndex >= 0) {
      e.preventDefault();
      selectFavoriteSearchResult(favoriteCurrentSearchResults[favoriteSelectedSearchIndex]);
    } else if (e.key === 'Escape') {
      hideFavoriteSearchSuggestions();
    }
  });
  
  // 點擊外部關閉建議
  document.addEventListener('click', (e) => {
    if (!urlInput.contains(e.target) && !suggestionsDiv.contains(e.target)) {
      hideFavoriteSearchSuggestions();
    }
  });
}

// 執行收藏管理的搜尋（只搜尋頻道，不檢查直播狀態）
async function performFavoriteSearch(query) {
  const suggestionsDiv = document.getElementById('favorite-search-suggestions');
  if (!suggestionsDiv) {
    return;
  }
  
  // 顯示載入狀態
  suggestionsDiv.innerHTML = '<div style="padding: 12px; text-align: center; color: #aaa;">搜尋中...</div>';
  suggestionsDiv.style.display = 'block';
  
  try {
    // 同時搜尋 Twitch 和 YouTube（只搜尋頻道，不檢查直播狀態）
    const searchPromises = [];
    
    // Twitch 搜尋
    if (window.twitchApi && typeof window.twitchApi.searchChannels === 'function') {
      searchPromises.push(
        window.twitchApi.searchChannels(query, 5)
          .then(results => {
            if (results && Array.isArray(results) && results.length > 0) {
              return results.map(r => ({ 
                ...r, 
                platform: 'twitch', 
                source: 'twitch',
                displayName: r.displayName || r.display_name || r.login || r.title || '未知頻道'
              }));
            }
            return [];
          })
          .catch(error => {
            console.warn('Twitch 搜尋失敗:', error.message);
            return [];
          })
      );
    }
    
    // YouTube 搜尋（使用 searchChannelsOnly，不檢查直播狀態）
    if (window.youtubeApi && typeof window.youtubeApi.searchChannelsOnly === 'function') {
      const youtubeConfig = window.youtubeApi.getConfig();
      if (!youtubeConfig.isBlocked) {
        searchPromises.push(
          window.youtubeApi.searchChannelsOnly(query, 5)
            .then(results => {
              if (results && Array.isArray(results)) {
                return results.map(r => ({ 
                  ...r, 
                  platform: 'youtube', 
                  source: 'youtube', 
                  displayName: r.title || r.displayName || r.name 
                }));
              }
              return [];
            })
            .catch(error => {
              if (error.message && (error.message.includes('流量') || error.message.includes('配額'))) {
                console.warn('YouTube API 流量限制:', error.message);
                return [];
              }
              console.warn('YouTube 搜尋失敗:', error.message);
              return [];
            })
        );
      }
    }
    
    // 等待所有搜尋完成
    const allResults = await Promise.allSettled(searchPromises);
    const results = allResults
      .filter(result => result.status === 'fulfilled')
      .map(result => {
        const value = result.value;
        return Array.isArray(value) ? value : [];
      })
      .flat();
    
    favoriteCurrentSearchResults = results;
    favoriteSelectedSearchIndex = -1;
    
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
      
      // 頻道資訊
      const info = document.createElement('div');
      info.style.cssText = 'flex: 1; min-width: 0;';
      
      const name = document.createElement('div');
      name.style.cssText = 'font-weight: bold; color: #fff; margin-bottom: 2px;';
      let displayName = channel.displayName || channel.display_name || channel.title || channel.name || channel.login || '未知頻道';
      name.textContent = displayName;
      
      const details = document.createElement('div');
      details.style.cssText = 'font-size: 11px; color: #aaa;';
      details.textContent = channel.description || channel.title || '頻道';
      
      info.appendChild(name);
      info.appendChild(details);
      
      item.appendChild(platformTag);
      item.appendChild(info);
      
      // 點擊事件
      item.addEventListener('click', () => {
        selectFavoriteSearchResult(channel);
      });
      
      // 滑鼠懸停效果
      item.addEventListener('mouseenter', () => {
        item.style.background = '#2a2a2a';
        favoriteSelectedSearchIndex = index;
        updateFavoriteSelectedSuggestion();
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = '';
      });
      
      suggestionsDiv.appendChild(item);
    });
  } catch (error) {
    suggestionsDiv.innerHTML = `<div style="padding: 12px; text-align: center; color: #f44;">搜尋錯誤: ${error.message}</div>`;
  }
}

// 更新收藏管理搜尋建議的選中狀態
function updateFavoriteSelectedSuggestion() {
  const suggestionsDiv = document.getElementById('favorite-search-suggestions');
  if (!suggestionsDiv) return;
  
  const items = suggestionsDiv.querySelectorAll('.search-suggestion-item');
  items.forEach((item, index) => {
    if (index === favoriteSelectedSearchIndex) {
      item.style.background = '#2a2a2a';
    } else {
      item.style.background = '';
    }
  });
}

// 選擇收藏管理搜尋結果
function selectFavoriteSearchResult(channel) {
  const urlInput = document.getElementById('favorite-url-input');
  const nameInput = document.getElementById('favorite-name-input');
  
  if (urlInput) {
    // 對於 YouTube，始終使用頻道 URL（使用頻道 ID，固定不變）
    if ((channel.platform === 'youtube' || channel.source === 'youtube') && channel.id) {
      urlInput.value = `https://www.youtube.com/channel/${channel.id}`;
    } else if (channel.platform === 'twitch' || channel.source === 'twitch') {
      // Twitch 使用頻道 URL
      urlInput.value = channel.url || `https://www.twitch.tv/${channel.login || channel.id}`;
    } else {
      urlInput.value = channel.url || '';
    }
    
    // 自動填入頻道名稱
    if (nameInput) {
      const displayName = channel.displayName || channel.display_name || channel.title || channel.name || channel.login || '';
      if (displayName) {
        nameInput.value = displayName;
      }
    }
  }
  
  hideFavoriteSearchSuggestions();
  if (urlInput) urlInput.focus();
}

// 隱藏收藏管理搜尋建議
function hideFavoriteSearchSuggestions() {
  const suggestionsDiv = document.getElementById('favorite-search-suggestions');
  if (suggestionsDiv) {
    suggestionsDiv.style.display = 'none';
    favoriteSelectedSearchIndex = -1;
  }
}

// 確保函數是全局的
if (typeof window !== 'undefined') {
  window.showUserGuide = showUserGuide;
  window.closeUserGuide = closeUserGuide;
}

