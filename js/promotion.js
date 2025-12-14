// 廣告管理功能

// 廣告配置管理
const adConfigManager = {
  // 獲取配置
  getConfig: () => {
    // 廣告已啟用，設置較長間隔以減少對用戶體驗的影響
    
    // 默認配置
    const defaultConfig = {
      enabled: true, // 啟用廣告功能（用於 AdSense 審核）
      showControlButtons: false, // 隱藏控制按鈕
      testMode: false, // 正式模式
      showInterval: 2 * 60 * 60 * 1000, // 2小時間隔（減少對用戶體驗的影響）
      displayDuration: {
        min: 1 * 60 * 1000, // 1分鐘
        max: 2 * 60 * 1000  // 2分鐘
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
// 檢查 HTML 中是否已有靜態 AdSense 腳本（在 DOM 可用時檢查）
let adSenseScriptLoaded = (typeof document !== 'undefined' && document.querySelector('script[src*="adsbygoogle.js"]') !== null);
let adHTMLCreated = false; // 廣告 HTML 是否已創建

// 初始化廣告系統
function initAdSystem() {
  // 重新載入配置
  adConfig = adConfigManager.getConfig();
  
  // 檢查靜態腳本是否已載入（HTML 中的靜態腳本）
  if (!adSenseScriptLoaded) {
    adSenseScriptLoaded = document.querySelector('script[src*="adsbygoogle.js"]') !== null;
  }
  
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

// 動態載入 AdSense 腳本（僅在需要時載入，符合 AdSense 政策）
function loadAdSenseScript() {
  // 如果已經載入，直接返回
  if (adSenseScriptLoaded) {
    return Promise.resolve();
  }
  
  // 檢查是否已經存在腳本
  const existingScript = document.querySelector('script[src*="adsbygoogle.js"]');
  if (existingScript) {
    adSenseScriptLoaded = true;
    return Promise.resolve();
  }
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8415424787944153';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      adSenseScriptLoaded = true;
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Failed to load AdSense script'));
    };
    document.head.appendChild(script);
  });
}

// 動態創建廣告 HTML 結構（僅在需要時創建，符合 AdSense 政策）
function createAdHTML() {
  // 如果已經創建，直接返回
  if (adHTMLCreated) {
    const existingBanner = document.getElementById('ad-banner');
    if (existingBanner) {
      return existingBanner;
    }
  }
  
  // 檢查是否已經存在
  let adBanner = document.getElementById('ad-banner');
  if (adBanner) {
    adHTMLCreated = true;
    return adBanner;
  }
  
  // 創建廣告容器
  adBanner = document.createElement('div');
  adBanner.id = 'ad-banner';
  adBanner.className = 'ad-banner';
  
  // 創建廣告內容容器
  const adContent = document.createElement('div');
  adContent.className = 'ad-content';
  
  // 創建關閉按鈕
  const closeBtn = document.createElement('button');
  closeBtn.className = 'ad-close-btn';
  closeBtn.type = 'button';
  closeBtn.setAttribute('title', '關閉廣告');
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', '關閉廣告');
  // 使用事件監聽器而不是 onclick（更可靠）
  closeBtn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    console.log('關閉按鈕被點擊');
    if (typeof closeAdBanner === 'function') {
      closeAdBanner();
    } else {
      console.error('closeAdBanner 函數不存在');
    }
  }, false);
  
  // 創建廣告主體
  const adBody = document.createElement('div');
  adBody.className = 'ad-body';
  
  // 創建 AdSense 廣告單元
  const adUnit = document.createElement('ins');
  adUnit.className = 'adsbygoogle';
  // 設置基本樣式，確保有初始寬度和高度
  adUnit.style.cssText = 'display:block;margin:0 auto;width:100%;min-height:90px;';
  adUnit.setAttribute('data-ad-client', 'ca-pub-8415424787944153');
  adUnit.setAttribute('data-ad-slot', '2327980476');
  adUnit.setAttribute('data-ad-format', 'auto');
  adUnit.setAttribute('data-full-width-responsive', 'true');
  
  // 組裝結構
  adBody.appendChild(adUnit);
  adContent.appendChild(closeBtn);
  adContent.appendChild(adBody);
  adBanner.appendChild(adContent);
  
  // 添加到頁面
  document.body.appendChild(adBanner);
  
  adHTMLCreated = true;
  return adBanner;
}

// 移除廣告 HTML 結構（當廣告關閉時可選移除）
function removeAdHTML() {
  const adBanner = document.getElementById('ad-banner');
  if (adBanner) {
    adBanner.remove();
    adHTMLCreated = false;
  }
}

// 移除 AdSense 腳本（當廣告關閉時移除，符合 AdSense 政策）
function removeAdSenseScript() {
  const script = document.querySelector('script[src*="adsbygoogle.js"]');
  if (script) {
    script.remove();
    adSenseScriptLoaded = false;
  }
}

// 檢查是否有有效的發布商內容
function hasValidPublisherContent() {
  // 1. 檢查是否有初始發布商內容（符合 AdSense 政策：頁面始終有發布商內容）
  const initialContent = document.getElementById('initial-content');
  if (initialContent) {
    // 檢查初始內容是否可見（沒有被隱藏）
    const computedStyle = window.getComputedStyle(initialContent);
    if (computedStyle.opacity !== '0' && computedStyle.visibility !== 'hidden') {
      // 初始發布商內容存在且可見，視為有效的發布商內容
      return true;
    }
  }
  
  // 2. 檢查是否有串流內容
  const streamBoxes = document.querySelectorAll('.stream-box');
  if (streamBoxes.length === 0) {
    return false;
  }
  
  // 3. 檢查串流是否真的載入成功（不僅僅是 DOM 元素存在）
  let hasValidStream = false;
  const players = window.players || {};
  const streamData = window.streamData || {};
  
  streamBoxes.forEach(box => {
    const streamId = parseInt(box.dataset.streamId);
    if (streamId && streamData[streamId]) {
      // 檢查是否有播放器實例
      const player = players[streamId];
      if (player) {
        hasValidStream = true;
      }
      // 或者檢查是否有 iframe（YouTube/Twitch 播放器）
      const iframe = box.querySelector('iframe');
      if (iframe && iframe.src) {
        hasValidStream = true;
      }
    }
  });
  
  return hasValidStream;
}

// 檢查並顯示廣告
function checkAndShowAd() {
  // 如果廣告未啟用，不檢查
  if (!adConfig.enabled) {
    return;
  }
  
  // ★ 嚴格檢查是否有有效的發布商內容（符合 AdSense 政策）
  if (!hasValidPublisherContent()) {
    // 沒有有效的發布商內容，不顯示廣告（符合 AdSense 政策要求）
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
async function showAdBanner() {
  if (isAdVisible) return; // 如果已經顯示，不重複顯示
  
  // ★ 再次嚴格檢查是否有有效的發布商內容（符合 AdSense 政策要求）
  if (!hasValidPublisherContent()) {
    // 顯示廣告前檢查：沒有有效的發布商內容，取消顯示（符合 AdSense 政策要求）
    return;
  }
  
  // 動態創建廣告 HTML（如果尚未創建）
  const adBanner = createAdHTML();
  const container = document.getElementById('container');
  if (!adBanner) return;
  
  // 動態載入 AdSense 腳本（如果尚未載入）
  try {
    await loadAdSenseScript();
  } catch (error) {
    // 載入 AdSense 腳本失敗，不顯示廣告
    return;
  }
  
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
  // 先設置 visibility 和 opacity，再添加 show class
  adBanner.style.visibility = 'visible';
  adBanner.style.opacity = '1';
  adBanner.style.pointerEvents = 'auto';
  adBanner.classList.add('show');
  
  // 延遲觸發 AdSense 廣告載入，確保區域完全生成後才發送
  // 等待 transition 動畫完成（300ms）+ 額外緩衝確保 DOM 完全渲染
  setTimeout(() => {
    try {
      if (typeof window.adsbygoogle !== 'undefined') {
        // 確保容器已完全可見且有實際尺寸
        const rect = adBanner.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          // 獲取廣告單元並觸發
          // 只獲取尚未處理的廣告單元（避免重複觸發）
          const adUnits = adBanner.querySelectorAll('.adsbygoogle:not([data-adsbygoogle-status])');
          
          if (adUnits.length > 0) {
            adUnits.forEach(unit => {
              // 再次檢查單元是否有實際尺寸，並且是可見的
              const unitRect = unit.getBoundingClientRect();
              const computedStyle = window.getComputedStyle(unit);
              const parentRect = unit.parentElement ? unit.parentElement.getBoundingClientRect() : { width: 0 };
              
              const isVisible = computedStyle.display !== 'none' && 
                                computedStyle.visibility !== 'hidden' &&
                                computedStyle.opacity !== '0' &&
                                parentRect.width > 0;
              
              // 嚴格檢查：必須有實際尺寸才觸發
              if (unitRect.width > 200 && unitRect.height > 50 && isVisible) {
                try {
                  (window.adsbygoogle = window.adsbygoogle || []).push({});
                  console.log(`AdSense 廣告已觸發載入 (尺寸: ${Math.round(unitRect.width)}x${Math.round(unitRect.height)})`);
                } catch (e) {
                  console.error('觸發 AdSense 時發生錯誤:', e);
                }
              } else {
                console.log(`廣告單元尺寸不足: width=${Math.round(unitRect.width)}, height=${Math.round(unitRect.height)}`);
              }
            });
          } else {
            console.log('沒有找到未處理的廣告單元');
          }
        } else {
          console.log(`廣告容器尺寸不足: width=${rect.width}, height=${rect.height}`);
        }
      }
    } catch (error) {
      console.error('觸發 AdSense 廣告時發生錯誤:', error);
    }
  }, 400); // 等待 transition 完成（300ms）+ 額外 100ms 確保 DOM 完全渲染
  
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
  const adBanner = document.getElementById('ad-banner');
  const container = document.getElementById('container');
  
  if (!adBanner) {
    console.log('hideAdBanner: 廣告容器不存在');
    return;
  }
  
  // 即使 isAdVisible 為 false，也嘗試隱藏（確保 UI 狀態正確）
  isAdVisible = false;
  
  // 移除 show class 觸發隱藏動畫
  adBanner.classList.remove('show');
  
  // 強制確保隱藏狀態（防止樣式覆蓋）
  adBanner.style.transform = 'translateY(100%)';
  adBanner.style.pointerEvents = 'none';
  
  // 等待動畫完成後完全刪除區塊
  setTimeout(() => {
    // 恢復容器高度
    if (container) {
      container.classList.remove('has-ad');
      container.style.paddingBottom = '';
      container.style.height = '';
    }
    
    // 完全刪除廣告區塊
    adBanner.remove();
    adHTMLCreated = false;
    
    console.log('廣告區塊已刪除');
  }, 300); // 等待 transition 完成（300ms）
  
  // 清除顯示定時器
  if (adDisplayTimer) {
    clearTimeout(adDisplayTimer);
    adDisplayTimer = null;
  }
  
  console.log('廣告已隱藏');
  
  // 重新啟動定時器（僅當廣告啟用時）
  if (adConfig && adConfig.enabled) {
    startAdTimer();
  }
}

// 手動關閉廣告
function closeAdBanner() {
  console.log('closeAdBanner 被調用');
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
    // 移除廣告 HTML 結構和腳本（符合 AdSense 政策：未啟用時不應有廣告代碼）
    removeAdHTML();
    removeAdSenseScript();
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

// 測試廣告顯示（跳過內容檢查，僅用於測試）
function testAdDisplay() {
  // 確保廣告已啟用
  if (!adConfig.enabled) {
    adConfig = adConfigManager.updateConfig({ enabled: true });
  }
  
  // 直接創建廣告 HTML（如果尚未創建）
  const adBanner = createAdHTML();
  if (!adBanner) {
    console.error('無法創建廣告容器');
    return;
  }
  
  // 動態載入 AdSense 腳本（如果尚未載入）
  loadAdSenseScript().then(() => {
    // 顯示廣告
    isAdVisible = true;
    // 先設置 visibility 和 opacity，再添加 show class
    adBanner.style.visibility = 'visible';
    adBanner.style.opacity = '1';
    adBanner.style.pointerEvents = 'auto';
    adBanner.classList.add('show');
    
    // 延遲觸發 AdSense 廣告載入，確保區域完全生成後才發送
    // 等待 transition 動畫完成（300ms）+ 額外緩衝確保 DOM 完全渲染
    setTimeout(() => {
      try {
        if (typeof window.adsbygoogle !== 'undefined') {
          // 確保容器已完全可見且有實際尺寸
          const rect = adBanner.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            // 獲取廣告單元並觸發
            // 只獲取尚未處理的廣告單元（避免重複觸發）
            const adUnits = adBanner.querySelectorAll('.adsbygoogle:not([data-adsbygoogle-status])');
            
            if (adUnits.length > 0) {
              adUnits.forEach(unit => {
                // 再次檢查單元是否有實際尺寸，並且是可見的
                const unitRect = unit.getBoundingClientRect();
                const computedStyle = window.getComputedStyle(unit);
                const parentRect = unit.parentElement ? unit.parentElement.getBoundingClientRect() : { width: 0 };
                
                const isVisible = computedStyle.display !== 'none' && 
                                  computedStyle.visibility !== 'hidden' &&
                                  computedStyle.opacity !== '0' &&
                                  parentRect.width > 0;
                
                // 嚴格檢查：必須有實際尺寸才觸發
                if (unitRect.width > 200 && unitRect.height > 50 && isVisible) {
                  try {
                    (window.adsbygoogle = window.adsbygoogle || []).push({});
                    console.log(`AdSense 廣告已觸發載入 (尺寸: ${Math.round(unitRect.width)}x${Math.round(unitRect.height)})`);
                  } catch (e) {
                    console.error('觸發 AdSense 時發生錯誤:', e);
                  }
                } else {
                  console.log(`廣告單元尺寸不足: width=${Math.round(unitRect.width)}, height=${Math.round(unitRect.height)}`);
                }
              });
              console.log('廣告已顯示（測試模式）');
            } else {
              console.log('沒有找到未處理的廣告單元');
            }
          } else {
            console.log(`廣告容器尺寸不足: width=${rect.width}, height=${rect.height}`);
          }
        }
      } catch (error) {
        console.error('觸發 AdSense 廣告時發生錯誤:', error);
      }
    }, 400); // 等待 transition 完成（300ms）+ 額外 100ms 確保 DOM 完全渲染
  }).catch((error) => {
    console.error('載入 AdSense 腳本失敗:', error);
    // 即使腳本載入失敗，也顯示容器結構
    isAdVisible = true;
    adBanner.classList.add('show');
    console.log('廣告容器已顯示（AdSense 腳本載入失敗）');
  });
}

// 確保函數在全局作用域中可用
if (typeof window !== 'undefined') {
  window.triggerAdManually = triggerAdManually;
  window.toggleAdTestMode = toggleAdTestMode;
  window.toggleAdEnabled = toggleAdEnabled;
  window.toggleAdControlButtons = toggleAdControlButtons; // 開發者用於顯示/隱藏控制按鈕
  window.closeAdBanner = closeAdBanner;
  window.testAdDisplay = testAdDisplay; // 測試函數（跳過內容檢查）
  
  // 確保在腳本載入時函數就已可用（即使 DOM 未準備好）
}

