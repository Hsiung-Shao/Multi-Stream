// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForPageLoad, ensureControlPanelExpanded, clearAllStreams } = require('./helpers');
const { TEST_STREAMS } = require('./test-data');

test.describe('串流管理測試', () => {
  test.beforeEach(async ({ page }) => {
    await waitForPageLoad(page);
  });

  test.afterEach(async ({ page }) => {
    await clearAllStreams(page);
  });

  test('可以添加 Twitch 串流', async ({ page }) => {
    await ensureControlPanelExpanded(page);
    
    const urlInput = page.locator('#url-input');
    const testUrl = TEST_STREAMS.single;
    
    await urlInput.fill(testUrl);
    await page.click('button:has-text("加入畫面")');
    
    // 等待串流載入
    await page.waitForTimeout(2000);
    
    // 檢查是否有串流框出現
    const streamBoxes = page.locator('.stream-box');
    await expect(streamBoxes.first()).toBeVisible({ timeout: 10000 });
  });

  test('可以添加 YouTube 串流', async ({ page }) => {
    await ensureControlPanelExpanded(page);
    
    const urlInput = page.locator('#url-input');
    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    
    await urlInput.fill(testUrl);
    await page.click('button:has-text("加入畫面")');
    
    // 等待串流載入
    await page.waitForTimeout(2000);
    
    // 檢查是否有串流框出現
    const streamBoxes = page.locator('.stream-box');
    await expect(streamBoxes.first()).toBeVisible({ timeout: 10000 });
  });

  test('可以添加多個串流', async ({ page }) => {
    await ensureControlPanelExpanded(page);
    
    const streams = TEST_STREAMS.multiple.slice(0, 3); // 使用前3個實際串流
    
    for (const url of streams) {
      const urlInput = page.locator('#url-input');
      await urlInput.fill(url);
      await page.click('button:has-text("加入畫面")');
      await page.waitForTimeout(1500);
    }
    
    // 檢查串流數量
    const streamBoxes = page.locator('.stream-box');
    const count = await streamBoxes.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('可以移除單個串流', async ({ page }) => {
    await ensureControlPanelExpanded(page);
    
    // 先添加一個串流
    const urlInput = page.locator('#url-input');
    await urlInput.fill(TEST_STREAMS.single);
    await page.click('button:has-text("加入畫面")');
    await page.waitForTimeout(2000);
    
    // 查找移除按鈕（通常在串流框內）
    const removeButton = page.locator('.stream-box .remove-btn, .stream-box button:has-text("移除"), .stream-box [title*="移除"]').first();
    if (await removeButton.isVisible()) {
      await removeButton.click();
      await page.waitForTimeout(500);
      
      // 檢查串流是否被移除
      const streamBoxes = page.locator('.stream-box');
      const count = await streamBoxes.count();
      expect(count).toBe(0);
    }
  });

  test('串流順序列表應該顯示', async ({ page }) => {
    await ensureControlPanelExpanded(page);
    
    // 添加串流
    const urlInput = page.locator('#url-input');
    await urlInput.fill(TEST_STREAMS.single);
    await page.click('button:has-text("加入畫面")');
    await page.waitForTimeout(2000);
    
    // 檢查串流順序列表
    const streamOrderList = page.locator('#stream-order-list');
    await expect(streamOrderList).toBeVisible();
  });
});
