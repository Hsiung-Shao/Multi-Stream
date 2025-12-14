// 用戶設置和收藏管理功能

// IndexedDB 備份系統（替代本地文件系統）
const indexedDBBackup = {
  dbName: 'MultiStreamBackup',
  _db: null, // 存儲數據庫實例
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
      
      request.onerror = (event) => {
        reject(request.error);
      };
      
      request.onsuccess = (event) => {
        this.db = request.result;
        resolve(true);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          try {
            const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id' });
            objectStore.createIndex('timestamp', 'timestamp', { unique: false });
          } catch (error) {
            // 創建對象存儲失敗，繼續處理
          }
        }
      };
      
      request.onblocked = (event) => {
        // 數據庫升級被阻塞，繼續處理
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
    const isEnabled = enabled === 'true';
    return isEnabled;
  },
  
  // 設置是否啟用備份
  setEnabled: (enabled) => {
    localStorage.setItem('indexedDBBackupEnabled', enabled ? 'true' : 'false');
  },
  
  // 獲取所有數據（從 localStorage - 主要快取）
  // 注意：此函數從 localStorage 讀取數據，localStorage 是主要快取
  getAllData() {
    const data = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      userSettings: safeJSONParse(localStorage.getItem('userSettings'), null),
      favoriteStreams: safeJSONParse(localStorage.getItem('favoriteStreams'), []),
      favoriteCategories: safeJSONParse(localStorage.getItem('favoriteCategories'), []),
      controlPanelCollapsed: localStorage.getItem('controlPanelCollapsed'),
      multiStreamLayout: safeJSONParse(localStorage.getItem('multiStreamLayout'), null),
      adConfig: safeJSONParse(localStorage.getItem('adConfig'), null)
    };
    return data;
  },
  
  // React 環境：僅檢查收藏列表
  hasLocalStorageData: () => {
    const favoriteStreams = localStorage.getItem('favoriteStreams');
    
    // React 環境：僅檢查 favoriteStreams
    if (favoriteStreams && favoriteStreams !== '[]' && favoriteStreams !== 'null') {
      return true;
    }
    
    return false;
  },
  
  // React 環境：僅檢查收藏列表
  async hasIndexedDBData() {
    if (!this.isEnabled()) {
      return false;
    }
    
    // 確保數據庫已初始化
    if (!this.db) {
      try {
        const initResult = await this.init();
        if (!initResult || !this.db) {
          return false;
        }
      } catch (error) {
        return false;
      }
    }
    
    if (!this.db) {
      return false;
    }
    
    try {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get('latest');
      
      return new Promise((resolve) => {
        request.onsuccess = () => {
          const result = request.result;
          if (!result || !result.data) {
            resolve(false);
            return;
          }
          
          const data = result.data;
          // React 環境：僅檢查 favoriteStreams，並驗證是否為非空陣列
          if (data.favoriteStreams && Array.isArray(data.favoriteStreams) && data.favoriteStreams.length > 0) {
            resolve(true);
          } else {
            resolve(false);
          }
        };
        
        request.onerror = () => {
          resolve(false);
        };
      });
    } catch (error) {
      // 檢查 IndexedDB 數據時發生錯誤，繼續處理
      return false;
    }
  },
  
  // 備份數據到 IndexedDB（從 localStorage 讀取並備份）
  // 注意：此函數從 localStorage（主要快取）讀取數據，然後備份到 IndexedDB
  async backup() {
    if (!this.isEnabled()) {
      // 備份功能未啟用，跳過備份
      return false;
    }
    
    // 確保數據庫已初始化
    if (!this.db) {
      try {
        const initResult = await this.init();
        
        if (!initResult) {
          return false;
        }
      } catch (error) {
        return false;
      }
    }
    
    if (!this.db) {
      return false;
    }
    
    try {
      // 從 localStorage（主要快取）讀取數據
      const data = this.getAllData();
      
      const backupData = {
        id: 'latest',
        timestamp: Date.now(),
        data: data
      };
      
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      // 使用 Promise 包裝 put 操作
      const putRequest = store.put(backupData);
      
      return new Promise((resolve) => {
        putRequest.onsuccess = () => {
          resolve(true);
        };
        
        putRequest.onerror = (event) => {
          resolve(false);
        };
        
        transaction.onerror = (event) => {
          resolve(false);
        };
        
        transaction.oncomplete = () => {
          // 事務完成
        };
      });
    } catch (error) {
      return false;
    }
  },
  
  // 從 IndexedDB 恢復數據（僅在 localStorage 為空時使用）
  async restore() {
    // 檢查 localStorage 是否有數據
    // 重要：localStorage 是主要快取，如果已有數據則不從 IndexedDB 恢復
    const hasLocalData = this.hasLocalStorageData();
    
    if (hasLocalData) {
      return { success: false, message: 'localStorage 中已有數據，以 localStorage（主要快取）為主', skipped: true };
    }
    
    // 確保數據庫已初始化
    if (!this.db) {
      try {
        const initResult = await this.init();
        
        if (!initResult || !this.db) {
          return { success: false, message: '數據庫初始化失敗' };
        }
      } catch (error) {
        return { success: false, message: '數據庫初始化失敗: ' + error.message };
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
          if (data.multiStreamLayout) {
            localStorage.setItem('multiStreamLayout', JSON.stringify(data.multiStreamLayout));
          }
          if (data.adConfig) {
            localStorage.setItem('adConfig', JSON.stringify(data.adConfig));
          }
          
          resolve({ success: true, message: '數據恢復成功' });
        };
        
        request.onerror = (event) => {
          resolve({ success: false, message: '讀取備份失敗: ' + (request.error?.message || '未知錯誤') });
        };
        
        transaction.onerror = (event) => {
          // 事務錯誤，繼續處理
        };
      });
    } catch (error) {
      return { success: false, message: '恢復數據失敗: ' + error.message };
    }
  },
  
  // 自動載入備份（頁面載入時）
  // React 環境：僅檢查 favoriteStreams 數據
  // 注意：只有在 localStorage 的 favoriteStreams 為空時才從 IndexedDB 恢復
  async autoLoadBackup() {
    if (!this.isEnabled()) {
      return { success: false, message: '備份功能未啟用', skipped: true };
    }
    
    // React 環境：僅檢查 localStorage 的 favoriteStreams 數據
    const hasLocalData = this.hasLocalStorageData();
    if (hasLocalData) {
      return { success: false, message: 'localStorage 的 favoriteStreams 已有數據，以 localStorage 為主', skipped: true };
    }
    
    // 檢查 IndexedDB 是否有 favoriteStreams 數據
    const hasIndexedDBData = await this.hasIndexedDBData();
    if (!hasIndexedDBData) {
      return { success: false, message: 'IndexedDB 中沒有 favoriteStreams 備份數據', skipped: true };
    }
    
    return await this.restore();
  }
};

// 初始化 IndexedDB 備份系統（頁面載入時）
if (window.indexedDB) {
  indexedDBBackup.init()
    .then((success) => {
      // IndexedDB 初始化完成
    })
    .catch((error) => {
      // IndexedDB 初始化失敗，繼續處理
    });
} else {
  // IndexedDB 不可用，繼續處理
}

// [已遷移到 React UI] showSaveMessage 已遷移到 React 組件
/*
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
*/

// [已遷移到 React UI] 以下函數仍在全局使用，但內部 DOM 操作可能需要更新
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
      
      // 更新收藏列表顯示
      if (typeof updateFavoriteListDisplay === 'function') {
        updateFavoriteListDisplay();
      }
      
      // 更新串流順序列表（如果存在）
      if (typeof updateStreamOrderList === 'function') {
        updateStreamOrderList();
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
      collapsed: (() => {
        const panel = document.getElementById('control-panel');
        return panel ? panel.classList.contains('collapsed') : false;
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
    
    // 生成唯一 ID：使用時間戳 + 隨機數，確保即使在同一毫秒內創建也不會重複
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newCategory = {
      id: uniqueId,
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
  // 儲存流程：1. 先寫入 localStorage（主要快取） 2. 異步備份到 IndexedDB
  saveList: (list) => {
    // 步驟 1：先寫入 localStorage（主要快取）
    localStorage.setItem('favoriteStreams', JSON.stringify(list));
    
    // 步驟 2：觸發防抖備份到 IndexedDB（10秒後無新操作才備份）
    debouncedBackup();
    
    // 注意：不在 saveList 中觸發事件，因為 add、update、remove 方法已經觸發了帶有 detail 的事件
    // 這樣可以避免重複觸發，並且確保事件包含正確的收藏信息
  },
  
  // 添加收藏（異步版本，支援從 videoID 獲取 channelID）
  add: async (url, name = '', categoryId = null, providedChannelId = null) => {
    const list = favoriteStreams.getList();
    
    // 檢查是否已存在（根據 URL 或 channelId 檢查）
    const exists = list.some(item => {
      // 直接 URL 匹配
      if (item.url === url) return true;
      
      // 對於 YouTube，需要更智能的匹配
      if (item.platform === 'youtube') {
        // 如果提供了 channelId，檢查 channelId 是否已存在（優先檢查，最可靠）
        if (providedChannelId && item.channelId && providedChannelId.trim() === item.channelId.trim()) {
          return true;
        }
        
        // 檢查 URL 是否指向同一個頻道（考慮 /live 後綴的差異）
        // 例如：/channel/UCxxx 和 /channel/UCxxx/live 應該被視為相同
        const urlChannelMatch = url.match(/youtube\.com\/channel\/([^\/\?]+)/);
        const itemChannelMatch = item.url ? item.url.match(/youtube\.com\/channel\/([^\/\?]+)/) : null;
        if (urlChannelMatch && itemChannelMatch && urlChannelMatch[1] === itemChannelMatch[1]) {
          return true;
        }
      }
      
      // 對於 Twitch，檢查 channelId
      if (item.platform === 'twitch' && providedChannelId) {
        const urlMatch = url.match(/twitch\.tv\/([^\/\?]+)/);
        if (urlMatch && item.channelId === urlMatch[1] && item.channelId === providedChannelId) {
          return true;
        }
        if (item.channelId === providedChannelId) {
          return true;
        }
      }
      
      return false;
    });
    
    if (exists) {
      const i18n = window.i18n || { t: (key) => key };
      const result = { success: false, message: i18n.t('streamAlreadyInFavorites') };
      return result;
    }
    
    // 解析平台和ID
    let platform = '';
    let channelId = providedChannelId || '';
    let videoId = '';
    
    if (url.includes('twitch.tv')) {
      const match = url.match(/twitch\.tv\/([^\/\?]+)/);
      if (match) {
        platform = 'twitch';
        channelId = match[1];
        // 如果沒有提供名稱，嘗試從 URL 參數或其他來源獲取 displayName
        // 如果還是沒有，使用 channelId 作為 fallback
        if (!name) {
          // 嘗試從 URL 參數中獲取 displayName（如果有的話）
          const urlParams = new URLSearchParams(url.split('?')[1] || '');
          const displayName = urlParams.get('displayName');
          name = displayName || channelId;
        }
      }
    } else if (url.includes('youtube.com/watch')) {
      // 僅支援 https://www.youtube.com/watch?v=xxx 格式
      // 如果已經提供了 channelId，直接使用
      if (channelId) {
        platform = 'youtube';
        if (!name) name = channelId;
      } else {
        // 僅支援從 youtube.com/watch?v=xxx 提取 videoId
        if (url.includes('youtube.com/watch')) {
          videoId = new URL(url).searchParams.get('v');
          if (videoId) {
            platform = 'youtube';
            if (!name) name = videoId;
            
            // 透過 YouTube Data API 從 videoID 逆推獲取頻道真實 ID
            try {
              const realChannelId = await youtubeApiUtils.getChannelIdFromVideoId(videoId);
              if (realChannelId) {
                channelId = realChannelId;
                
                // 如果 API key 可用，獲取頻道標題作為名稱
                if (!name || name === videoId) {
                  try {
                    const channelTitle = await youtubeApiUtils.getChannelTitleFromChannelId(realChannelId);
                    if (channelTitle) {
                      name = channelTitle;
                    }
                  } catch (error) {
                    // 獲取標題失敗不影響添加收藏，繼續使用 videoId 作為名稱
                  }
                }
              }
            } catch (error) {
              // 如果獲取失敗，仍然允許添加（向後兼容）
              // 注意：沒有 channelID 的收藏可能無法正確檢查開台狀態
            }
          }
        }
      }
    } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
      // 其他 YouTube URL 格式不再支援
      const i18n = window.i18n || { t: (key) => key };
      return { 
        success: false, 
        message: '僅支援 https://www.youtube.com/watch?v=xxx 格式的 URL' 
      };
    }
    
    if (!platform) {
      const i18n = window.i18n || { t: (key) => key };
      const result = { success: false, message: i18n.t('cannotParseStreamUrl') };
      return result;
    }
    
    // 對於 YouTube，確保 URL 使用頻道 /live 端點（如果有的話）
    // 根據新的混合方式，儲存為 https://www.youtube.com/channel/{真實ID}/live
    let finalUrl = url;
    if (platform === 'youtube' && channelId) {
      // 使用 /live 端點格式
      finalUrl = `https://www.youtube.com/channel/${channelId}/live`;
    } else if (platform === 'youtube' && !channelId && videoId) {
      // 如果沒有 channelId 但有 videoId，保持原始 URL（向後兼容）
      // 這樣即使無法獲取 channelID，用戶仍然可以添加收藏
      finalUrl = url;
    }
    
    // 對於 YouTube，如果已獲取 channelId，立即檢查開台狀態
    let initialLiveStatus = null;
    let initialLiveVideoId = null;
    
    if (platform === 'youtube' && channelId) {
      try {
        const liveStatus = await youtubeApiUtils.checkChannelLiveStatus(channelId);
        initialLiveStatus = liveStatus.isLive;
        initialLiveVideoId = liveStatus.liveVideoId || null;
      } catch (error) {
        // 檢查失敗不影響添加收藏
      }
    }
    
    // 生成唯一 ID：使用時間戳 + 隨機數，確保即使在同一毫秒內創建也不會重複
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newItem = {
      id: uniqueId,
      url: finalUrl, // 對於 YouTube，使用頻道 /live URL
      name: name,
      platform: platform,
      channelId: channelId, // 對於 YouTube，優先使用 channelId
      videoId: videoId,
      categoryId: categoryId,
      addedAt: new Date().toISOString(),
      // 開台狀態相關欄位
      isLive: initialLiveStatus, // 如果已檢查，使用檢查結果；否則為 null
      lastChecked: initialLiveStatus !== null ? new Date().toISOString() : null, // 如果有檢查，記錄檢查時間
      viewerCount: null, // 觀看人數（僅在開台時有效）
      liveTitle: null, // 直播標題（僅在開台時有效）
      gameName: null, // 遊戲名稱（僅在開台時有效）
      liveVideoId: initialLiveVideoId // 當前直播的影片 ID（如果正在直播）
    };
    
    list.push(newItem);
    favoriteStreams.saveList(list);
    
    // 觸發收藏更新事件，通知 StreamBox 和串流順序列表更新名稱
    const event = new CustomEvent('favoritesUpdated', {
      detail: {
        action: 'add',
        favoriteId: uniqueId,
        favorite: newItem
      }
    });
    window.dispatchEvent(event);
    
    const i18n = window.i18n || { t: (key) => key };
    const result = { 
      success: true, 
      message: i18n.t('addedToFavorites'),
      item: newItem // 包含完整的收藏項目資訊
    };
    
    return result;
  },
  
  // 更新收藏
  update: (id, updates) => {
    const list = favoriteStreams.getList();
    const item = list.find(fav => fav.id === id);
    
    if (!item) {
      const i18n = window.i18n || { t: (key) => key };
      return { success: false, message: i18n.t('favoriteNotFound') };
    }
    
    // 如果更新了 channelId，確保 URL 也更新為頻道 /live URL
    if (updates.channelId && item.platform === 'youtube') {
      updates.url = `https://www.youtube.com/channel/${updates.channelId}/live`;
    }
    
    // 更新字段
    if (updates.name !== undefined) item.name = updates.name;
    if (updates.categoryId !== undefined) item.categoryId = updates.categoryId;
    if (updates.channelId !== undefined) item.channelId = updates.channelId;
    if (updates.url !== undefined) item.url = updates.url;
    
    favoriteStreams.saveList(list);
    
    // 觸發收藏更新事件，通知 StreamBox 和串流順序列表更新名稱
    const event = new CustomEvent('favoritesUpdated', {
      detail: {
        action: 'update',
        favoriteId: id,
        favorite: item
      }
    });
    window.dispatchEvent(event);
    
    const i18n = window.i18n || { t: (key) => key };
    return { success: true, message: i18n.t('favoriteUpdated') };
  },
  
  // 移除收藏
  remove: (id) => {
    const list = favoriteStreams.getList();
    const item = list.find(fav => fav.id === id); // 先保存要刪除的項目
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
    
    // 觸發收藏更新事件，通知 StreamBox 和串流順序列表更新名稱
    if (item) {
      const event = new CustomEvent('favoritesUpdated', {
        detail: {
          action: 'remove',
          favoriteId: id,
          favorite: item
        }
      });
      window.dispatchEvent(event);
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
    
    // 等待 React 應用載入（最多等待 5 秒）
    const waitForReactApp = async () => {
      const maxWaitTime = 5000; // 最多等待 5 秒
      const checkInterval = 100; // 每 100ms 檢查一次
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        // 檢查 React 版本的 addStream 是否存在且不是舊版本的 addStream
        if (window.addStream && typeof window.addStream === 'function') {
          // 如果 window.addStream 存在且是函數，說明 React 應用已載入
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
      return false;
    };
    
    // 等待 React 應用載入
    const reactAppReady = await waitForReactApp();
    if (!reactAppReady) {
      const i18n = window.i18n || { t: (key) => key };
      const errorMsg = i18n.t('reactAppNotLoaded') || '錯誤：React 應用尚未載入，無法創建串流容器。請稍候片刻後再試，或重新整理頁面。';
      alert(errorMsg);
      return { success: false, message: errorMsg };
    }
    
    // 安全的 addStream 包裝函數
    const safeAddStream = async (url) => {
      // 再次確認 React 應用已載入
      if (window.addStream && typeof window.addStream === 'function') {
        return await window.addStream(url);
      } else {
        const i18n = window.i18n || { t: (key) => key };
        const errorMsg = i18n.t('reactAppNotLoaded') || '錯誤：React 應用尚未載入，無法創建串流容器。請稍候片刻後再試，或重新整理頁面。';
        alert(errorMsg);
        throw new Error(errorMsg);
      }
    };
    
    // 對於 YouTube 頻道，如果正在直播且有 liveVideoId，使用直播 URL
    if (item.platform === 'youtube') {
      if (item.isLive === true && item.liveVideoId) {
        // 使用保存的直播網址（優先使用 liveUrl，如果沒有則構建）
        const liveUrl = item.liveUrl || `https://www.youtube.com/watch?v=${item.liveVideoId}`;
        await safeAddStream(liveUrl);
        return { success: true };
      } else if (item.channelId) {
        // 如果沒有直播，但 URL 是 /live 格式，先檢查是否有新的直播
        // 如果 URL 是 /live 格式，嘗試檢查當前直播狀態
        if (item.url && item.url.includes('/live')) {
          let status = null;
          try {
            status = await youtubeApiUtils.checkChannelLiveStatus(item.channelId);
            if (status.isLive === true && status.liveVideoId) {
              // 發現新的直播，驗證該直播 URL 對應的頻道 ID 是否與收藏的 channelId 一致
              try {
                const actualChannelId = await youtubeApiUtils.getChannelIdFromVideoId(status.liveVideoId);
                
                // 驗證頻道 ID 是否一致
                if (actualChannelId && actualChannelId.trim() === item.channelId.trim()) {
                  // 頻道 ID 一致，使用直播 URL
                  const liveUrl = `https://www.youtube.com/watch?v=${status.liveVideoId}`;
                  await safeAddStream(liveUrl);
                  
                  // 更新收藏項目的直播狀態（但不更新收藏的 URL，保持 www.youtube.com/channel/UCxxxxx/live 格式）
                  const list = favoriteStreams.getList();
                  const updatedList = list.map(fav => {
                    if (fav.id === item.id) {
                      return {
                        ...fav,
                        isLive: true,
                        liveVideoId: status.liveVideoId,
                        liveUrl: liveUrl, // 保存直播網址（用於播放），但不更新收藏的 URL
                        lastChecked: new Date().toISOString()
                        // 注意：不更新 url，保持收藏中的 www.youtube.com/channel/UCxxxxx/live 格式
                      };
                    }
                    return fav;
                  });
                  favoriteStreams.saveList(updatedList);
                  
                  return { success: true };
                } else {
                  // 頻道 ID 不一致，可能是重定向到其他頻道，不載入
                  const i18n = window.i18n || { t: (key) => key };
                  return { 
                    success: false, 
                    message: i18n.t('channelIdMismatch') || '檢測到直播，但頻道 ID 不一致，可能重定向到其他頻道' 
                  };
                }
              } catch (verifyError) {
                // 驗證失敗，但繼續使用直播 URL（可能是 API 錯誤）
                const liveUrl = `https://www.youtube.com/watch?v=${status.liveVideoId}`;
                await safeAddStream(liveUrl);
                
                // 更新收藏項目的直播狀態（但不更新收藏的 URL，保持 www.youtube.com/channel/UCxxxxx/live 格式）
                const list = favoriteStreams.getList();
                const updatedList = list.map(fav => {
                  if (fav.id === item.id) {
                    return {
                      ...fav,
                      isLive: true,
                      liveVideoId: status.liveVideoId,
                      liveUrl: liveUrl, // 保存直播網址（用於播放），但不更新收藏的 URL
                      lastChecked: new Date().toISOString()
                      // 注意：不更新 url，保持收藏中的 www.youtube.com/channel/UCxxxxx/live 格式
                    };
                  }
                  return fav;
                });
                favoriteStreams.saveList(updatedList);
                
                return { success: true };
              }
            }
          } catch (error) {
            // 靜默處理錯誤
          }
          
          // 如果檢查後仍然沒有直播，再次檢查一次以確保狀態準確
          // 如果沒有直播或檢查失敗，再次嘗試檢查（可能是狀態更新延遲）
          if (!status || !status.isLive || !status.liveVideoId) {
            const i18n = window.i18n || { t: (key) => key };
            // 等待 2 秒後再次檢查（可能狀態正在更新）
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            try {
              const retryStatus = await youtubeApiUtils.checkChannelLiveStatus(item.channelId);
              
              if (retryStatus.isLive === true && retryStatus.liveVideoId) {
                // 驗證頻道 ID
                try {
                  const actualChannelId = await youtubeApiUtils.getChannelIdFromVideoId(retryStatus.liveVideoId);
                  
                  if (actualChannelId && actualChannelId.trim() === item.channelId.trim()) {
                    // 頻道 ID 一致，使用直播 URL
                    const liveUrl = `https://www.youtube.com/watch?v=${retryStatus.liveVideoId}`;
                    await safeAddStream(liveUrl);
                    
                    // 更新收藏項目的直播狀態（但不更新收藏的 URL，保持 www.youtube.com/channel/UCxxxxx/live 格式）
                    const list = favoriteStreams.getList();
                    const updatedList = list.map(fav => {
                      if (fav.id === item.id) {
                        return {
                          ...fav,
                          isLive: true,
                          liveVideoId: retryStatus.liveVideoId,
                          liveUrl: liveUrl, // 保存直播網址（用於播放），但不更新收藏的 URL
                          lastChecked: new Date().toISOString()
                          // 注意：不更新 url，保持收藏中的 www.youtube.com/channel/UCxxxxx/live 格式
                        };
                      }
                      return fav;
                    });
                    favoriteStreams.saveList(updatedList);
                    
                    return { success: true };
                  } else {
                    // 頻道 ID 不一致
                    return { 
                      success: false, 
                      message: i18n.t('channelIdMismatch') || '檢測到直播，但頻道 ID 不一致，可能重定向到其他頻道' 
                    };
                  }
                } catch (verifyError) {
                  // 驗證失敗，但繼續使用直播 URL
                  const liveUrl = `https://www.youtube.com/watch?v=${retryStatus.liveVideoId}`;
                  await safeAddStream(liveUrl);
                  
                  // 更新收藏項目的直播狀態（但不更新收藏的 URL，保持 www.youtube.com/channel/UCxxxxx/live 格式）
                  const list = favoriteStreams.getList();
                  const updatedList = list.map(fav => {
                    if (fav.id === item.id) {
                      return {
                        ...fav,
                        isLive: true,
                        liveVideoId: retryStatus.liveVideoId,
                        liveUrl: liveUrl, // 保存直播網址（用於播放），但不更新收藏的 URL
                        lastChecked: new Date().toISOString()
                        // 注意：不更新 url，保持收藏中的 www.youtube.com/channel/UCxxxxx/live 格式
                      };
                    }
                    return fav;
                  });
                  favoriteStreams.saveList(updatedList);
                  
                  return { success: true };
                }
              }
            } catch (retryError) {
              // 靜默處理錯誤
            }
            
            // 如果二次檢查仍然沒有直播，但狀態顯示為 false，提示用戶
            if (item.isLive === false) {
              alert(i18n.t('channelNotLive') || '該頻道目前未開台');
              return { success: false, message: i18n.t('channelNotLive') || '該頻道目前未開台' };
            }
          }
        }
        
        // 如果狀態未知或檢查失敗，嘗試使用原始 URL（可能是 /live URL，無法播放）
        if (item.url) {
          await safeAddStream(item.url);
          return { success: true };
        }
      } else if (item.url) {
        // 如果沒有 channelId，使用原始 URL
        await safeAddStream(item.url);
        return { success: true };
      }
    } else {
      // Twitch 或其他平台，直接使用 URL
      if (item.url) {
        await safeAddStream(item.url);
        return { success: true };
      }
    }
    
    const i18n = window.i18n || { t: (key) => key };
    return { success: false, message: i18n.t('invalidFavoriteItem') };
  },
  
  // 批量加載收藏（優化版本）
  loadMultiple: async (items) => {
    if (!items || items.length === 0) {
      const i18n = window.i18n || { t: (key) => key };
      return { success: false, message: i18n.t('noFavoritesToLoad') };
    }

    const i18n = window.i18n || { t: (key) => key };
    
    // 優化：提前載入 Twitch Player API（如果批量中包含 Twitch）
    const twitchItems = items.filter(item => 
      item.platform === 'twitch' || 
      (item.url && item.url.includes('twitch.tv/'))
    );
    
    if (twitchItems.length > 0 && window.apiLoader) {
      try {
        await window.apiLoader.loadTwitchPlayerApi();
      } catch (error) {
        // Twitch Player API 載入失敗
      }
    }

    // 優化：使用隊列機制，避免同時創建太多播放器
    const BATCH_SIZE = 3; // 每次同時創建 3 個播放器
    const DELAY_BETWEEN_BATCHES = 300; // 批次之間延遲 300ms
    
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    // 分批處理
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      
      // 並行處理當前批次
      const batchPromises = batch.map(async (item) => {
        try {
          const result = await favoriteStreams.load(item);
          if (result.success) {
            successCount++;
          } else {
            failCount++;
            if (result.message) {
              errors.push(result.message);
            }
          }
        } catch (error) {
          failCount++;
          errors.push(error.message || '未知錯誤');
        }
      });
      
      await Promise.allSettled(batchPromises);
      
      // 如果不是最後一批，等待一段時間再處理下一批
      if (i + BATCH_SIZE < items.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }

    // 構建返回消息
    let message = '';
    if (failCount === 0) {
      message = i18n.t('loadMultipleSuccess')?.replace('{count}', successCount.toString()) || 
                `成功載入 ${successCount} 個收藏`;
    } else {
      message = i18n.t('loadMultipleSuccessWithFail')?.replace('{success}', successCount.toString()).replace('{fail}', failCount.toString()) || 
                `成功載入 ${successCount} 個收藏，失敗 ${failCount} 個`;
    }

    return { 
      success: successCount > 0, 
      message,
      successCount,
      failCount,
      errors: errors.slice(0, 5) // 只返回前 5 個錯誤
    };
  }
};

// [已遷移到 React UI] 收藏管理器 UI 已遷移到 React 組件 (src/components/FavoritesManager.tsx)
// 以下 DOM 創建和操作代碼已註釋
/*
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
            <input type="text" id="favorite-url-input" placeholder="${escapeHtml(i18n.t('pasteStreamUrl'))}" style="flex: 1; padding: 6px; margin-right: 8px; background: var(--bg-input); border: 1px solid var(--border-color-hover); color: var(--text-primary); border-radius: 4px;">
            <input type="text" id="favorite-name-input" placeholder="${escapeHtml(i18n.t('customNameOptional'))}" style="flex: 1; padding: 6px; margin-right: 8px; background: var(--bg-input); border: 1px solid var(--border-color-hover); color: var(--text-primary); border-radius: 4px;">
            <select id="favorite-category-select" style="padding: 6px; margin-right: 8px; background: var(--bg-input); border: 1px solid var(--border-color-hover); color: var(--text-primary); border-radius: 4px;">
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
            <select id="category-filter" style="padding: 6px; margin-right: 8px; background: var(--bg-input); border: 1px solid var(--border-color-hover); color: var(--text-primary); border-radius: 4px;">
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
    content += `<div style="padding: 20px; text-align: center; color: var(--text-secondary);">${escapeHtml(i18n.t('noFavorites'))}</div>`;
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
            ${(item.platform === 'twitch' || item.platform === 'youtube') && item.channelId ? `
              <span class="favorite-live-indicator" style="width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; ${item.isLive === true ? 'background: #00ff00; box-shadow: 0 0 4px #00ff00;' : item.isLive === false ? 'background: #666;' : 'background: #444;'}" title="${item.isLive === true ? '正在直播' : item.isLive === false ? '未開台' : '狀態未知'}"></span>
            ` : ''}
            <span class="favorite-item-name">${safeDisplayName}</span>
            <span class="favorite-item-category">📁 ${safeCategoryName}</span>
            <span class="favorite-item-url">${safeItemUrl}</span>
            ${item.platform === 'youtube' && !item.channelId ? '<span style="font-size: 10px; color: #ff6b6b; margin-left: 8px;">⚠️ 無 RSS</span>' : ''}
          </div>
          <div class="favorite-item-edit" style="display: none; flex-direction: column; gap: 8px;">
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="text" class="favorite-edit-name" value="${safeDisplayName}" placeholder="名稱" style="flex: 1; padding: 4px; background: var(--bg-input); border: 1px solid var(--border-color-hover); color: var(--text-primary); border-radius: 4px; font-size: 12px;">
              <select class="favorite-edit-category" style="padding: 4px; background: var(--bg-input); border: 1px solid var(--border-color-hover); color: var(--text-primary); border-radius: 4px; font-size: 12px;">
                ${categoryOptions}
              </select>
            </div>
            <div style="display: flex; gap: 4px; justify-content: flex-end;">
              <button class="save-favorite-btn" data-favorite-id="${safeItemId}" style="padding: 4px 8px; background: #9147ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">${escapeHtml(i18n.t('save'))}</button>
              <button class="cancel-edit-btn" data-favorite-id="${safeItemId}" style="padding: 4px 8px; background: #444; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">${escapeHtml(i18n.t('cancel'))}</button>
            </div>
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
          <input type="text" id="category-name-input" placeholder="${escapeHtml(i18n.t('categoryName'))}" style="flex: 1; padding: 6px; margin-right: 8px; background: var(--bg-input); border: 1px solid var(--border-color-hover); color: var(--text-primary); border-radius: 4px;">
          <button onclick="addCategory()" style="padding: 6px 12px;">${escapeHtml(i18n.t('addCategory'))}</button>
        </div>
        <div class="category-list" id="category-list">
  `;
  
  if (categories.length === 0) {
    content += `<div style="padding: 20px; text-align: center; color: var(--text-secondary);">${escapeHtml(i18n.t('noCategories'))}</div>`;
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
              <span style="font-size: 14px; color: var(--text-primary);">${escapeHtml(i18n.t('enableAutoBackup'))}</span>
            </label>
            <div style="margin-top: 8px; font-size: 12px; color: #28a745; margin-left: 28px; padding: 8px; background: rgba(40, 167, 69, 0.1); border-radius: 4px; border-left: 3px solid #28a745;">
              數據將自動備份到瀏覽器的 IndexedDB，無需選擇文件位置
            </div>
          </div>
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-color);">
            <div style="margin-bottom: 12px;">
              <div style="font-size: 13px; color: var(--text-primary); margin-bottom: 8px;">備份狀態</div>
              <div id="backup-status" style="font-size: 12px; color: ${backupEnabled ? '#28a745' : '#ffa500'}; margin-bottom: 8px; padding: 6px; background: var(--bg-input); border-radius: 4px;">
                ${backupEnabled ? (i18n.t('backupEnabled') || '已啟用') : (i18n.t('backupDisabled') || '已停用')}
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button onclick="exportToJSON()" style="padding: 6px 12px; background: #28a745; color: var(--text-primary); border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">匯出 JSON 檔案</button>
                <button onclick="importFromJSON()" style="padding: 6px 12px; background: #007bff; color: var(--text-primary); border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">匯入 JSON 檔案</button>
              </div>
              <div style="margin-top: 6px; font-size: 11px; color: var(--text-secondary);">
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
          // 確保只刪除單個項目：使用 closest 找到最近的 favorite-item
          const favoriteItem = target.closest('.favorite-item');
          if (favoriteItem) {
            const itemId = favoriteItem.getAttribute('data-id');
            if (itemId === favoriteId) {
              // 確認刪除
              const i18n = window.i18n || { t: (key) => key };
              if (confirm(i18n.t('confirmDeleteFavorite') || '確認從收藏中刪除?')) {
                removeFavoriteStream(favoriteId);
              }
            }
          }
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
*/

// 添加到收藏（異步版本）
async function addToFavorites() {
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
  
  // 顯示載入訊息
  showSaveMessage(i18n.t('processing') || '處理中...');
  
  // 輸出輸入參數
  let result;
  try {
    result = await favoriteStreams.add(url, name, categoryId);
  } catch (error) {
    // 處理網路錯誤（例如：本地開發環境中 API 不可用）
    if (error.message && (error.message.includes('拒絕連線') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
      showSaveMessage('注意：無法連接到 API 服務（可能是本地開發環境）。收藏已添加，但可能無法自動獲取頻道資訊。');
      // 即使 API 失敗，也嘗試添加收藏（使用原始 URL）
      result = await favoriteStreams.add(url, name, categoryId);
    } else {
      showSaveMessage(`添加失敗: ${error.message || '未知錯誤'}`);
      return;
    }
  }
  
  if (result.success) {
    urlInput.value = '';
    if (nameInput) nameInput.value = '';
    if (categorySelect) categorySelect.value = '';
    showFavoriteStreamsManager(); // 刷新列表
    // 更新控制面板中的收藏列表
    if (typeof updateFavoriteListDisplay === 'function') {
      updateFavoriteListDisplay();
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
  
  // 獲取當前的收藏項目
  const list = favoriteStreams.getList();
  const currentItem = list.find(item => item.id === favoriteId);
  
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
  // 驗證 ID 是否存在於收藏列表中
  const list = favoriteStreams.getList();
  const itemToRemove = list.find(item => item.id === id);
  
  if (!itemToRemove) {
    const i18n = window.i18n || { t: (key) => key };
    showSaveMessage(i18n.t('favoriteNotFound') || '收藏不存在');
    return;
  }
  
  // 執行刪除
  const result = favoriteStreams.remove(id);
  
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
    nameDiv.style.cssText = 'font-size: 14px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px;';
    
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
    categoryDiv.style.cssText = 'font-size: 10px; color: var(--text-secondary);';
    categoryDiv.textContent = '📁 ' + escapeHtml(categoryName);
    
    contentDiv.appendChild(nameDiv);
    contentDiv.appendChild(categoryDiv);
    
    const arrowSpan = document.createElement('span');
    arrowSpan.style.cssText = 'font-size: 12px; color: var(--text-accent);';
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

// YouTube API 工具函數
// 從 Cloudflare Pages Function 取得 API Key 的 Promise（異步）
let youtubeConfigApiKeyPromise = null;

const youtubeApiUtils = {
  // 從 Cloudflare Pages Function 取得 API Key（異步）
  async getApiKeyFromPagesFunction() {
    if (youtubeConfigApiKeyPromise) {
      return youtubeConfigApiKeyPromise;
    }
    
    youtubeConfigApiKeyPromise = (async () => {
      try {
        const apiUrl = '/api/youtube-config';
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.apiKey) {
            return data.apiKey;
          }
        }
      } catch (error) {
        // 獲取 API Key 時發生錯誤
      }
      return null;
    })();
    
    return youtubeConfigApiKeyPromise;
  },
  
  // 獲取 YouTube API Key（優先從 Cloudflare Pages Function，然後從 config.js）
  async getApiKey() {
    // 優先從 Cloudflare Pages Function 獲取
    const apiKeyFromFunction = await this.getApiKeyFromPagesFunction();
    if (apiKeyFromFunction) {
      return apiKeyFromFunction;
    }
    
    // 回退到 config.js
    if (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.YOUTUBE_API_KEY) {
      return window.CONFIG.YOUTUBE_API_KEY;
    }
    
    return null;
  },
  
  // 從 videoID 透過 YouTube Data API 獲取頻道真實 ID
  async getChannelIdFromVideoId(videoId) {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('YouTube API Key 未配置');
    }
    
    if (!videoId || typeof videoId !== 'string') {
      throw new Error('無效的 videoID');
    }
    
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(videoId)}&part=snippet&key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`YouTube API 請求失敗: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.items || data.items.length === 0) {
        throw new Error('找不到該影片');
      }
      
      const channelId = data.items[0].snippet?.channelId;
      if (!channelId) {
        throw new Error('無法從影片中獲取頻道 ID');
      }
      
      return channelId;
    } catch (error) {
      throw error;
    }
  },
  
  // 從 channelID 透過 YouTube Data API 獲取頻道標題
  async getChannelTitleFromChannelId(channelId) {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('YouTube API Key 未配置');
    }
    
    if (!channelId || typeof channelId !== 'string') {
      throw new Error('無效的頻道 ID');
    }
    
    try {
      const url = `https://www.googleapis.com/youtube/v3/channels?id=${encodeURIComponent(channelId)}&part=snippet&key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`YouTube API 請求失敗: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.items || data.items.length === 0) {
        throw new Error('找不到該頻道');
      }
      
      const channelTitle = data.items[0].snippet?.title;
      if (!channelTitle) {
        throw new Error('無法從頻道中獲取標題');
      }
      
      return channelTitle;
    } catch (error) {
      throw error;
    }
  },
  
  // 從 @username 或頻道 handle 透過 YouTube Data API 獲取頻道真實 ID
  async getChannelIdFromHandle(handle) {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('YouTube API Key 未配置');
    }
    
    if (!handle || typeof handle !== 'string') {
      throw new Error('無效的頻道 handle');
    }
    
    // 移除 @ 符號（如果有的話）
    const cleanHandle = handle.replace(/^@/, '').trim();
    if (!cleanHandle) {
      throw new Error('頻道 handle 不能為空');
    }
    
    try {
      // 使用 search.list API 搜索頻道
      // 使用 @handle 格式作為搜索關鍵字，限制結果為頻道類型，增加精確度
      const searchQuery = `@${cleanHandle}`;
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(searchQuery)}&maxResults=5&key=${encodeURIComponent(apiKey)}`;
      const searchResponse = await fetch(searchUrl);
      
      if (!searchResponse.ok) {
        throw new Error(`YouTube API 請求失敗: ${searchResponse.status} ${searchResponse.statusText}`);
      }
      
      const searchData = await searchResponse.json();
      
      if (!searchData.items || searchData.items.length === 0) {
        throw new Error('找不到該頻道');
      }
      
      // 從搜索結果中獲取所有可能的頻道 ID
      const candidateChannels = searchData.items
        .map(item => ({
          channelId: item.id?.channelId,
          title: item.snippet?.title,
          customUrl: item.snippet?.customUrl
        }))
        .filter(item => item.channelId);
      
      if (candidateChannels.length === 0) {
        throw new Error('無法從搜索結果中獲取頻道 ID');
      }
      
      // 嘗試找到完全匹配的頻道（通過 customUrl）
      const exactMatch = candidateChannels.find(channel => {
        if (channel.customUrl) {
          const customUrlHandle = channel.customUrl.replace(/^@/, '').toLowerCase();
          return customUrlHandle === cleanHandle.toLowerCase();
        }
        return false;
      });
      
      if (exactMatch) {
        return exactMatch.channelId;
      }
      
      // 如果沒有完全匹配，使用 channels.list API 獲取第一個候選頻道的詳細資訊來驗證
      const firstCandidate = candidateChannels[0];
      const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(firstCandidate.channelId)}&key=${encodeURIComponent(apiKey)}`;
      const channelResponse = await fetch(channelUrl);
      
      if (channelResponse.ok) {
        const channelData = await channelResponse.json();
        if (channelData.items && channelData.items.length > 0) {
          const channel = channelData.items[0];
          const customUrl = channel.snippet?.customUrl || '';
          
          // 檢查 customUrl 是否匹配
          if (customUrl) {
            const customUrlHandle = customUrl.replace(/^@/, '').toLowerCase();
            if (customUrlHandle === cleanHandle.toLowerCase()) {
              return firstCandidate.channelId;
            }
          }
        }
      }
      
      // 如果沒有找到完全匹配，返回第一個候選頻道（最相關的結果）
      // 這通常是最接近的匹配
      return firstCandidate.channelId;
    } catch (error) {
      throw error;
    }
  },
  
  // 檢查 YouTube 頻道 /live 端點的重定向狀態
  // 根據邏輯表判斷開台狀態
  async checkChannelLiveStatus(channelId) {
    if (!channelId || typeof channelId !== 'string') {
      throw new Error('無效的頻道 ID');
    }
    
    try {
      // 通過 Cloudflare Pages Function 代理請求
      // 這樣可以檢查重定向後的最終 URL
      const proxyUrl = `/api/youtube-channel-live?channelId=${encodeURIComponent(channelId)}`;
      
      let proxyResponse;
      try {
        proxyResponse = await fetch(proxyUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });
      } catch (fetchError) {
        // 處理網路錯誤（例如：連接被拒絕、CORS 錯誤等）
        // 這通常發生在本地開發環境中，Cloudflare Pages Functions 不可用
        return {
          isLive: null,
          status: 'proxy_unavailable',
          message: '代理服務不可用（本地開發環境）',
          liveVideoId: null
        };
      }
      
      if (!proxyResponse.ok) {
        // 如果代理返回 404，可能是頻道不存在或代理端點不存在
        if (proxyResponse.status === 404) {
          // 檢查是否是代理端點不存在（本地開發環境）
          const contentType = proxyResponse.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            // 不是 JSON 響應，可能是 HTML 404 頁面（代理端點不存在）
            return {
              isLive: null,
              status: 'proxy_unavailable',
              message: '代理服務不可用（本地開發環境）',
              liveVideoId: null
            };
          }
          
          // 是 JSON 響應，可能是頻道不存在
          const errorData = await proxyResponse.json().catch(() => ({}));
          if (errorData.status === 404) {
            return {
              isLive: false,
              status: 'channel_not_found',
              message: '頻道不存在或已刪除',
              liveVideoId: null
            };
          }
        }
        
        // 其他錯誤狀態（包括 500）
        // 在本地開發環境中，Cloudflare Pages Functions 可能不可用
        if (proxyResponse.status === 500) {
          return {
            isLive: null,
            status: 'proxy_error',
            message: '代理服務錯誤（可能是本地開發環境）',
            liveVideoId: null
          };
        }
        
        const errorText = await proxyResponse.text().catch(() => '');
        throw new Error(`請求失敗: ${proxyResponse.status} ${errorText}`);
      }
      
      const result = await proxyResponse.json();
      
      // 根據邏輯表判斷狀態
      if (result.status === 404) {
        // HTTP 404 -> 頻道不存在
        return {
          isLive: false,
          status: 'channel_not_found',
          message: '頻道錯誤/已刪除',
          liveVideoId: null
        };
      }
      
      if (result.status === 200) {
        // 檢查是否有 isUpcoming 標記（新版本 API 會返回）
        if (result.isUpcoming === true) {
          // 這是排定直播，不是正在直播
          return {
            isLive: false,
            status: 'scheduled',
            message: '待機中（首播尚未開始）',
            liveVideoId: null,
            scheduledVideoId: result.scheduledVideoId || null
          };
        }
        
        // 檢查 isLive 標記（優先使用）
        if (result.isLive === true) {
          // 這是正在直播
          return {
            isLive: true,
            status: 'live',
            message: '開台中',
            liveVideoId: result.liveVideoId || null
          };
        }
        
        // 兼容舊版本：檢查 finalUrl 是否包含 watch?v=
        const finalUrl = result.finalUrl || '';
        if (finalUrl.includes('watch?v=')) {
          // HTTP 200 + URL 包含 watch?v= -> 可能是開台中或預定直播
          // 但由於無法確定，優先假設是開台（向後兼容）
          const videoIdMatch = finalUrl.match(/[?&]v=([^&]+)/);
          const liveVideoId = videoIdMatch ? videoIdMatch[1] : null;
          
          return {
            isLive: true,
            status: 'live_or_scheduled',
            message: '開台中（或預定直播）',
            liveVideoId: liveVideoId
          };
        } else {
          // HTTP 200 + URL 不包含 watch?v= -> 未開台
          return {
            isLive: false,
            status: 'not_live',
            message: '未開台',
            liveVideoId: null
          };
        }
      }
      
      // 其他狀態
      return {
        isLive: null,
        status: 'unknown',
        message: '狀態未知',
        liveVideoId: null
      };
    } catch (error) {
      return {
        isLive: null,
        status: 'error',
        message: error.message || '檢查失敗',
        liveVideoId: null
      };
    }
  }
};

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
  
  // 處理 YouTube 收藏（使用新的 /live 端點檢查方法）
  if (youtubeFavorites.length > 0) {
    try {
      // 批量檢查 YouTube 頻道開台狀態
      const checkPromises = youtubeFavorites.map(async (item) => {
        if (!item.channelId) {
          return { item, status: null };
        }
        
        try {
          const status = await youtubeApiUtils.checkChannelLiveStatus(item.channelId);
          return { item, status };
        } catch (error) {
          return { item, status: null };
        }
      });
      
      const results = await Promise.allSettled(checkPromises);
      
      // 檢查是否所有請求都失敗（可能是代理不可用）
      const allFailed = results.every(r => {
        if (r.status === 'rejected') return true;
        const status = r.value?.status;
        return !status || status.status === 'proxy_unavailable' || status.status === 'error';
      });
      
      // 如果所有請求都失敗，可能是本地開發環境，靜默處理
      if (allFailed && results.length > 0) {
        const firstStatus = results[0].status === 'fulfilled' ? results[0].value?.status : null;
        if (firstStatus && firstStatus.status === 'proxy_unavailable') {
          // 在本地開發環境中，不更新狀態，也不計入更新數
          return { success: true, updated: updatedCount };
        }
      }
      
      // 更新收藏列表中的開台狀態
      // 對於檢測到開台的項目，需要驗證頻道 ID 並更新 URL
      const updatePromises = updatedList.map(async (item) => {
        if (item.platform === 'youtube' && item.channelId) {
          const result = results.find(r => 
            r.status === 'fulfilled' && r.value.item.id === item.id
          );
          
          if (result && result.status === 'fulfilled' && result.value.status) {
            const status = result.value.status;
            
            // 如果狀態是代理不可用，不更新（保持原有狀態）
            if (status.status === 'proxy_unavailable') {
              return item;
            }
            
            // 如果檢測到開台，驗證頻道 ID 並更新 URL
            if (status.isLive === true && status.liveVideoId && item.channelId) {
              try {
                // 驗證該直播 URL 對應的頻道 ID 是否與收藏的 channelId 一致
                const actualChannelId = await youtubeApiUtils.getChannelIdFromVideoId(status.liveVideoId);
                
                if (actualChannelId && actualChannelId.trim() === item.channelId.trim()) {
                  // 頻道 ID 一致，更新直播狀態（但不更新收藏的 URL，保持 www.youtube.com/channel/UCxxxxx/live 格式）
                  const liveUrl = `https://www.youtube.com/watch?v=${status.liveVideoId}`;
                  updatedCount++;
                  return {
                    ...item,
                    isLive: true,
                    lastChecked: new Date().toISOString(),
                    liveVideoId: status.liveVideoId,
                    liveUrl: liveUrl, // 保存直播網址（用於播放），但不更新收藏的 URL
                    // 注意：不更新 url，保持收藏中的 www.youtube.com/channel/UCxxxxx/live 格式
                  };
                } else {
                  // 頻道 ID 不一致，不更新 URL，只更新狀態為未開台（可能是其他頻道的直播）
                  updatedCount++;
                  return {
                    ...item,
                    isLive: false, // 設為未開台，因為不是該頻道的直播
                    lastChecked: new Date().toISOString(),
                    liveVideoId: null,
                  };
                }
              } catch (verifyError) {
                // 驗證失敗（可能是 API 錯誤），但繼續更新狀態（但不更新收藏的 URL）
                const liveUrl = `https://www.youtube.com/watch?v=${status.liveVideoId}`;
                updatedCount++;
                return {
                  ...item,
                  isLive: true,
                  lastChecked: new Date().toISOString(),
                  liveVideoId: status.liveVideoId,
                  liveUrl: liveUrl, // 保存直播網址（用於播放），但不更新收藏的 URL
                  // 注意：不更新 url，保持收藏中的 www.youtube.com/channel/UCxxxxx/live 格式
                };
              }
            } else {
              // 未開台，只更新狀態
              updatedCount++;
              return {
                ...item,
                isLive: status.isLive || false,
                lastChecked: new Date().toISOString(),
                liveVideoId: status.liveVideoId || null,
                // 注意：YouTube 的 /live 檢查方法無法獲取觀看人數和標題
                // 如果需要這些資訊，需要額外調用 YouTube Data API
              };
            }
          } else {
            // 如果查詢失敗，保持原有狀態，但更新檢查時間（僅在非代理不可用的情況下）
            return {
              ...item,
              lastChecked: new Date().toISOString()
            };
          }
        }
        return item;
      });
      
      // 等待所有更新完成（包括頻道 ID 驗證）
      updatedList = await Promise.all(updatePromises);
    } catch (error) {
      // 靜默處理錯誤
    }
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

// 啟動定期自動刷新
// Twitch 和 YouTube: 使用相同的刷新間隔（預設每 5 分鐘）
// 已移除時間限制，每次調用都會檢查所有頻道狀態
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
  
  // YouTube 檢查：移除時間限制，每次定時器觸發都會檢查
  // 使用與 Twitch 相同的間隔，確保同步刷新
  youtubeCheckInterval = setInterval(() => {
    updateFavoriteLiveStatuses();
  }, intervalMs);
  
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
  localStorage.setItem('favoriteLiveStatusAutoRefresh', 'false');
}

// 手動刷新收藏清單狀態
async function refreshFavoriteStatus() {
  const refreshBtn = document.getElementById('refresh-favorite-status-btn');
  if (!refreshBtn) return;
  
  // 檢查是否正在刷新
  if (refreshBtn.disabled) return;
  
  const i18n = window.i18n || { t: (key) => key };
  const originalText = refreshBtn.textContent;
  
  // 設置載入狀態
  refreshBtn.disabled = true;
  refreshBtn.textContent = i18n.t('refreshingFavoriteStatus') || '刷新中...';
  
  try {
    // 調用更新函數
    const result = await updateFavoriteLiveStatuses();
    
    // 更新收藏列表顯示
    if (typeof updateFavoriteListDisplay === 'function') {
      updateFavoriteListDisplay();
    }
    
    // 更新收藏管理界面（如果打開）
    if (typeof showFavoriteStreamsManager === 'function') {
      const manager = document.getElementById('favorite-streams-manager');
      if (manager && manager.classList.contains('show')) {
        showFavoriteStreamsManager();
      }
    }
    
    // 恢復按鈕狀態
    refreshBtn.disabled = false;
    refreshBtn.textContent = originalText;
    
    // 顯示成功訊息
    if (result.updated > 0) {
      showSaveMessage(`已更新 ${result.updated} 個頻道的開台狀態`);
    } else {
      showSaveMessage('狀態已刷新');
    }
  } catch (error) {
    // 錯誤處理
    refreshBtn.disabled = false;
    refreshBtn.textContent = originalText;
    showSaveMessage('刷新狀態失敗，請查看控制台');
  }
}

// 函數導出已移至文件末尾統一處理

// 從控制面板一鍵載入分類下的所有收藏
function loadCategoryFavoritesFromPanel(categoryId) {
  loadCategoryFavorites(categoryId);
}

// 從控制面板載入收藏串流
function loadFavoriteStreamFromPanel(id) {
  loadFavoriteStream(id);
}

// 收藏當前所有串流
async function addCurrentStreamToFavorites() {
  const boxes = document.querySelectorAll('.stream-box');
  if (boxes.length === 0) {
    const i18n = window.i18n || { t: (key) => key };
    showSaveMessage(i18n.t('noStreamsToFavorite'));
    return;
  }
  
  let addedCount = 0;
  let skippedCount = 0;
  
  // 處理每個串流
  for (let index = 0; index < boxes.length; index++) {
    const box = boxes[index];
    const id = parseInt(box.dataset.streamId);
    const data = streamData[id];
    
    if (data && data.originalUrl) {
      // 優先使用 displayName 或 name，如果沒有才使用 channelId/videoId
      let customName = '';
      let urlToAdd = data.originalUrl;
      
      // 優先使用 displayName 或 name
      if (data.displayName) {
        customName = data.displayName;
      } else if (data.name) {
        customName = data.name;
      }
      
      if (data.platform === 'twitch' && data.channelId) {
        // 如果沒有 displayName，使用 channelId 作為 fallback
        if (!customName) {
          customName = data.channelId;
        }
        // 如果 URL 中沒有 displayName 參數，添加它以便 favoriteStreams.add 使用
        if (customName && customName !== data.channelId && !urlToAdd.includes('displayName=')) {
          const separator = urlToAdd.includes('?') ? '&' : '?';
          urlToAdd = `${urlToAdd}${separator}displayName=${encodeURIComponent(customName)}`;
        }
      } else if (data.platform === 'youtube') {
        // 對於 YouTube，使用現有的 channelId 或 videoId
        if (data.channelId) {
          // 如果沒有 displayName，使用 channelId 作為 fallback
          if (!customName) {
            customName = data.channelId;
          }
          // 確保使用頻道 URL
          urlToAdd = `https://www.youtube.com/channel/${data.channelId}`;
        } else if (data.videoId) {
          // 如果沒有 displayName，使用 videoId 作為 fallback
          if (!customName) {
            customName = data.videoId;
          }
        }
      }
      
      // 添加收藏（傳入 channelId 如果有的話）
      const result = await favoriteStreams.add(urlToAdd, customName, null, data.channelId);
      if (result.success) {
        addedCount++;
      } else {
        skippedCount++;
      }
    }
  }
  
  // 顯示結果
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
// 儲存流程：數據已寫入 localStorage（主要快取），此函數負責異步備份到 IndexedDB
function debouncedBackup() {
  // 清除之前的計時器
  if (window.backupTimeout) {
    clearTimeout(window.backupTimeout);
  }
  
  // 設置新的計時器，10秒後執行備份
  window.backupTimeout = setTimeout(() => {
    if (indexedDBBackup.isEnabled()) {
      indexedDBBackup.backup()
        .then((success) => {
          // 備份完成
        })
        .catch((error) => {
          // 備份到 IndexedDB 時發生錯誤
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
      version: '1.7.1',
      date: '2025-12-06',
      changeKeys: [
        'version1.7.1.change1',
        'version1.7.1.change2'
      ]
    },
    {
      version: '1.7.0',
      date: '2025-12-05',
      changeKeys: [
        'version1.7.0.change1',
        'version1.7.0.change2',
        'version1.7.0.change3',
        'version1.7.0.change4',
        'version1.7.0.change5',
        'version1.7.0.change6',
        'version1.7.0.change7',
        'version1.7.0.change8',
        'version1.7.0.change9'
      ]
    },
    {
      version: '1.6.2',
      date: '2025-12-03',
      changeKeys: [
        'version1.6.2.change1',
        'version1.6.2.change2',
        'version1.6.2.change3'
      ]
    },
    {
      version: '1.6.1',
      date: '2025-12-02',
      changeKeys: [
        'version1.6.1.change1',
        'version1.6.1.change2',
        'version1.6.1.change3',
        'version1.6.1.change4'
      ]
    },
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
      <div style="margin-bottom: 24px; padding-bottom: 24px; border-bottom: ${index < versionHistory.length - 1 ? '1px solid var(--border-color)' : 'none'};">
        <div style="display: flex; align-items: center; margin-bottom: 12px;">
          <h4 style="margin: 0; color: var(--text-accent); font-size: 18px;">${escapeHtml(t('version'))} ${escapeHtml(version.version)}</h4>
          <span style="margin-left: 12px; color: var(--text-secondary); font-size: 12px;">${escapeHtml(version.date)}</span>
        </div>
        <ul style="margin: 0; padding-left: 20px; color: var(--text-primary); line-height: 1.8;">
    `;
    
    version.changeKeys.forEach(changeKey => {
      const changeText = t(changeKey);
      content += `<li style="margin-bottom: 6px; color: var(--text-primary);">${escapeHtml(changeText)}</li>`;
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

// 函數導出已移至文件末尾統一處理

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
        <h4 style="color: var(--text-accent); font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('addStreamTitle'))}</h4>
        <ol style="color: var(--text-primary); line-height: 1.8; padding-left: 20px; margin: 0;">
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
        <h4 style="color: var(--text-accent); font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('searchTitle'))}</h4>
        <ol style="color: var(--text-primary); line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">${escapeHtml(t('searchStep1'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('searchStep2'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('searchStep3'))}</li>
        </ol>
        <div style="margin-top: 10px; padding: 10px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; font-size: 11px; color: #aaa;">
          ${escapeHtml(t('searchTip'))}
        </div>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: var(--text-accent); font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('layoutTitle'))}</h4>
        <div style="margin-bottom: 16px;">
          <h5 style="color: var(--text-secondary); font-size: 14px; margin-bottom: 8px;">${escapeHtml(t('layoutBasic'))}</h5>
          <ol style="color: var(--text-primary); line-height: 1.8; padding-left: 20px; margin: 0;">
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutBasicStep1'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutBasicStep2'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutBasicStep3'))}</li>
          </ol>
        </div>
        <div style="margin-top: 16px;">
          <h5 style="color: var(--text-secondary); font-size: 14px; margin-bottom: 8px;">${escapeHtml(t('layoutSideChat'))}</h5>
          <ol style="color: var(--text-primary); line-height: 1.8; padding-left: 20px; margin: 0;">
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutSideChatStep1'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutSideChatStep2'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutSideChatStep3'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutSideChatStep4'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutSideChatStep5'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('layoutSideChatStep6'))}</li>
          </ol>
          <div style="margin-top: 10px; padding: 10px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; font-size: 11px; color: var(--text-secondary);">
            ${escapeHtml(t('layoutSideChatTip'))}
          </div>
        </div>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: var(--text-accent); font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('chatTitle'))}</h4>
        <div style="margin-bottom: 16px;">
          <h5 style="color: var(--text-secondary); font-size: 14px; margin-bottom: 8px;">${escapeHtml(t('chatBasic'))}</h5>
          <ol style="color: var(--text-primary); line-height: 1.8; padding-left: 20px; margin: 0;">
            <li style="margin-bottom: 8px;">${escapeHtml(t('chatBasicStep1'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('chatBasicStep2'))}</li>
            <li style="margin-bottom: 8px;">${escapeHtml(t('chatBasicStep3'))}</li>
          </ol>
        </div>
        <div style="margin-top: 16px;">
          <h5 style="color: var(--text-secondary); font-size: 14px; margin-bottom: 8px;">${escapeHtml(t('chatSideLayout'))}</h5>
          <ol style="color: var(--text-primary); line-height: 1.8; padding-left: 20px; margin: 0;">
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
        <h4 style="color: var(--text-accent); font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('volumeTitle'))}</h4>
        <ol style="color: var(--text-primary); line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">${escapeHtml(t('volumeStep1'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('volumeStep2'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('volumeStep3'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('volumeStep4'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('volumeStep5'))}</li>
        </ol>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: var(--text-accent); font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('reloadStreamTitle'))}</h4>
        <ol style="color: var(--text-primary); line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">${escapeHtml(t('reloadStreamStep1'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('reloadStreamStep2'))}</li>
        </ol>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: var(--text-accent); font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('favoriteTitle'))}</h4>
        <ol style="color: var(--text-primary); line-height: 1.8; padding-left: 20px; margin: 0;">
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
        <h4 style="color: var(--text-accent); font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('liveStatusTitle'))}</h4>
        <ol style="color: var(--text-primary); line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">${escapeHtml(t('liveStatusStep1'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('liveStatusStep2'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('liveStatusStep3'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('liveStatusStep4'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('liveStatusStep5'))}</li>
        </ol>
        <div style="margin-top: 10px; padding: 10px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; font-size: 11px; color: #aaa;">
          ${escapeHtml(t('liveStatusTip'))}
        </div>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: var(--text-accent); font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('youtubeLiveStatusTitle'))}</h4>
        <ol style="color: var(--text-primary); line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">${escapeHtml(t('youtubeLiveStatusStep1'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('youtubeLiveStatusStep2'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('youtubeLiveStatusStep3'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('youtubeLiveStatusStep4'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('youtubeLiveStatusStep5'))}</li>
        </ol>
        <div style="margin-top: 10px; padding: 10px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; font-size: 11px; color: #aaa;">
          ${escapeHtml(t('youtubeLiveStatusTip'))}
        </div>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: var(--text-accent); font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('backupTitle'))}</h4>
        <ol style="color: var(--text-primary); line-height: 1.8; padding-left: 20px; margin: 0;">
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
        <h4 style="color: var(--text-accent); font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('controlPanelTitle'))}</h4>
        <ol style="color: var(--text-primary); line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">${escapeHtml(t('controlPanelStep1'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('controlPanelStep2'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('controlPanelStep3'))}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(t('controlPanelStep4'))}</li>
        </ol>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: var(--text-accent); font-size: 16px; margin-bottom: 12px;">${escapeHtml(t('mobileTitle'))}</h4>
        <ol style="color: var(--text-primary); line-height: 1.8; padding-left: 20px; margin: 0;">
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
      background: var(--bg-input);
      border: 1px solid var(--border-color-hover);
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
  suggestionsDiv.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--text-secondary);">搜尋中...</div>';
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
            return [];
          })
      );
    }
    
    // YouTube 搜尋（RSS 無法搜尋頻道，已移除此功能）
    // 注意：RSS Feed 不提供搜尋功能，需要知道頻道 ID 才能使用
    
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
      
      // 頻道資訊
      const info = document.createElement('div');
      info.style.cssText = 'flex: 1; min-width: 0;';
      
      const name = document.createElement('div');
      name.style.cssText = 'font-weight: bold; color: var(--text-primary); margin-bottom: 2px;';
      let displayName = channel.displayName || channel.display_name || channel.title || channel.name || channel.login || '未知頻道';
      name.textContent = displayName;
      
      const details = document.createElement('div');
      details.style.cssText = 'font-size: 11px; color: var(--text-secondary);';
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
        item.style.background = 'var(--bg-button-hover)';
        favoriteSelectedSearchIndex = index;
        updateFavoriteSelectedSuggestion();
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'var(--bg-input)';
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
      item.style.background = 'var(--bg-button-hover)';
    } else {
      item.style.background = 'var(--bg-input)';
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
      // Twitch 使用頻道 URL，並在 URL 中添加 displayName 參數以便在 addToFavorites 時使用
      const twitchUrl = channel.url || `https://www.twitch.tv/${channel.login || channel.id}`;
      const displayName = channel.displayName || channel.display_name || channel.title || channel.name || channel.login || '';
      if (displayName) {
        // 將 displayName 作為 URL 參數傳遞，以便在 favoriteStreams.add 中使用
        const urlObj = new URL(twitchUrl);
        urlObj.searchParams.set('displayName', displayName);
        urlInput.value = urlObj.toString();
      } else {
        urlInput.value = twitchUrl;
      }
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

// 確保所有函數是全局的（統一在文件末尾導出，確保所有函數都已定義）
if (typeof window !== 'undefined') {
  // 收藏相關函數
  // window.showFavoriteStreamsManager = showFavoriteStreamsManager; // [已遷移到 React UI] 已註釋，不再導出
  try {
    window.addCurrentStreamToFavorites = addCurrentStreamToFavorites;
    window.refreshFavoriteStatus = refreshFavoriteStatus;
    window.updateFavoriteListDisplay = updateFavoriteListDisplay;
    window.updateFavoriteLiveStatuses = updateFavoriteLiveStatuses;
    window.startFavoriteLiveStatusAutoRefresh = startFavoriteLiveStatusAutoRefresh;
    window.stopFavoriteLiveStatusAutoRefresh = stopFavoriteLiveStatusAutoRefresh;
  } catch (e) {
    // 部分收藏相關函數未定義，跳過導出
  }
  
  // 版本紀錄和使用教學
  try {
    window.showVersionHistory = showVersionHistory;
    window.closeVersionHistory = closeVersionHistory;
    window.showUserGuide = showUserGuide;
    window.closeUserGuide = closeUserGuide;
  } catch (e) {
    // 部分版本/教學相關函數未定義，跳過導出
  }
  
  // YouTube API 工具
  try {
    window.youtubeApiUtils = youtubeApiUtils;
  } catch (e) {
    // youtubeApiUtils 未定義，跳過導出
  }
  
  // 暴露收藏系統到全局
  try {
    window.favoriteStreams = favoriteStreams;
    window.favoriteCategories = favoriteCategories;
    window.indexedDBBackup = indexedDBBackup;
  } catch (e) {
    // 收藏系統初始化失敗
  }
}

