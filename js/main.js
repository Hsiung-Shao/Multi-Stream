// 主入口和初始化

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
  updateStreamOrderList();
  
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
  
  // 延遲讀取備份數據（頁面載入後）
  if (typeof localFileStorage !== 'undefined') {
    setTimeout(async () => {
      // 嘗試自動載入備份文件（如果已設置）
      await localFileStorage.autoLoadBackup();
    }, 1000);
  }
  
  // 初始化控制面板中的收藏列表顯示
  if (typeof updateFavoriteListDisplay === 'function') {
    setTimeout(() => {
      updateFavoriteListDisplay();
    }, 500);
  }
  
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
    warning.innerHTML = `
      <h3 style="margin: 0 0 15px 0;">⚠️ 連線警告</h3>
      <p style="margin: 0 0 15px 0; line-height: 1.6;">
        您正在使用 file:// 協議開啟網頁，這會導致 Twitch 和 YouTube 嵌入無法正常運作。
      </p>
      <p style="margin: 0 0 20px 0; line-height: 1.6; font-weight: bold;">
        請使用本地伺服器開啟，例如：<br>
        <code style="background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 4px;">http://localhost:8000</code>
      </p>
      <p style="margin: 0 0 15px 0; font-size: 12px; opacity: 0.9;">
        可以使用 Python: <code>python -m http.server 8000</code><br>
        或 Node.js: <code>npx http-server -p 8000</code>
      </p>
      <button onclick="this.parentElement.remove()" style="
        padding: 10px 20px;
        background: white;
        color: #ff4444;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
      ">我知道了</button>
    `;
    document.body.appendChild(warning);
  }
});

// 按 Enter 快速加入
document.getElementById('url-input').addEventListener('keypress', e => {
  if (e.key === 'Enter') addStream();
});

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

