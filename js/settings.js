// 用戶設置和收藏管理功能

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
          try {
            return JSON.parse(savedPosition);
          } catch (e) {
            return null;
          }
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
      return autoSelectLayout();
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
  console.log('用戶設置已保存');
}

// 載入用戶設置
function loadUserSettings() {
  const saved = localStorage.getItem('userSettings');
  if (!saved) return;
  
  try {
    const settings = JSON.parse(saved);
    
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
    
    console.log('用戶設置已載入');
  } catch (e) {
    console.error('載入用戶設置失敗:', e);
  }
}

// 收藏串流管理
const favoriteStreams = {
  // 獲取收藏列表
  getList: () => {
    const saved = localStorage.getItem('favoriteStreams');
    return saved ? JSON.parse(saved) : [];
  },
  
  // 保存收藏列表
  saveList: (list) => {
    localStorage.setItem('favoriteStreams', JSON.stringify(list));
  },
  
  // 添加收藏
  add: (url, name = '') => {
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
      addedAt: new Date().toISOString()
    };
    
    list.push(newItem);
    favoriteStreams.saveList(list);
    
    return { success: true, message: '已添加到收藏' };
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
  }
};

// 顯示收藏管理界面
function showFavoriteStreamsManager() {
  const list = favoriteStreams.getList();
  
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
      <h3>收藏的串流</h3>
      <button onclick="closeFavoriteStreamsManager()" class="close-btn">×</button>
    </div>
    <div class="favorite-manager-content">
      <div class="favorite-add-section">
        <input type="text" id="favorite-url-input" placeholder="貼上串流網址" style="flex: 1; padding: 6px; margin-right: 8px;">
        <input type="text" id="favorite-name-input" placeholder="自訂名稱（選填）" style="flex: 1; padding: 6px; margin-right: 8px;">
        <button onclick="addToFavorites()" style="padding: 6px 12px;">加入收藏</button>
      </div>
      <div class="favorite-list" id="favorite-list">
  `;
  
  if (list.length === 0) {
    content += '<div style="padding: 20px; text-align: center; color: #888;">暫無收藏</div>';
  } else {
    list.forEach((item, index) => {
      const displayName = item.name || (item.platform === 'twitch' ? item.channelId : item.videoId);
      const platformIcon = item.platform === 'twitch' ? '🎮' : '📺';
      // 使用 data-* 属性和事件委托，避免闭包问题
      const itemId = item.id.replace(/'/g, "\\'"); // 转义单引号
      content += `
        <div class="favorite-item" data-id="${itemId}">
          <div class="favorite-item-info">
            <span class="favorite-platform-icon">${platformIcon}</span>
            <span class="favorite-item-name">${displayName}</span>
            <span class="favorite-item-url">${item.url}</span>
          </div>
          <div class="favorite-item-actions">
            <button class="load-favorite-btn" data-favorite-id="${itemId}" title="載入">▶</button>
            <button class="remove-favorite-btn" data-favorite-id="${itemId}" title="移除">🗑</button>
          </div>
        </div>
      `;
    });
  }
  
  content += `
      </div>
    </div>
  `;
  
  manager.innerHTML = content;
  manager.classList.add('show');
  
  // 使用事件委托处理按钮点击
  const favoriteList = manager.querySelector('.favorite-list');
  if (favoriteList) {
    favoriteList.addEventListener('click', (e) => {
      const target = e.target;
      if (target.classList.contains('load-favorite-btn')) {
        const favoriteId = target.getAttribute('data-favorite-id');
        if (favoriteId) {
          loadFavoriteStream(favoriteId);
        }
      } else if (target.classList.contains('remove-favorite-btn')) {
        const favoriteId = target.getAttribute('data-favorite-id');
        if (favoriteId) {
          removeFavoriteStream(favoriteId);
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
    // 自動聚焦
    setTimeout(() => {
      urlInput.focus();
    }, 100);
  }
  
  // 點擊背景關閉（事件委派）
  const handleBackgroundClick = (e) => {
    if (e.target === manager) {
      closeFavoriteStreamsManager();
    }
  };
  
  // 移除舊的事件監聽器（如果存在）
  manager.removeEventListener('click', handleBackgroundClick);
  // 添加新的事件監聽器
  manager.addEventListener('click', handleBackgroundClick);
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
  
  if (!urlInput || !urlInput.value.trim()) {
    alert('請輸入串流網址');
    return;
  }
  
  const url = urlInput.value.trim();
  const name = nameInput ? nameInput.value.trim() : '';
  
  const result = favoriteStreams.add(url, name);
  
  if (result.success) {
    alert(result.message);
    urlInput.value = '';
    if (nameInput) nameInput.value = '';
    showFavoriteStreamsManager(); // 刷新列表
    // 自動保存設置
    autoSaveSettings();
  } else {
    alert(result.message);
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
  if (confirm('確定要移除這個收藏嗎？')) {
    favoriteStreams.remove(id);
    showFavoriteStreamsManager(); // 刷新列表
    // 自動保存設置
    autoSaveSettings();
  }
}

// 收藏當前所有串流
function addCurrentStreamToFavorites() {
  const boxes = document.querySelectorAll('.stream-box');
  if (boxes.length === 0) {
    alert('目前沒有串流可以收藏');
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
        
        const result = favoriteStreams.add(data.originalUrl, customName);
        if (result.success) {
          addedCount++;
        } else {
          skippedCount++;
        }
        
        // 最後一個串流處理完後顯示結果
        if (index === boxes.length - 1) {
          setTimeout(() => {
            if (addedCount > 0) {
              alert(`已成功收藏 ${addedCount} 個串流${skippedCount > 0 ? `，${skippedCount} 個已存在於收藏列表` : ''}`);
              showFavoriteStreamsManager(); // 顯示管理界面
              // 自動保存設置
              autoSaveSettings();
            } else if (skippedCount > 0) {
              alert('所有串流都已在收藏列表中');
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

