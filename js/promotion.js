// 廣告管理功能

// 廣告配置管理
const adConfigManager = {
  // 獲取配置
  getConfig: () => {
    // 強制使用默認配置（廣告申請中，暫時關閉）
    // 如果需要啟用，可以通過控制台執行：adConfigManager.updateConfig({enabled: true})
    
    // 默認配置
    const defaultConfig = {
      enabled: false, // 關閉廣告功能
      showControlButtons: false, // 隱藏控制按鈕
      testMode: false, // 正式模式
      showInterval: 30 * 60 * 1000, // 30分鐘間隔
      displayDuration: {
        min: 1 * 60 * 1000, // 1分鐘
        max: 3 * 60 * 1000  // 3分鐘
      }
    };
    
    // 讀取已保存的配置
    const saved = localStorage.getItem('adConfig');
    if (saved) {
      const savedConfig = safeJSONParse(saved, null);
      if (savedConfig) {
        // 合併保存的配置和默認配置
        const mergedConfig = Object.assign({}, defaultConfig, savedConfig);
        // 強制使用正式模式（確保 testMode 始終為 false）
        mergedConfig.testMode = false;
        return mergedConfig;
      } else {
        // 載入廣告配置失敗：無效的 JSON 格式
      }
    }
    
    return defaultConfig;
  },
  
  // 保存配置
  saveConfig: (config) => {
    localStorage.setItem('adConfig', JSON.stringify(config));
  },
  
  // 更新配置
  updateConfig: (updates) => {
    const config = adConfigManager.getConfig();
    Object.assign(config, updates);
    adConfigManager.saveConfig(config);
    return config;
  }
};

// 廣告配置（從配置管理器獲取）
let adConfig = adConfigManager.getConfig();

// 廣告狀態
let adTimer = null;
let adDisplayTimer = null;
let isAdVisible = false;

// 初始化廣告系統
function initAdSystem() {
  // 重新載入配置
  adConfig = adConfigManager.getConfig();
  
  // 更新控制按鈕顯示狀態
  updateAdControlButtonsVisibility();
  
  // 如果廣告未啟用，不初始化
  if (!adConfig.enabled) {
    // 廣告功能已關閉
    updateAdEnabledButton(false);
    return;
  }
  
  // 更新按鈕狀態
  updateAdEnabledButton(true);
  updateAdTestModeButton(adConfig.testMode);
  
  // 檢查是否應該顯示廣告
  checkAndShowAd();
  
  // 設置定時檢查
  startAdTimer();
}

// 更新廣告控制按鈕的顯示/隱藏
function updateAdControlButtonsVisibility() {
  const adSection = document.getElementById('ad-control-section');
  if (adSection) {
    // 根據配置決定是否顯示（默認隱藏）
    const shouldShow = adConfig.showControlButtons === true;
    adSection.style.display = shouldShow ? 'block' : 'none';
  }
}

// 切換廣告控制按鈕顯示（開發者用）
function toggleAdControlButtons() {
  adConfig = adConfigManager.updateConfig({
    showControlButtons: !(adConfig.showControlButtons === true)
  });
  updateAdControlButtonsVisibility();
  // 廣告控制按鈕狀態已更新
}

// 檢查並顯示廣告
function checkAndShowAd() {
  // 如果廣告未啟用，不檢查
  if (!adConfig.enabled) {
    return;
  }
  
  // ★ 檢查是否有串流內容，如果沒有串流就不顯示廣告（符合 AdSense 政策）
  const hasStreams = document.querySelectorAll('.stream-box').length > 0;
  if (!hasStreams) {
    // 沒有串流內容，不顯示廣告（符合 AdSense 政策要求）
    // 重新設置定時器，等待有內容時再檢查
    startAdTimer();
    return;
  }
  
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
    // 廣告將在指定時間後顯示
  }
}

// 顯示廣告
function showAdBanner() {
  if (isAdVisible) return; // 如果已經顯示，不重複顯示
  
  // ★ 再次檢查是否有串流內容（符合 AdSense 政策要求）
  const hasStreams = document.querySelectorAll('.stream-box').length > 0;
  if (!hasStreams) {
    // 顯示廣告前檢查：沒有串流內容，取消顯示（符合 AdSense 政策要求）
    return;
  }
  
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
  
  // 觸發 AdSense 廣告載入
  try {
    if (typeof window.adsbygoogle !== 'undefined') {
      // 等待廣告容器顯示後再觸發 AdSense
      setTimeout(() => {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        // AdSense 廣告已觸發載入
      }, 300);
    }
  } catch (error) {
    // 觸發 AdSense 廣告時發生錯誤，靜默處理
  }
  
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
  
  // 廣告已顯示，將在指定時間後自動隱藏
  
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
  
  // 廣告已隱藏
  
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

// 切換廣告啟用狀態
function toggleAdEnabled() {
  adConfig = adConfigManager.updateConfig({
    enabled: !adConfig.enabled
  });
  
  updateAdEnabledButton(adConfig.enabled);
  
  if (adConfig.enabled) {
    // 廣告功能已啟用
    // 如果當前有廣告顯示，先隱藏
    if (isAdVisible) {
      hideAdBanner();
    }
    // 重新初始化
    initAdSystem();
  } else {
    // 廣告功能已關閉
    // 停止所有定時器
    if (adTimer) {
      clearTimeout(adTimer);
      adTimer = null;
    }
    if (adDisplayTimer) {
      clearTimeout(adDisplayTimer);
      adDisplayTimer = null;
    }
    // 隱藏當前顯示的廣告
    if (isAdVisible) {
      hideAdBanner();
    }
  }
}

// 切換測試模式
function toggleAdTestMode() {
  adConfig.testMode = !adConfig.testMode;
  
  if (adConfig.testMode) {
    // 測試模式：30秒間隔，顯示5-10秒
    adConfig.showInterval = 30 * 1000;
    adConfig.displayDuration.min = 5 * 1000;
    adConfig.displayDuration.max = 10 * 1000;
    // 廣告系統：已切換到測試模式
    updateAdTestModeButton(true);
  } else {
    // 正式模式：30分鐘間隔，顯示1-3分鐘
    adConfig.showInterval = 30 * 60 * 1000;
    adConfig.displayDuration.min = 1 * 60 * 1000;
    adConfig.displayDuration.max = 3 * 60 * 1000;
    // 廣告系統：已切換到正式模式
    updateAdTestModeButton(false);
  }
  
  // 保存配置
  adConfigManager.saveConfig(adConfig);
  
  // 重新啟動定時器
  if (adTimer) {
    clearTimeout(adTimer);
  }
  if (adConfig.enabled) {
    startAdTimer();
  }
}

// 更新廣告啟用按鈕狀態
function updateAdEnabledButton(isEnabled) {
  const btn = document.getElementById('ad-enabled-btn');
  if (btn) {
    if (isEnabled) {
      btn.textContent = '✅ 廣告（開）';
      btn.style.background = '#9147ff';
    } else {
      btn.textContent = '❌ 廣告（關）';
      btn.style.background = '#444';
    }
  }
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
  // 如果廣告未啟用，先啟用
  if (!adConfig.enabled) {
    if (confirm('廣告功能目前關閉，是否要啟用並顯示？')) {
      toggleAdEnabled();
    } else {
      return;
    }
  }
  
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
    // 觸發廣告時發生錯誤，靜默處理
    alert('觸發廣告時發生錯誤，請檢查控制台');
  }
}

// 確保函數在全局作用域中可用
if (typeof window !== 'undefined') {
  window.triggerAdManually = triggerAdManually;
  window.toggleAdTestMode = toggleAdTestMode;
  window.toggleAdEnabled = toggleAdEnabled;
  window.toggleAdControlButtons = toggleAdControlButtons; // 開發者用於顯示/隱藏控制按鈕
  window.closeAdBanner = closeAdBanner;
}

