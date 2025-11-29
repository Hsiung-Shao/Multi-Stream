// 縮放處理和優化

// 檢測瀏覽器縮放比例
function getBrowserZoom() {
  let zoom = 1;
  
  // 方法 1: 使用 window.devicePixelRatio（最準確）
  if (window.devicePixelRatio) {
    zoom = window.devicePixelRatio;
  }
  
  // 方法 2: 使用 outerWidth/innerWidth（備用方法）
  if (window.outerWidth && window.innerWidth) {
    const zoomByWidth = window.outerWidth / window.innerWidth;
    if (zoomByWidth > 0 && zoomByWidth < 10) {
      zoom = zoomByWidth;
    }
  }
  
  // 方法 3: 使用 screen.width（備用方法）
  if (screen.width && window.innerWidth) {
    const zoomByScreen = screen.width / window.innerWidth;
    if (zoomByScreen > 0 && zoomByScreen < 10) {
      zoom = zoomByScreen;
    }
  }
  
  return Math.round(zoom * 100) / 100; // 保留兩位小數
}

// 檢測作業系統縮放（DPI 縮放）
function getSystemDPI() {
  if (window.devicePixelRatio) {
    return window.devicePixelRatio;
  }
  return 1;
}

// 計算實際縮放比例
function getActualZoom() {
  const browserZoom = getBrowserZoom();
  const systemDPI = getSystemDPI();
  return browserZoom * systemDPI;
}

// 根據縮放比例調整聊天室最小寬度
function adjustChatMinWidth() {
  const zoom = getActualZoom();
  
  // 基礎最小寬度（300px）
  const baseMinWidth = 300;
  
  // 根據縮放比例調整最小寬度
  // 縮放越大，需要的寬度越大
  const adjustedMinWidth = baseMinWidth * zoom;
  
  // 設置 CSS 變數
  document.documentElement.style.setProperty('--chat-min-width', `${adjustedMinWidth}px`);
  document.documentElement.style.setProperty('--chat-min-height', `${Math.max(200 * zoom, 200)}px`);
  
  // 為固定布局聊天室設置最小寬度
  document.documentElement.style.setProperty('--fixed-chat-min-width', `${adjustedMinWidth}px`);
  
  // 為分離聊天室設置最小寬度
  document.documentElement.style.setProperty('--separated-chat-min-width', `${adjustedMinWidth}px`);
  
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

