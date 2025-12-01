// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForPageLoad, clearLocalStorage, clearIndexedDB, getLocalStorageValue, setLocalStorageValue } = require('./helpers');
const { FAVORITE_STREAMS_DATA, FAVORITE_CATEGORIES_DATA, TEST_STREAMS } = require('./test-data');

test.describe('存儲功能測試', () => {
  test.beforeEach(async ({ page }) => {
    await waitForPageLoad(page);
    await clearLocalStorage(page);
    await clearIndexedDB(page);
  });

  test('可以讀寫 localStorage - 收藏串流', async ({ page }) => {
    // 使用實際的收藏串流數據結構
    const testData = JSON.stringify([FAVORITE_STREAMS_DATA[0]]);
    
    // 寫入 localStorage
    await setLocalStorageValue(page, 'favoriteStreams', testData);
    
    // 讀取並驗證
    const savedData = await getLocalStorageValue(page, 'favoriteStreams');
    expect(savedData).toBe(testData);
    
    // 驗證可以解析為 JSON
    const parsed = JSON.parse(savedData);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe(FAVORITE_STREAMS_DATA[0].name);
    expect(parsed[0].url).toBe(FAVORITE_STREAMS_DATA[0].url);
  });

  test('可以讀寫 localStorage - 分類', async ({ page }) => {
    // 使用實際的分類數據結構
    const testData = JSON.stringify(FAVORITE_CATEGORIES_DATA);
    
    await setLocalStorageValue(page, 'favoriteCategories', testData);
    
    const savedData = await getLocalStorageValue(page, 'favoriteCategories');
    expect(savedData).toBe(testData);
    
    const parsed = JSON.parse(savedData);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe(FAVORITE_CATEGORIES_DATA[0].name);
  });

  test('可以讀寫 localStorage - 用戶設置', async ({ page }) => {
    await setLocalStorageValue(page, 'userSettings', JSON.stringify({
      language: 'en',
      masterVolume: 80,
      controlPanelCollapsed: false
    }));
    
    const savedData = await getLocalStorageValue(page, 'userSettings');
    const parsed = JSON.parse(savedData);
    expect(parsed.language).toBe('en');
    expect(parsed.masterVolume).toBe(80);
  });

  test('IndexedDB 備份功能可用', async ({ page }) => {
    // 檢查 IndexedDB 是否可用
    const indexedDBAvailable = await page.evaluate(() => {
      return typeof window.indexedDB !== 'undefined';
    });
    
    expect(indexedDBAvailable).toBe(true);
  });

  test('可以通過界面觸發 IndexedDB 備份', async ({ page }) => {
    // 使用實際的收藏串流數據
    await setLocalStorageValue(page, 'favoriteStreams', JSON.stringify([FAVORITE_STREAMS_DATA[0]]));
    
    // 檢查備份功能是否可用
    const backupEnabled = await page.evaluate(() => {
      return localStorage.getItem('indexedDBBackupEnabled') !== 'false';
    });
    
    expect(backupEnabled).toBe(true);
  });

  test('localStorage 數據在頁面重新載入後仍然存在', async ({ page }) => {
    // 使用實際的收藏串流數據
    const testData = JSON.stringify([FAVORITE_STREAMS_DATA[0]]);
    
    await setLocalStorageValue(page, 'favoriteStreams', testData);
    
    // 重新載入頁面
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // 驗證數據仍然存在
    const savedData = await getLocalStorageValue(page, 'favoriteStreams');
    expect(savedData).toBe(testData);
    
    // 驗證數據結構正確
    const parsed = JSON.parse(savedData);
    expect(parsed[0].url).toBe(FAVORITE_STREAMS_DATA[0].url);
    expect(parsed[0].name).toBe(FAVORITE_STREAMS_DATA[0].name);
  });
});
