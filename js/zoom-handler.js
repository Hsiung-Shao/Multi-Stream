// 縮放處理和優化

// 檢測瀏覽器縮放比例
function getBrowserZoom() {
  let zoom = 1;
  
  // 方法 1: 使用 window.devicePixelRatio（最準確，包含系統縮放）
  // 注意：devicePixelRatio 已經包含了作業系統的 DPI 縮放
  if (window.devicePixelRatio) {
    zoom = window.devicePixelRatio;
  }
  
  // 方法 2: 使用 outerWidth/innerWidth（備用方法，檢測瀏覽器縮放）
  if (window.outerWidth && window.innerWidth && window.outerWidth > 0 && window.innerWidth > 0) {
    const zoomByWidth = window.outerWidth / window.innerWidth;
    // 如果這個值合理（0.1 到 10 之間），使用它
    if (zoomByWidth > 0.1 && zoomByWidth < 10) {
      // 但 devicePixelRatio 更準確，優先使用
      if (!window.devicePixelRatio || Math.abs(zoomByWidth - window.devicePixelRatio) > 0.5) {
        zoom = zoomByWidth;
      }
    }
  }
  
  // 方法 3: 使用 screen.width（備用方法）
  if (screen.width && window.innerWidth && screen.width > 0 && window.innerWidth > 0) {
    const zoomByScreen = screen.width / window.innerWidth;
    if (zoomByScreen > 0.1 && zoomByScreen < 10) {
      // 如果 devicePixelRatio 不存在，使用這個值
      if (!window.devicePixelRatio) {
        zoom = zoomByScreen;
      }
    }
  }
  
  return Math.round(zoom * 100) / 100; // 保留兩位小數
}

// 檢測作業系統縮放（DPI 縮放）
// 注意：devicePixelRatio 已經包含了系統縮放，所以這裡直接返回
function getSystemDPI() {
  if (window.devicePixelRatio) {
    return window.devicePixelRatio;
  }
  return 1;
}

// 計算實際縮放比例
// 注意：devicePixelRatio 已經包含了系統縮放，所以不需要再乘以 systemDPI
function getActualZoom() {
  // devicePixelRatio 已經包含了系統縮放和瀏覽器縮放的組合效果
  // 對於 200% 系統縮放，devicePixelRatio 通常是 2
  // 對於 175% 系統縮放，devicePixelRatio 通常是 1.75
  const zoom = getBrowserZoom();
  
  // 添加安全邊距，確保文字不會被擋住
  // 對於高縮放比例，增加額外的寬度緩衝
  let adjustedZoom = zoom;
  
  // 針對特定縮放比例進行優化
  if (zoom >= 1.7 && zoom <= 1.8) {
    // 175% 縮放：增加額外緩衝
    adjustedZoom = zoom * 1.1; // 增加 10% 緩衝
  } else if (zoom >= 1.9 && zoom <= 2.1) {
    // 200% 縮放：增加額外緩衝
    adjustedZoom = zoom * 1.15; // 增加 15% 緩衝
  } else if (zoom > 2.1) {
    // 超過 200% 的縮放：增加更多緩衝
    adjustedZoom = zoom * 1.2; // 增加 20% 緩衝
  } else if (zoom >= 1.2 && zoom <= 1.5) {
    // 125%-150% 縮放：增加少量緩衝
    adjustedZoom = zoom * 1.05; // 增加 5% 緩衝
  }
  
  return Math.round(adjustedZoom * 100) / 100;
}

// 根據縮放比例調整聊天室最小寬度
function adjustChatMinWidth() {
  const zoom = getActualZoom();
  
  // 基礎最小寬度（300px）
  const baseMinWidth = 300;
  
  // 根據縮放比例調整最小寬度
  // 縮放越大，需要的寬度越大
  let adjustedMinWidth = baseMinWidth * zoom;
  
  // 針對特定縮放比例進行精確調整
  // 確保在 175% 和 200% 縮放下有足夠的寬度
  if (zoom >= 1.7 && zoom <= 1.8) {
    // 175% 縮放：至少 550px（300 * 1.75 * 1.05 ≈ 551）
    adjustedMinWidth = Math.max(adjustedMinWidth, 550);
  } else if (zoom >= 1.9 && zoom <= 2.1) {
    // 200% 縮放：至少 690px（300 * 2 * 1.15 = 690）
    adjustedMinWidth = Math.max(adjustedMinWidth, 690);
  } else if (zoom > 2.1) {
    // 超過 200% 縮放：至少 720px（300 * 2.1 * 1.2 ≈ 756）
    adjustedMinWidth = Math.max(adjustedMinWidth, 720);
  }
  
  // 確保最小寬度不會太小
  adjustedMinWidth = Math.max(adjustedMinWidth, 300);
  
  // 計算最小高度（也需要根據縮放調整）
  const baseMinHeight = 200;
  let adjustedMinHeight = baseMinHeight * zoom;
  adjustedMinHeight = Math.max(adjustedMinHeight, 200);
  
  // 設置 CSS 變數
  document.documentElement.style.setProperty('--chat-min-width', `${Math.round(adjustedMinWidth)}px`);
  document.documentElement.style.setProperty('--chat-min-height', `${Math.round(adjustedMinHeight)}px`);
  
  // 為固定布局聊天室設置最小寬度
  document.documentElement.style.setProperty('--fixed-chat-min-width', `${Math.round(adjustedMinWidth)}px`);
  
  // 為分離聊天室設置最小寬度
  document.documentElement.style.setProperty('--separated-chat-min-width', `${Math.round(adjustedMinWidth)}px`);
  
  // 調試信息（開發時使用）
  if (window.console && window.console.log) {
    console.log(`[Zoom Handler] 檢測到縮放比例: ${zoom.toFixed(2)}x, 調整後聊天室最小寬度: ${Math.round(adjustedMinWidth)}px`);
  }
  
  return adjustedMinWidth;
}

// 初始化縮放處理
function initZoomHandler() {
  // 立即調整一次
  adjustChatMinWidth();
  
  // 監聽窗口大小變化（可能改變縮放）
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      adjustChatMinWidth();
    }, 100);
  });
  
  // 監聽縮放事件（某些瀏覽器支持）
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(resolution: 1dppx)');
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', () => {
        adjustChatMinWidth();
      });
    } else if (mediaQuery.addListener) {
      // 舊版瀏覽器
      mediaQuery.addListener(() => {
        adjustChatMinWidth();
      });
    }
  }
  
  // 定期檢查縮放變化（備用方法）
  setInterval(() => {
    adjustChatMinWidth();
  }, 1000);
}

// 獲取縮放比例（供其他模組使用）
function getZoomLevel() {
  return getActualZoom();
}

// 檢查是否需要調整聊天室寬度
function shouldAdjustChatWidth() {
  const zoom = getActualZoom();
  return zoom !== 1;
}

// 導出函數到全局
if (typeof window !== 'undefined') {
  window.getBrowserZoom = getBrowserZoom;
  window.getSystemDPI = getSystemDPI;
  window.getActualZoom = getActualZoom;
  window.adjustChatMinWidth = adjustChatMinWidth;
  window.initZoomHandler = initZoomHandler;
  window.getZoomLevel = getZoomLevel;
  window.shouldAdjustChatWidth = shouldAdjustChatWidth;
}

// 頁面載入時初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initZoomHandler);
} else {
  initZoomHandler();
}

