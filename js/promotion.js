// 廣告管理功能

// 廣告配置
const adConfig = {
  // 測試模式：縮短間隔以便測試
  testMode: true,
  // 顯示間隔（毫秒）：測試模式30秒，正式模式30分鐘
  showInterval: 30 * 1000, // 測試：30秒，正式：30 * 60 * 1000
  // 顯示持續時間範圍（毫秒）：測試模式5-10秒，正式模式1-3分鐘
  displayDuration: {
    min: 5 * 1000,  // 測試：5秒，正式：1 * 60 * 1000
    max: 10 * 1000  // 測試：10秒，正式：3 * 60 * 1000
  }
};

// 廣告狀態
let adTimer = null;
let adDisplayTimer = null;
let isAdVisible = false;

// 初始化廣告系統
function initAdSystem() {
  // 檢查是否應該顯示廣告
  checkAndShowAd();
  
  // 設置定時檢查
  startAdTimer();
  
  // 更新測試模式按鈕狀態
  updateAdTestModeButton(adConfig.testMode);
}

// 檢查並顯示廣告
function checkAndShowAd() {
  const now = Date.now();
  const lastShown = localStorage.getItem('adLastShown');
  const lastShownTime = lastShown ? parseInt(lastShown) : 0;
  const timeSinceLastShow = now - lastShownTime;
  
  // 如果距離上次顯示已經超過間隔時間，則顯示廣告
  if (timeSinceLastShow >= adConfig.showInterval) {
    showAdBanner();
  } else {
    // 計算下次顯示時間
    const timeUntilNextShow = adConfig.showInterval - timeSinceLastShow;
    console.log(`廣告將在 ${Math.round(timeUntilNextShow / 1000)} 秒後顯示`);
  }
}

// 顯示廣告
function showAdBanner() {
  if (isAdVisible) return; // 如果已經顯示，不重複顯示
  
  const adBanner = document.getElementById('ad-banner');
  const container = document.getElementById('container');
  if (!adBanner) return;
  
  isAdVisible = true;
  
  // 先調整容器高度（在顯示動畫之前）
  if (container) {
    container.classList.add('has-ad');
    // 先設置一個預估高度，然後在動畫後獲取實際高度
    const estimatedHeight = 200; // 預估高度
    container.style.paddingBottom = estimatedHeight + 'px';
    container.style.height = `calc(100vh - ${estimatedHeight}px)`;
  }
  
  // 顯示廣告
  adBanner.classList.add('show');
  
  // 等待動畫開始後獲取實際高度並調整
  setTimeout(() => {
    if (container && isAdVisible) {
      const adHeight = adBanner.offsetHeight || 200;
      container.style.paddingBottom = adHeight + 'px';
      container.style.height = `calc(100vh - ${adHeight}px)`;
    }
  }, 100);
  
  // 記錄顯示時間
  localStorage.setItem('adLastShown', Date.now().toString());
  
  // 隨機生成顯示持續時間（在min和max之間）
  const duration = adConfig.displayDuration.min + 
    Math.random() * (adConfig.displayDuration.max - adConfig.displayDuration.min);
  
  console.log(`廣告已顯示，將在 ${Math.round(duration / 1000)} 秒後自動隱藏`);
  
  // 設置自動隱藏定時器
  adDisplayTimer = setTimeout(() => {
    hideAdBanner();
  }, duration);
}

// 隱藏廣告
function hideAdBanner() {
  if (!isAdVisible) return;
  
  const adBanner = document.getElementById('ad-banner');
  const container = document.getElementById('container');
  if (!adBanner) return;
  
  isAdVisible = false;
  adBanner.classList.remove('show');
  
  // 恢復容器高度
  if (container) {
    container.classList.remove('has-ad');
    container.style.paddingBottom = '';
    container.style.height = '';
  }
  
  // 清除顯示定時器
  if (adDisplayTimer) {
    clearTimeout(adDisplayTimer);
    adDisplayTimer = null;
  }
  
  console.log('廣告已隱藏');
  
  // 重新啟動定時器
  startAdTimer();
}

// 手動關閉廣告
function closeAdBanner() {
  hideAdBanner();
  
  // 記錄關閉時間（用於統計，可選）
  localStorage.setItem('adLastClosed', Date.now().toString());
}

// 啟動廣告定時器
function startAdTimer() {
  // 清除舊的定時器
  if (adTimer) {
    clearTimeout(adTimer);
  }
  
  // 設置新的定時器，在間隔時間後檢查並顯示廣告
  adTimer = setTimeout(() => {
    checkAndShowAd();
  }, adConfig.showInterval);
}

// 切換測試模式
function toggleAdTestMode() {
  adConfig.testMode = !adConfig.testMode;
  
  if (adConfig.testMode) {
    // 測試模式：30秒間隔，顯示5-10秒
    adConfig.showInterval = 30 * 1000;
    adConfig.displayDuration.min = 5 * 1000;
    adConfig.displayDuration.max = 10 * 1000;
    console.log('廣告系統：已切換到測試模式（30秒間隔，顯示5-10秒）');
    updateAdTestModeButton(true);
  } else {
    // 正式模式：30分鐘間隔，顯示1-3分鐘
    adConfig.showInterval = 30 * 60 * 1000;
    adConfig.displayDuration.min = 1 * 60 * 1000;
    adConfig.displayDuration.max = 3 * 60 * 1000;
    console.log('廣告系統：已切換到正式模式（30分鐘間隔，顯示1-3分鐘）');
    updateAdTestModeButton(false);
  }
  
  // 重新啟動定時器
  if (adTimer) {
    clearTimeout(adTimer);
  }
  startAdTimer();
}

// 更新測試模式按鈕文字
function updateAdTestModeButton(isTestMode) {
  const btn = document.getElementById('ad-test-mode-btn');
  if (btn) {
    if (isTestMode) {
      btn.textContent = '🔄 測試模式（開）';
      btn.style.background = '#9147ff';
    } else {
      btn.textContent = '🔄 測試模式（關）';
      btn.style.background = '';
    }
  }
}

// 手動觸發廣告顯示（用於測試）
function triggerAdManually() {
  try {
    // 如果廣告正在顯示，先隱藏
    if (isAdVisible) {
      hideAdBanner();
      // 等待隱藏動畫完成後再顯示
      setTimeout(() => {
        showAdBanner();
      }, 600);
    } else {
      // 清除上次顯示時間，強制立即顯示
      localStorage.removeItem('adLastShown');
      showAdBanner();
    }
  } catch (error) {
    console.error('觸發廣告時發生錯誤:', error);
    alert('觸發廣告時發生錯誤，請檢查控制台');
  }
}

// 確保函數在全局作用域中可用
if (typeof window !== 'undefined') {
  window.triggerAdManually = triggerAdManually;
  window.toggleAdTestMode = toggleAdTestMode;
  window.closeAdBanner = closeAdBanner;
}

