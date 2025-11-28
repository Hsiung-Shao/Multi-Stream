// 用戶設置和收藏管理功能

// 本地文件系統存儲管理（使用 File System Access API 直接保存到固定文件）
const localFileStorage = {
  // 固定備份文件名
  backupFileName: 'multistream-backup.json',
  fileHandle: null, // 保存文件句柄，用於直接寫入文件
  
  // 檢查是否啟用備份
  isEnabled: () => {
    const enabled = localStorage.getItem('localBackupEnabled');
    if (enabled === null) {
      // 首次使用，默認關閉
      localStorage.setItem('localBackupEnabled', 'false');
      return false;
    }
    return enabled === 'true';
  },
  
  // 設置是否啟用備份
  setEnabled: (enabled) => {
    localStorage.setItem('localBackupEnabled', enabled ? 'true' : 'false');
    // 不自動請求文件句柄，讓用戶手動選擇
  },
  
  // 獲取當前文件路徑（用於顯示）
  getCurrentFilePath: () => {
    return localStorage.getItem('backupFilePath') || '未設置';
  },
  
  // 設置文件路徑（保存到 localStorage）
  setFilePath: (path) => {
    if (path) {
      localStorage.setItem('backupFilePath', path);
    } else {
      localStorage.removeItem('backupFilePath');
    }
  },
  
  // 請求文件句柄（打開現有文件或創建新文件）
  async requestFileHandle(createNew = false, autoImport = false) {
    if (!('showOpenFilePicker' in window) && !('showSaveFilePicker' in window)) {
      showSaveMessage('瀏覽器不支持文件系統 API');
      return false;
    }
    
    try {
      let fileHandle;
      
      if (createNew || !('showOpenFilePicker' in window)) {
        // 創建新文件
        fileHandle = await window.showSaveFilePicker({
          suggestedName: this.backupFileName,
          types: [{
            description: 'JSON 備份文件',
            accept: { 'application/json': ['.json'] }
          }]
        });
      } else {
        // 嘗試打開現有文件
        try {
          [fileHandle] = await window.showOpenFilePicker({
            types: [{
              description: 'JSON 備份文件',
              accept: { 'application/json': ['.json'] }
            }],
            multiple: false
          });
          
          // 如果設置了自動導入，則導入數據
          if (autoImport) {
            const result = await this.importDataFromFile(fileHandle);
            if (result.success) {
              showSaveMessage('備份文件已載入，頁面將重新載入');
              // 重新載入設置
              if (typeof loadUserSettings === 'function') {
                loadUserSettings();
              }
              // 重新載入頁面以確保所有設置生效
              setTimeout(() => {
                window.location.reload();
              }, 1500);
            } else {
              showSaveMessage(result.message);
            }
          }
        } catch (openError) {
          // 如果打開失敗（文件不存在），則創建新文件
          if (openError.name === 'AbortError') {
            return false;
          }
          fileHandle = await window.showSaveFilePicker({
            suggestedName: this.backupFileName,
            types: [{
              description: 'JSON 備份文件',
              accept: { 'application/json': ['.json'] }
            }]
          });
        }
      }
      
      this.fileHandle = fileHandle;
      // 保存文件路徑信息
      const file = await fileHandle.getFile();
      this.setFilePath(file.name);
      // 保存文件句柄標記
      await this.saveFileHandle();
      
      if (!autoImport) {
        showSaveMessage('備份文件位置已設置');
      }
      return true;
    } catch (e) {
      if (e.name === 'AbortError') {
        // 用戶取消了
        return false;
      }
      // 設置備份文件位置失敗，靜默處理
      showSaveMessage('設置備份文件位置失敗');
      return false;
    }
  },
  
  // 保存文件句柄到 IndexedDB
  async saveFileHandle() {
    if (!window.indexedDB) {
      // IndexedDB 不可用，無法持久化文件句柄
      return;
    }
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('MultiStreamFileHandle', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['handles'], 'readwrite');
        const store = transaction.objectStore('handles');
        // 文件句柄無法直接序列化，我們只保存標記
        store.put({ id: 'backup', enabled: true, timestamp: Date.now() });
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('handles')) {
          db.createObjectStore('handles', { keyPath: 'id' });
        }
      };
    });
  },
  
  // 從 IndexedDB 恢復文件句柄標記（文件句柄本身無法持久化）
  async restoreFileHandle() {
    // 文件句柄無法持久化，如果頁面刷新後需要重新選擇
    // 但我們可以檢查是否有標記，提示用戶重新選擇
    if (!window.indexedDB) return false;
    
    return new Promise((resolve) => {
      const request = indexedDB.open('MultiStreamFileHandle', 1);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('handles')) {
          resolve(false);
          return;
        }
        const transaction = db.transaction(['handles'], 'readonly');
        const store = transaction.objectStore('handles');
        const getRequest = store.get('backup');
        getRequest.onsuccess = () => {
          resolve(getRequest.result !== undefined);
        };
        getRequest.onerror = () => resolve(false);
      };
      request.onerror = () => resolve(false);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('handles')) {
          db.createObjectStore('handles', { keyPath: 'id' });
        }
      };
    });
  },
  
  // 自動備份所有數據到本地文件（直接寫入，不通過下載）
  async backup() {
    if (!this.isEnabled()) {
      return false; // 未啟用備份
    }
    
    // 如果沒有文件句柄，靜默失敗（不彈出對話框）
    if (!this.fileHandle) {
      // 備份失敗：未設置文件位置，請在設定中選擇文件位置
      return false; // 靜默失敗，不干擾用戶
    }
    
    try {
      const data = this.getAllData();
      const writable = await this.fileHandle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
      // 本地自動備份完成（直接保存）
      return true;
    } catch (e) {
      // 直接保存備份失敗，靜默處理
      // 如果權限被撤銷，清除文件句柄
      if (e.name === 'NotAllowedError' || e.name === 'NotFoundError') {
        this.fileHandle = null;
        this.setFilePath(null);
        // 不顯示錯誤消息，避免干擾用戶
      }
      return false;
    }
  },
  
  // 獲取所有數據
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
  
  // 從文件導入數據（內部使用）
  async importDataFromFile(fileHandle) {
    try {
      const file = await fileHandle.getFile();
      const text = await file.text();
      
      // 使用安全的 JSON 解析
      const data = safeJSONParse(text, null);
      if (!data) {
        return { success: false, message: '導入數據失敗：文件格式錯誤' };
      }
      
      try {
        
        // 驗證數據格式
        if (!data.version) {
          return { success: false, message: '無效的備份文件格式' };
        }
        
        // 導入數據
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
        
        return { success: true, message: '數據導入成功' };
      } catch (error) {
        // 導入數據失敗，靜默處理
        return { success: false, message: '導入數據失敗：文件格式錯誤' };
      }
    } catch (e) {
      // 讀取文件失敗，靜默處理
      return { success: false, message: '讀取文件失敗' };
    }
  },
  
  // 自動讀取備份文件（頁面載入時）
  async autoLoadBackup() {
    if (!this.isEnabled()) {
      return false; // 未啟用備份
    }
    
    const savedPath = this.getCurrentFilePath();
    if (savedPath === '未設置') {
      return false; // 沒有保存的文件路徑
    }
    
    // 文件句柄無法持久化，需要用戶重新選擇
    // 但我們可以提示用戶是否要自動載入
    // 檢測到已設置的備份文件路徑，請在設定中選擇文件位置以自動載入
    return false;
  }
};

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
  localFileStorage.setEnabled(enabled);
  
  if (enabled) {
    showSaveMessage('數據備份已啟用（請在下方設置文件位置）');
  } else {
    showSaveMessage('數據備份已關閉');
  }
  
  // 更新設定頁面顯示
  updateBackupSettingsDisplay();
}

// 設置備份文件位置（自動導入數據）
async function setBackupFileLocation() {
  const success = await localFileStorage.requestFileHandle(false, true); // false = 嘗試打開現有文件, true = 自動導入
  if (success) {
    updateBackupSettingsDisplay();
  }
}

// 創建新的備份文件
async function createNewBackupFile() {
  const success = await localFileStorage.requestFileHandle(true); // true = 創建新文件
  if (success) {
    updateBackupSettingsDisplay();
  }
}

// 更新備份設定顯示
function updateBackupSettingsDisplay() {
  const filePathDiv = document.getElementById('backup-file-path');
  if (filePathDiv) {
    const filePath = localFileStorage.getCurrentFilePath();
    filePathDiv.textContent = filePath;
    filePathDiv.style.color = filePath === '未設置' ? '#ffa500' : '#28a745';
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
  
  // 如果已啟用備份，自動備份
  if (localFileStorage.isEnabled()) {
    localFileStorage.backup().catch(() => {
      // 備份失敗，靜默處理
    }).then(() => {
      // 顯示保存消息（如果收藏管理界面打開）
      const manager = document.getElementById('favorite-streams-manager');
      if (manager && manager.classList.contains('show')) {
        showSaveMessage('資料已儲存');
      }
    });
  } else {
    // 即使未啟用備份，也顯示保存消息
    const manager = document.getElementById('favorite-streams-manager');
    if (manager && manager.classList.contains('show')) {
      showSaveMessage('資料已儲存');
    }
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
  },
  
  // 添加分類
  add: (name) => {
    const list = favoriteCategories.getList();
    
    // 檢查是否已存在
    if (list.some(cat => cat.name === name)) {
      return { success: false, message: '此分類已存在' };
    }
    
    const newCategory = {
      id: Date.now().toString(),
      name: name,
      createdAt: new Date().toISOString()
    };
    
    list.push(newCategory);
    favoriteCategories.saveList(list);
    
    return { success: true, message: '分類已添加', category: newCategory };
  },
  
  // 更新分類
  update: (id, newName) => {
    const list = favoriteCategories.getList();
    const category = list.find(cat => cat.id === id);
    
    if (!category) {
      return { success: false, message: '分類不存在' };
    }
    
    // 檢查新名稱是否與其他分類重複
    if (list.some(cat => cat.id !== id && cat.name === newName)) {
      return { success: false, message: '此分類名稱已存在' };
    }
    
    category.name = newName;
    favoriteCategories.saveList(list);
    
    return { success: true, message: '分類已更新' };
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
    
    return { success: true, message: '分類已移除' };
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
  },
  
  // 添加收藏
  add: (url, name = '', categoryId = null) => {
    const list = favoriteStreams.getList();
    
    // 檢查是否已存在
    if (list.some(item => item.url === url)) {
      return { success: false, message: '此串流已在收藏列表中' };
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
      }
    }
    
    if (!platform) {
      return { success: false, message: '無法解析串流網址' };
    }
    
    const newItem = {
      id: Date.now().toString(),
      url: url,
      name: name,
      platform: platform,
      channelId: channelId,
      videoId: videoId,
      categoryId: categoryId,
      addedAt: new Date().toISOString()
    };
    
    list.push(newItem);
    favoriteStreams.saveList(list);
    
    return { success: true, message: '已添加到收藏' };
  },
  
  // 更新收藏
  update: (id, updates) => {
    const list = favoriteStreams.getList();
    const item = list.find(fav => fav.id === id);
    
    if (!item) {
      return { success: false, message: '收藏不存在' };
    }
    
    // 更新字段
    if (updates.name !== undefined) item.name = updates.name;
    if (updates.categoryId !== undefined) item.categoryId = updates.categoryId;
    
    favoriteStreams.saveList(list);
    
    return { success: true, message: '收藏已更新' };
  },
  
  // 移除收藏
  remove: (id) => {
    const list = favoriteStreams.getList();
    const filtered = list.filter(item => item.id !== id);
    favoriteStreams.saveList(filtered);
    return { success: true, message: '已移除收藏' };
  },
  
  // 從收藏加載串流
  load: (item) => {
    if (item && item.url) {
      addStream(item.url);
      return { success: true };
    }
    return { success: false, message: '無效的收藏項目' };
  },
  
  // 批量加載收藏
  loadMultiple: (items) => {
    if (!items || items.length === 0) {
      return { success: false, message: '沒有可加載的收藏' };
    }
    
    items.forEach((item, index) => {
      setTimeout(() => {
        favoriteStreams.load(item);
      }, index * 300); // 每個串流間隔300毫秒加載
    });
    
    return { success: true, message: `正在加載 ${items.length} 個串流` };
  }
};

// 顯示收藏管理界面（使用全局变量保存筛选状态）
let currentCategoryFilter = null;

function showFavoriteStreamsManager() {
  const list = favoriteStreams.getList();
  const categories = favoriteCategories.getList();
  
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
      <h3>收藏管理</h3>
      <button onclick="closeFavoriteStreamsManager()" class="close-btn">×</button>
    </div>
    <div class="favorite-manager-content">
      <div class="favorite-tabs">
        <button class="tab-btn active" data-tab="favorites">收藏串流</button>
        <button class="tab-btn" data-tab="categories">分類管理</button>
        <button class="tab-btn" data-tab="settings">設定</button>
      </div>
      
      <!-- 收藏串流標籤頁 -->
      <div class="tab-content active" id="tab-favorites">
        <div class="favorite-controls">
          <div class="favorite-add-section">
            <input type="text" id="favorite-url-input" placeholder="貼上串流網址" style="flex: 1; padding: 6px; margin-right: 8px;">
            <input type="text" id="favorite-name-input" placeholder="自訂名稱（選填）" style="flex: 1; padding: 6px; margin-right: 8px;">
            <select id="favorite-category-select" style="padding: 6px; margin-right: 8px; background: #2a2a2a; border: 1px solid #444; color: #fff; border-radius: 4px;">
              <option value="">未分類</option>
  `;
  
  // 填充分類選擇器
  categories.forEach(cat => {
    content += `<option value="${cat.id}">${cat.name}</option>`;
  });
  
  content += `
            </select>
            <button onclick="addToFavorites()" style="padding: 6px 12px;">加入收藏</button>
          </div>
          <div class="favorite-filter-section">
            <select id="category-filter" style="padding: 6px; margin-right: 8px; background: #2a2a2a; border: 1px solid #444; color: #fff; border-radius: 4px;">
              <option value="">全部</option>
              <option value="null">未分類</option>
  `;
  
  // 填充分類篩選器
  categories.forEach(cat => {
    content += `<option value="${cat.id}">${cat.name}</option>`;
  });
  
  content += `
            </select>
            <button onclick="selectAllFavorites()" style="padding: 6px 12px; font-size: 11px;">全選</button>
            <button onclick="deselectAllFavorites()" style="padding: 6px 12px; font-size: 11px;">取消全選</button>
            <button onclick="loadSelectedFavorites()" style="padding: 6px 12px; font-size: 11px; background: #9147ff;">一鍵載入選中</button>
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
    content += '<div style="padding: 20px; text-align: center; color: #888;">暫無收藏</div>';
  } else {
    filteredList.forEach((item) => {
      // 转义所有用户输入以防止 XSS
      const safeDisplayName = escapeHtml(item.name || (item.platform === 'twitch' ? item.channelId : item.videoId));
      const platformIcon = item.platform === 'twitch' ? '🎮' : '📺';
      const safeCategoryName = escapeHtml(item.categoryId ? categories.find(c => c.id === item.categoryId)?.name || '未知分類' : '未分類');
      const safeItemId = escapeHtml(item.id);
      const safeItemUrl = escapeHtml(item.url);
      
      // 生成分類選項（转义）
      let categoryOptions = '<option value="">未分類</option>';
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
            <button class="save-favorite-btn" data-favorite-id="${safeItemId}" style="padding: 4px 8px; margin-right: 4px; background: #9147ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">保存</button>
            <button class="cancel-edit-btn" data-favorite-id="${safeItemId}" style="padding: 4px 8px; background: #444; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">取消</button>
          </div>
          <div class="favorite-item-actions">
            <button class="edit-favorite-btn" data-favorite-id="${safeItemId}" title="編輯">✏️</button>
            <button class="load-favorite-btn" data-favorite-id="${safeItemId}" title="載入">▶</button>
            <button class="remove-favorite-btn" data-favorite-id="${safeItemId}" title="移除">🗑</button>
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
          <input type="text" id="category-name-input" placeholder="分類名稱" style="flex: 1; padding: 6px; margin-right: 8px;">
          <button onclick="addCategory()" style="padding: 6px 12px;">新增分類</button>
        </div>
        <div class="category-list" id="category-list">
  `;
  
  if (categories.length === 0) {
    content += '<div style="padding: 20px; text-align: center; color: #888;">暫無分類</div>';
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
            <span class="category-item-count">(${count} 個收藏)</span>
          </div>
          <div class="category-item-actions">
            <button class="load-category-btn" data-category-id="${safeCatId}" title="一鍵載入此分類">▶ 載入</button>
            <button class="edit-category-btn" data-category-id="${safeCatId}" title="編輯">✏️</button>
            <button class="remove-category-btn" data-category-id="${safeCatId}" title="刪除">🗑</button>
          </div>
        </div>
      `;
    });
  }
  
  // 獲取備份功能狀態
  const backupEnabled = localFileStorage.isEnabled();
  
  content += `
        </div>
      </div>
      
      <!-- 設定標籤頁 -->
      <div class="tab-content" id="tab-settings">
        <div style="padding: 20px;">
          <div style="margin-bottom: 20px;">
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
              <input type="checkbox" id="backup-enabled-checkbox" ${backupEnabled ? 'checked' : ''} onchange="toggleBackupEnabled()" style="width: 18px; height: 18px; cursor: pointer;">
              <span style="font-size: 14px; color: #fff;">啟用數據自動備份</span>
            </label>
            <div style="margin-top: 8px; font-size: 12px; color: #ffa500; margin-left: 28px; padding: 8px; background: rgba(255, 165, 0, 0.1); border-radius: 4px; border-left: 3px solid #ffa500;">
              ⚠️ 啟用後，請在下方設置備份文件位置。之後每次編輯、新增或刪除收藏時會自動保存到該固定位置，不會觸發下載。
            </div>
          </div>
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #333;">
            <div style="margin-bottom: 12px;">
              <div style="font-size: 13px; color: #fff; margin-bottom: 8px;">備份文件位置：</div>
              <div id="backup-file-path" style="font-size: 12px; color: ${localFileStorage.getCurrentFilePath() === '未設置' ? '#ffa500' : '#28a745'}; margin-bottom: 8px; padding: 6px; background: rgba(255, 255, 255, 0.05); border-radius: 4px;">
                ${localFileStorage.getCurrentFilePath()}
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button onclick="setBackupFileLocation()" style="padding: 6px 12px; background: #28a745; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">選擇文件位置</button>
                <button onclick="createNewBackupFile()" style="padding: 6px 12px; background: #007bff; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">創建新文件</button>
              </div>
              <div style="margin-top: 6px; font-size: 11px; color: #aaa;">
                選擇文件位置：打開現有備份文件並自動載入數據<br>
                創建新文件：創建新的備份文件（不會載入數據）
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
    urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addToFavorites();
      }
    });
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
  
  if (!urlInput || !urlInput.value.trim()) {
    showSaveMessage('請輸入串流網址');
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
    // 自動保存設置
    autoSaveSettings();
    // 備份到本地文件
    if (localFileStorage.isEnabled()) {
      localFileStorage.backup().catch(() => {
        // 備份失敗，靜默處理
      });
    }
    showSaveMessage('資料已儲存');
  } else {
    showSaveMessage(result.message);
  }
}

// 添加分類
function addCategory() {
  const nameInput = document.getElementById('category-name-input');
  
  if (!nameInput || !nameInput.value.trim()) {
    showSaveMessage('請輸入分類名稱');
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
    // 備份到本地文件
    if (localFileStorage.isEnabled()) {
      localFileStorage.backup().catch(() => {
        // 備份失敗，靜默處理
      });
    }
    showSaveMessage('資料已儲存');
  } else {
    showSaveMessage(result.message);
  }
}

// 編輯分類
function editCategory(categoryId) {
  const categories = favoriteCategories.getList();
  const category = categories.find(c => c.id === categoryId);
  
  if (!category) {
    showSaveMessage('分類不存在');
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
              if (localFileStorage.isEnabled()) {
                localFileStorage.backup();
              }
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
    // 備份到本地文件
    if (localFileStorage.isEnabled()) {
      localFileStorage.backup().catch(() => {
        // 備份失敗，靜默處理
      });
    }
    showSaveMessage('資料已儲存');
  } else {
    showSaveMessage(result.message);
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
    showSaveMessage('收藏名稱不能為空');
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
    // 備份到本地文件
    if (localFileStorage.isEnabled()) {
      localFileStorage.backup().catch(() => {
        // 備份失敗，靜默處理
      });
    }
    showSaveMessage('資料已儲存');
  } else {
    showSaveMessage(result.message);
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
    showSaveMessage('請至少選擇一個收藏');
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
    showSaveMessage('此分類下沒有收藏');
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
  // 備份到本地文件
  if (localFileStorage.isEnabled()) {
    localFileStorage.backup();
  }
  showSaveMessage('資料已儲存');
}

// 更新控制面板中的收藏列表顯示
function updateFavoriteListDisplay() {
  const list = favoriteStreams.getList();
  const categories = favoriteCategories.getList();
  const filterSelect = document.getElementById('favorite-display-filter');
  const displayDiv = document.getElementById('favorite-list-display');
  
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
    allOption.textContent = '全部收藏';
    filterSelect.appendChild(allOption);
    const uncatOption = document.createElement('option');
    uncatOption.value = 'uncategorized';
    uncatOption.textContent = '未分類';
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
  
  // 如果選擇了分類，顯示一鍵載入按鈕
  if (filterValue && filterValue !== 'all' && filterValue !== 'uncategorized') {
    const category = categories.find(c => c.id === filterValue);
    const categoryItems = list.filter(item => item.categoryId === filterValue);
    
    if (categoryItems.length === 0) {
      displayDiv.innerHTML = '';
      const emptyDiv = document.createElement('div');
      emptyDiv.style.cssText = 'padding: 20px; text-align: center; color: #888; font-size: 12px;';
      emptyDiv.textContent = '此分類下沒有收藏';
      displayDiv.appendChild(emptyDiv);
      return;
    }
    
    displayDiv.innerHTML = '';
    const categoryDiv = document.createElement('div');
    categoryDiv.style.cssText = 'padding: 20px; text-align: center;';
    
    const categoryName = document.createElement('div');
    categoryName.style.cssText = 'font-size: 13px; color: #fff; margin-bottom: 12px;';
    categoryName.textContent = '📁 ' + (category ? escapeHtml(category.name) : '未知分類');
    
    const countDiv = document.createElement('div');
    countDiv.style.cssText = 'font-size: 11px; color: #aaa; margin-bottom: 16px;';
    countDiv.textContent = `共 ${categoryItems.length} 個收藏`;
    
    const loadBtn = document.createElement('button');
    loadBtn.style.cssText = 'padding: 8px 16px; background: #9147ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; width: 100%;';
    loadBtn.textContent = '一鍵載入此分類';
    loadBtn.onclick = () => loadCategoryFavoritesFromPanel(filterValue);
    
    categoryDiv.appendChild(categoryName);
    categoryDiv.appendChild(countDiv);
    categoryDiv.appendChild(loadBtn);
    displayDiv.appendChild(categoryDiv);
    return;
  }
  
  // 過濾收藏列表（全部或未分類）
  let filteredList = list;
  if (filterValue === 'uncategorized') {
    filteredList = list.filter(item => !item.categoryId);
  }
  
  // 生成列表（使用安全的 DOM 操作）
  displayDiv.innerHTML = '';
  
  if (filteredList.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.cssText = 'padding: 20px; text-align: center; color: #888; font-size: 12px;';
    emptyDiv.textContent = '暫無收藏';
    displayDiv.appendChild(emptyDiv);
    return;
  }
  
  const listContainer = document.createElement('div');
  listContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
  
  filteredList.forEach((item) => {
    const displayName = item.name || (item.platform === 'twitch' ? item.channelId : item.videoId);
    const platformIcon = item.platform === 'twitch' ? '🎮' : '📺';
    const categoryName = item.categoryId ? categories.find(c => c.id === item.categoryId)?.name || '未知分類' : '未分類';
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
    
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'flex: 1; min-width: 0;';
    
    const nameDiv = document.createElement('div');
    nameDiv.style.cssText = 'font-size: 12px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    nameDiv.textContent = escapeHtml(displayName);
    
    const categoryDiv = document.createElement('div');
    categoryDiv.style.cssText = 'font-size: 10px; color: #aaa;';
    categoryDiv.textContent = '📁 ' + escapeHtml(categoryName);
    
    contentDiv.appendChild(nameDiv);
    contentDiv.appendChild(categoryDiv);
    
    const arrowSpan = document.createElement('span');
    arrowSpan.style.cssText = 'font-size: 12px; color: #9147ff;';
    arrowSpan.textContent = '▶';
    
    itemDiv.appendChild(iconSpan);
    itemDiv.appendChild(contentDiv);
    itemDiv.appendChild(arrowSpan);
    
    listContainer.appendChild(itemDiv);
  });
  
  displayDiv.appendChild(listContainer);
}

// 確保函數是全局的
if (typeof window !== 'undefined') {
  window.updateFavoriteListDisplay = updateFavoriteListDisplay;
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
    showSaveMessage('目前沒有串流可以收藏');
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
              // 備份到本地文件
              if (localFileStorage.isEnabled()) {
                localFileStorage.backup();
              }
              showSaveMessage(`已成功收藏 ${addedCount} 個串流${skippedCount > 0 ? `，${skippedCount} 個已存在` : ''}`);
            } else if (skippedCount > 0) {
              showSaveMessage('所有串流都已在收藏列表中');
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

// 版本紀錄功能
function showVersionHistory() {
  // 檢查是否已經存在版本紀錄視窗
  let versionModal = document.getElementById('version-history-modal');
  if (versionModal) {
    versionModal.style.display = 'flex';
    return;
  }
  
  // 創建版本紀錄視窗
  versionModal = document.createElement('div');
  versionModal.id = 'version-history-modal';
  versionModal.className = 'favorite-streams-manager';
  versionModal.style.display = 'flex';
  
  // 版本紀錄內容
  const versionHistory = [
    {
      version: '1.3.0',
      date: '2025-11-28',
      changes: [
        '新增側邊聊天布局功能（雙欄版和四格版）',
        '雙欄聊天布局：左側視頻區域可自由調整布局，右側固定顯示兩個聊天室（左右排列）',
        '四格聊天布局：左側視頻區域可自由調整布局，右側固定顯示四個聊天室（2×2 網格排列）',
        '聊天室選擇器功能，無需調整串流順序即可快速切換要顯示的聊天室',
        '優化布局切換流暢度，一次點擊即可完成切換',
        '改進選擇器響應速度，減少延遲'
      ]
    },
    {
      version: '1.2.0',
      date: '2025-11-28',
      changes: [
        '新增本地文件備份功能',
        '改進收藏管理界面',
        '新增設定標籤頁',
        '優化安全性（XSS 防護）',
        '改進 YouTube 聊天室嵌入支援',
        '新增版本紀錄功能',
        '新增滑鼠懸停自動展開控制面板',
        '更新著作權資訊'
      ]
    },
    {
      version: '1.1.0',
      date: '2025-11-27',
      changes: [
        '新增分類管理功能',
        '改進控制面板 UI',
        '優化布局自動切換',
        '修復多個已知問題'
      ]
    },
    {
      version: '1.0.0',
      date: '2025-11-26',
      changes: [
        '初始版本發布',
        '支援 Twitch 和 YouTube 直播串流',
        '多種布局模式',
        '聊天室整合',
        '音量控制功能',
        '收藏功能'
      ]
    }
  ];
  
  // 構建版本紀錄 HTML
  let content = `
    <div class="favorite-manager-header">
      <h3>版本紀錄</h3>
      <button onclick="closeVersionHistory()" class="close-btn">×</button>
    </div>
    <div class="favorite-manager-content" style="max-height: 70vh; overflow-y: auto;">
  `;
  
  versionHistory.forEach((version, index) => {
    content += `
      <div style="margin-bottom: 24px; padding-bottom: 24px; border-bottom: ${index < versionHistory.length - 1 ? '1px solid #444' : 'none'};">
        <div style="display: flex; align-items: center; margin-bottom: 12px;">
          <h4 style="margin: 0; color: #9147ff; font-size: 18px;">版本 ${escapeHtml(version.version)}</h4>
          <span style="margin-left: 12px; color: #888; font-size: 12px;">${escapeHtml(version.date)}</span>
        </div>
        <ul style="margin: 0; padding-left: 20px; color: #ccc; line-height: 1.8;">
    `;
    
    version.changes.forEach(change => {
      content += `<li style="margin-bottom: 6px;">${escapeHtml(change)}</li>`;
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
  document.body.appendChild(versionModal);
  
  // 點擊外部關閉
  versionModal.addEventListener('click', (e) => {
    if (e.target === versionModal) {
      closeVersionHistory();
    }
  });
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
    return;
  }
  
  // 創建使用教學視窗
  guideModal = document.createElement('div');
  guideModal.id = 'user-guide-modal';
  guideModal.className = 'favorite-streams-manager';
  guideModal.style.display = 'flex';
  
  // 使用教學內容
  const guideContent = `
    <div class="favorite-manager-header">
      <h3>使用教學</h3>
      <button onclick="closeUserGuide()" class="close-btn">×</button>
    </div>
    <div class="favorite-manager-content" style="max-height: 70vh; overflow-y: auto; padding: 20px;">
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">📺 添加串流</h4>
        <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">在控制面板頂部的輸入框中，貼上 Twitch 或 YouTube 直播網址</li>
          <li style="margin-bottom: 8px;">點擊「加入畫面」按鈕</li>
          <li style="margin-bottom: 8px;">串流會自動載入並顯示在畫面上</li>
        </ol>
        <div style="margin-top: 10px; padding: 10px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; font-size: 11px; color: #aaa;">
          💡 <strong>提示：</strong>支援的網址格式包括：
          <br>• Twitch: https://www.twitch.tv/頻道名稱
          <br>• YouTube: https://www.youtube.com/watch?v=視頻ID 或 https://youtu.be/視頻ID
        </div>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">🎨 調整布局</h4>
        <div style="margin-bottom: 16px;">
          <h5 style="color: #aaa; font-size: 14px; margin-bottom: 8px;">基本布局</h5>
          <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
            <li style="margin-bottom: 8px;">在控制面板的「布局控制」區域，點擊布局預覽按鈕</li>
            <li style="margin-bottom: 8px;">可選擇：單一畫面、左右分割、上下分割、四宮格、上大下三、2×3 網格、3×3 網格</li>
            <li style="margin-bottom: 8px;">系統會根據串流數量自動選擇最適合的布局</li>
          </ol>
        </div>
        <div style="margin-top: 16px;">
          <h5 style="color: #aaa; font-size: 14px; margin-bottom: 8px;">側邊聊天布局（雙欄版 / 四格版）</h5>
          <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
            <li style="margin-bottom: 8px;">點擊「雙欄聊天布局」或「四格聊天布局」按鈕啟用側邊聊天布局</li>
            <li style="margin-bottom: 8px;">左側視頻區域可以使用布局按鈕（1-6、9）調整顯示方式</li>
            <li style="margin-bottom: 8px;">右側聊天室區域固定，不會隨視頻布局改變</li>
            <li style="margin-bottom: 8px;">每個聊天室面板都有下拉選擇器，可以選擇要顯示的串流聊天室</li>
            <li style="margin-bottom: 8px;">雙欄聊天布局：右側顯示兩個聊天室（左右排列）</li>
            <li style="margin-bottom: 8px;">四格聊天布局：右側顯示四個聊天室（2×2 網格排列）</li>
          </ol>
          <div style="margin-top: 10px; padding: 10px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; font-size: 11px; color: #aaa;">
            💡 <strong>提示：</strong>側邊聊天布局模式下，無需調整串流順序，直接從聊天室選擇器中選擇要顯示的串流即可
          </div>
        </div>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">💬 聊天室功能</h4>
        <div style="margin-bottom: 16px;">
          <h5 style="color: #aaa; font-size: 14px; margin-bottom: 8px;">基本模式</h5>
          <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
            <li style="margin-bottom: 8px;">點擊串流視窗中的聊天室按鈕（💬）顯示/隱藏聊天室</li>
            <li style="margin-bottom: 8px;">使用「顯示所有聊天室」按鈕一次性顯示所有聊天室</li>
            <li style="margin-bottom: 8px;">聊天室會自動嵌入到串流視窗中</li>
          </ol>
        </div>
        <div style="margin-top: 16px;">
          <h5 style="color: #aaa; font-size: 14px; margin-bottom: 8px;">側邊聊天布局模式（雙欄版 / 四格版）</h5>
          <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
            <li style="margin-bottom: 8px;">右側聊天室區域固定顯示，不會隨視頻布局改變</li>
            <li style="margin-bottom: 8px;">每個聊天室面板頂部都有下拉選擇器</li>
            <li style="margin-bottom: 8px;">從選擇器中選擇要顯示的串流聊天室</li>
            <li style="margin-bottom: 8px;">支援 Twitch 和 YouTube 聊天室嵌入</li>
            <li style="margin-bottom: 8px;">無需調整串流順序，直接選擇即可切換</li>
          </ol>
        </div>
        <div style="margin-top: 10px; padding: 10px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; font-size: 11px; color: #aaa;">
          ⚠️ <strong>注意：</strong>YouTube 聊天室需要在正式環境（非 localhost）才能嵌入
        </div>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">🔊 音量控制</h4>
        <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">使用「總音量」滑桿調整所有串流的音量</li>
          <li style="margin-bottom: 8px;">在「串流順序」列表中，調整單個串流的音量</li>
          <li style="margin-bottom: 8px;">點擊「全部靜音」快速靜音/取消靜音所有串流</li>
        </ol>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">⭐ 收藏功能</h4>
        <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">點擊「管理收藏」打開收藏管理界面</li>
          <li style="margin-bottom: 8px;">在「收藏串流」標籤頁中：
            <ul style="margin-top: 6px; padding-left: 20px;">
              <li>輸入串流網址和自訂名稱（選填）</li>
              <li>選擇分類（可選）</li>
              <li>點擊「加入收藏」</li>
            </ul>
          </li>
          <li style="margin-bottom: 8px;">在「分類管理」標籤頁中創建和管理分類</li>
          <li style="margin-bottom: 8px;">在控制面板的「收藏串流」區域：
            <ul style="margin-top: 6px; padding-left: 20px;">
              <li>使用下拉選單選擇「全部收藏」或「未分類」</li>
              <li>點擊列表中的串流名稱即可載入</li>
            </ul>
          </li>
        </ol>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">💾 數據備份</h4>
        <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">在「管理收藏」→「設定」標籤頁中啟用數據備份</li>
          <li style="margin-bottom: 8px;">點擊「選擇文件位置」選擇備份文件（會自動導入數據）</li>
          <li style="margin-bottom: 8px;">或點擊「創建新文件」創建新的備份文件</li>
          <li style="margin-bottom: 8px;">啟用後，每次修改收藏或分類時會自動保存</li>
        </ol>
        <div style="margin-top: 10px; padding: 10px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; font-size: 11px; color: #aaa;">
          💡 <strong>提示：</strong>頁面載入時會自動嘗試讀取備份文件
        </div>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">🎛️ 控制面板</h4>
        <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">控制面板位於畫面右側，可以收起/展開</li>
          <li style="margin-bottom: 8px;">點擊控制面板標題或右側的展開按鈕來展開/收起面板</li>
          <li style="margin-bottom: 8px;">如果沒有任何串流，控制面板會自動展開</li>
          <li style="margin-bottom: 8px;">在「串流順序」中可以拖曳調整串流順序</li>
        </ol>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h4 style="color: #9147ff; font-size: 16px; margin-bottom: 12px;">📱 移動設備</h4>
        <ol style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">在手機和平板上，控制面板會全屏顯示</li>
          <li style="margin-bottom: 8px;">所有按鈕和輸入框都已優化，適合觸摸操作</li>
          <li style="margin-bottom: 8px;">支援橫向和縱向模式</li>
        </ol>
      </div>
      
      <div style="margin-bottom: 20px; padding: 15px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; border-left: 3px solid #9147ff;">
        <h4 style="color: #9147ff; font-size: 14px; margin: 0 0 8px 0;">💡 快捷提示</h4>
        <ul style="color: #ccc; line-height: 1.8; padding-left: 20px; margin: 0; font-size: 12px;">
          <li>點擊「收藏當前」可以快速將當前顯示的串流加入收藏</li>
          <li>在收藏列表中，可以點擊分類名稱旁的「▶ 載入」按鈕一鍵載入整個分類的串流</li>
          <li>串流視窗可以拖曳調整大小和位置</li>
          <li>點擊串流視窗可以切換為活動狀態（紫色邊框）</li>
        </ul>
      </div>
    </div>
  `;
  
  guideModal.innerHTML = guideContent;
  document.body.appendChild(guideModal);
  
  // 點擊外部關閉
  guideModal.addEventListener('click', (e) => {
    if (e.target === guideModal) {
      closeUserGuide();
    }
  });
}

// 關閉使用教學
function closeUserGuide() {
  const guideModal = document.getElementById('user-guide-modal');
  if (guideModal) {
    guideModal.style.display = 'none';
  }
}

// 確保函數是全局的
if (typeof window !== 'undefined') {
  window.showUserGuide = showUserGuide;
  window.closeUserGuide = closeUserGuide;
}

