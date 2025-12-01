// 測試輔助函數
const { expect } = require('@playwright/test');
const { TEST_STREAMS } = require('./test-data');

/**
 * 確保控制面板展開
 */
async function ensureControlPanelExpanded(page) {
  const controlPanel = page.locator('#control-panel');
  // 等待控制面板可見
  await expect(controlPanel).toBeVisible();
  // 等待 JavaScript 載入完成（已在 window 上暴露）
  await page.waitForFunction(() => typeof window.toggleControlPanel === 'function', { timeout: 5000 });
  // 檢查是否收起，如果是則展開
  const isCollapsed = await controlPanel.evaluate((el) => el.classList.contains('collapsed'));
  if (isCollapsed) {
    // 直接調用函數展開
    await page.evaluate(() => {
      if (typeof window.toggleControlPanel === 'function') {
        window.toggleControlPanel();
      }
    });
    await page.waitForTimeout(500); // 等待動畫完成
  }
}

/**
 * 收起控制面板（直接調用函數）
 */
async function collapseControlPanel(page) {
  // 等待 toggleControlPanel 函數可用
  await page.waitForFunction(() => typeof window.toggleControlPanel === 'function', { timeout: 10000 });
  
  // 直接調用函數收起（不檢查狀態，直接執行）
  await page.evaluate(() => {
    if (typeof window.toggleControlPanel === 'function') {
      window.toggleControlPanel();
    }
  });
  
  // 等待動畫完成並驗證控制面板確實被收起了
  await page.waitForFunction(() => {
    const panel = document.getElementById('control-panel');
    return panel && panel.classList.contains('collapsed');
  }, { timeout: 5000 });
  
  // 額外等待確保動畫完全完成
  await page.waitForTimeout(300);
}

/**
 * 等待頁面完全載入
 */
async function waitForPageLoad(page) {
  await page.goto('http://localhost');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000); // 等待 JavaScript 完全載入
  await ensureControlPanelExpanded(page);
}

/**
 * 清空所有串流
 */
async function clearAllStreams(page) {
  await page.evaluate(() => {
    if (typeof window.clearAll === 'function') {
      window.clearAll();
    }
  });
  await page.waitForTimeout(500);
}

/**
 * 添加測試串流
 */
async function addTestStream(page, url = null) {
  // 確保控制面板展開
  await ensureControlPanelExpanded(page);
  
  // 等待 addStream 函數可用（全局函數）
  await page.waitForFunction(() => typeof addStream === 'function', { timeout: 10000 });
  
  const streamUrl = url || TEST_STREAMS.single;
  
  // 方法1：直接調用 JavaScript 函數（最可靠）
  const initialStreamCount = await page.evaluate(() => {
    return document.querySelectorAll('.stream-box').length;
  });
  
  // 先設置輸入框的值（用於顯示）
  const urlInput = page.locator('#url-input');
  await urlInput.clear();
  await urlInput.fill(streamUrl);
  await page.waitForTimeout(200);
  
  // 直接調用 addStream 函數
  await page.evaluate((url) => {
    if (typeof addStream === 'function') {
      addStream(url);
    }
  }, streamUrl);
  
  await page.waitForTimeout(500); // 等待函數執行
  
  // 等待串流框出現（表示串流已添加）
  await page.waitForFunction((initialCount) => {
    const streamBoxes = document.querySelectorAll('.stream-box');
    return streamBoxes.length > initialCount;
  }, initialStreamCount, { timeout: 15000 });
  
  await page.waitForTimeout(1500); // 額外等待串流載入和初始化
}

/**
 * 打開收藏管理界面
 */
async function openFavoriteManager(page) {
  await ensureControlPanelExpanded(page);
  
  // 等待 showFavoriteStreamsManager 函數可用（全局函數）
  await page.waitForFunction(() => typeof showFavoriteStreamsManager === 'function', { timeout: 10000 });
  
  // 直接調用函數
  await page.evaluate(() => {
    if (typeof showFavoriteStreamsManager === 'function') {
      showFavoriteStreamsManager();
    }
  });
  
  await page.waitForTimeout(500);
  
  // 等待收藏管理界面出現
  const manager = page.locator('#favorite-streams-manager');
  await expect(manager).toBeVisible({ timeout: 5000 });
}

/**
 * 關閉收藏管理界面
 */
async function closeFavoriteManager(page) {
  // 直接調用函數關閉（全局函數）
  await page.evaluate(() => {
    if (typeof closeFavoriteStreamsManager === 'function') {
      closeFavoriteStreamsManager();
    }
  });
  await page.waitForTimeout(300);
}

/**
 * 清空 localStorage
 */
async function clearLocalStorage(page) {
  await page.evaluate(() => {
    localStorage.clear();
  });
}

/**
 * 清空 IndexedDB
 */
async function clearIndexedDB(page) {
  await page.evaluate(async () => {
    if (window.indexedDB) {
      const dbName = 'MultiStreamBackup';
      const deleteReq = indexedDB.deleteDatabase(dbName);
      await new Promise((resolve, reject) => {
        deleteReq.onsuccess = () => resolve();
        deleteReq.onerror = () => reject(deleteReq.error);
      });
    }
  });
}

/**
 * 獲取 localStorage 值
 */
async function getLocalStorageValue(page, key) {
  return await page.evaluate((k) => {
    return localStorage.getItem(k);
  }, key);
}

/**
 * 設置 localStorage 值
 */
async function setLocalStorageValue(page, key, value) {
  await page.evaluate(([k, v]) => {
    localStorage.setItem(k, v);
  }, [key, value]);
}

/**
 * 切換布局（直接調用函數）
 */
async function switchLayout(page, layoutType) {
  // 等待 setLayout 函數可用（已在 window 上暴露）
  await page.waitForFunction(() => typeof window.setLayout === 'function', { timeout: 10000 });
  
  // 直接調用 setLayout 函數
  await page.evaluate((type) => {
    if (typeof window.setLayout === 'function') {
      window.setLayout(type, true, true); // immediate=true, isUserSelection=true
    }
  }, layoutType);
  
  await page.waitForTimeout(500); // 等待布局切換完成
}

/**
 * 顯示所有聊天室（直接調用函數）
 */
async function toggleAllChats(page) {
  await page.waitForFunction(() => typeof window.toggleAllChats === 'function', { timeout: 10000 });
  
  await page.evaluate(() => {
    if (typeof window.toggleAllChats === 'function') {
      window.toggleAllChats();
    }
  });
  
  await page.waitForTimeout(500);
}

/**
 * 應用聊天室寬度（直接調用函數）
 */
async function applyChatWidth(page, width) {
  // 等待寬度輸入框出現並可見
  const widthInput = page.locator('#chat-width-input');
  await expect(widthInput).toBeVisible({ timeout: 5000 });
  
  // 滾動到視圖中確保可見
  await widthInput.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  
  // 設置輸入框值
  await widthInput.fill(width.toString());
  await page.waitForTimeout(200);
  
  // 直接調用函數
  await page.evaluate(() => {
    if (typeof window.applyChatWidth === 'function') {
      window.applyChatWidth();
    }
  });
  
  await page.waitForTimeout(500);
}

module.exports = {
  ensureControlPanelExpanded,
  collapseControlPanel,
  waitForPageLoad,
  clearAllStreams,
  addTestStream,
  openFavoriteManager,
  closeFavoriteManager,
  switchLayout,
  toggleAllChats,
  applyChatWidth,
  clearLocalStorage,
  clearIndexedDB,
  getLocalStorageValue,
  setLocalStorageValue,
};

