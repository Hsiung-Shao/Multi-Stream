// 主入口和初始化

// 全局變數
// 將 streamCount 直接定義在 window 上，以便其他模組訪問
window.streamCount = 0;
const container = document.getElementById('container');

// 布局更新防抖定時器
let layoutUpdateTimeout = null;
let pendingLayoutUpdate = false;
const players = {}; // 儲存播放器實例
const streamData = {}; // 儲存串流資訊

// 將全局變數暴露到全局作用域，以便其他模組訪問
window.players = players;
window.streamData = streamData;

// 頁面載入時檢查協議和恢復控制面板狀態
window.addEventListener('DOMContentLoaded', () => {


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
    // 增加延遲，確保 indexedDBBackup 已完全初始化
    setTimeout(async () => {
      try {
        // 確保數據庫已初始化
        if (!indexedDBBackup.db) {
          try {
            await indexedDBBackup.init();
          } catch (initError) {
            // 數據庫初始化失敗，繼續處理
          }
        }
        
        // 嘗試自動從 IndexedDB 恢復數據（如果 localStorage 沒有數據）
        const result = await indexedDBBackup.autoLoadBackup();
        
        if (result && result.success) {
          // 重新載入頁面以應用恢復的數據
          window.location.reload();
        }
      } catch (error) {
        // 自動載入備份時發生錯誤，繼續處理
      }
    }, 2000); // 增加延遲到 2 秒，確保所有模組都已載入
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
