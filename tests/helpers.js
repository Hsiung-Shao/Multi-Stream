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
  // 等待 JavaScript 載入完成
  await page.waitForFunction(() => typeof window.toggleControlPanel === 'function', { timeout: 5000 });
  // 檢查是否收起，如果是則展開
  const isCollapsed = await controlPanel.evaluate((el) => el.classList.contains('collapsed'));
  if (isCollapsed) {
    const collapsedToggle = page.locator('#control-panel-toggle-collapsed');
    if (await collapsedToggle.isVisible()) {
      await collapsedToggle.click();
      await page.waitForTimeout(500); // 等待動畫完成
    }
  }
}

/**
 * 等待頁面完全載入
 */
async function waitForPageLoad(page) {
  await page.goto('http://localhost:8000');
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
  const urlInput = page.locator('#url-input');
  const streamUrl = url || TEST_STREAMS.single;
  await urlInput.fill(streamUrl);
  await page.click('button:has-text("加入畫面")');
  await page.waitForTimeout(2000); // 等待串流載入
}

/**
 * 打開收藏管理界面
 */
async function openFavoriteManager(page) {
  await ensureControlPanelExpanded(page);
  const favoriteButton = page.locator('button:has-text("管理收藏")');
  await favoriteButton.click();
  await page.waitForTimeout(500);
  // 等待收藏管理界面出現
  const manager = page.locator('#favorite-streams-manager');
  await expect(manager).toBeVisible();
}

/**
 * 關閉收藏管理界面
 */
async function closeFavoriteManager(page) {
  const closeButton = page.locator('#favorite-streams-manager .close-btn, #favorite-streams-manager button:has-text("關閉")');
  if (await closeButton.isVisible()) {
    await closeButton.click();
    await page.waitForTimeout(300);
  }
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

module.exports = {
  ensureControlPanelExpanded,
  waitForPageLoad,
  clearAllStreams,
  addTestStream,
  openFavoriteManager,
  closeFavoriteManager,
  clearLocalStorage,
  clearIndexedDB,
  getLocalStorageValue,
  setLocalStorageValue,
};
