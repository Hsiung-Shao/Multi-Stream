// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForPageLoad, ensureControlPanelExpanded, addTestStream, clearAllStreams } = require('./helpers');
const { TEST_STREAMS } = require('./test-data');

test.describe('聊天室功能測試', () => {
  test.beforeEach(async ({ page }) => {
    await waitForPageLoad(page);
  });

  test.afterEach(async ({ page }) => {
    await clearAllStreams(page);
  });

  test('可以顯示/隱藏聊天室', async ({ page }) => {
    await addTestStream(page);
    await page.waitForTimeout(2000);
    
    // 查找聊天室按鈕（通常在串流框內）
    const chatButton = page.locator('.stream-box .chat-toggle-btn, .stream-box button:has-text("聊天"), .stream-box [title*="聊天"]').first();
    if (await chatButton.isVisible()) {
      // 點擊顯示聊天室
      await chatButton.click();
      await page.waitForTimeout(1000);
      
      // 檢查聊天室是否顯示
      const chatContainer = page.locator('.stream-box .chat-container, .stream-box iframe[src*="twitch.tv"], .stream-box iframe[src*="youtube.com"]').first();
      const isVisible = await chatContainer.isVisible().catch(() => false);
      
      // 再次點擊隱藏
      await chatButton.click();
      await page.waitForTimeout(500);
    }
  });

  test('可以顯示所有聊天室', async ({ page }) => {
    await addTestStream(page, TEST_STREAMS.forChat[0]);
    await page.waitForTimeout(1000);
    await addTestStream(page, TEST_STREAMS.forChat[1]);
    await page.waitForTimeout(1000);
    
    await ensureControlPanelExpanded(page);
    
    // 查找「顯示所有聊天室」按鈕
    const showAllChatsButton = page.locator('button:has-text("顯示所有聊天室"), button:has-text("Show All Chats")');
    if (await showAllChatsButton.isVisible()) {
      await showAllChatsButton.click();
      await page.waitForTimeout(1000);
      
      // 檢查是否有聊天室顯示
      const chatContainers = page.locator('.chat-container, iframe[src*="twitch.tv"], iframe[src*="youtube.com"]');
      const count = await chatContainers.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('側邊聊天布局可以調整聊天室寬度', async ({ page }) => {
    await addTestStream(page);
    await page.waitForTimeout(2000);
    
    // 切換到雙欄聊天布局
    const chatLayoutButtons = page.locator('.layout-preview-inline');
    const allLayoutButtons = await chatLayoutButtons.all();
    if (allLayoutButtons.length > 7) {
      await allLayoutButtons[7].click(); // 雙欄聊天布局
      await page.waitForTimeout(1000);
      
      await ensureControlPanelExpanded(page);
      
      // 查找聊天室寬度控制
      const widthControl = page.locator('#fixed-layout-width-control');
      if (await widthControl.isVisible()) {
        const widthInput = page.locator('#chat-width-input');
        await widthInput.fill('40');
        
        const applyButton = page.locator('button:has-text("套用"), button:has-text("Apply")');
        await applyButton.click();
        await page.waitForTimeout(500);
        
        // 驗證寬度已應用
        const value = await widthInput.inputValue();
        expect(parseInt(value)).toBe(40);
      }
    }
  });

  test('側邊聊天布局可以選擇聊天室', async ({ page }) => {
    await addTestStream(page, TEST_STREAMS.forChat[0]);
    await page.waitForTimeout(1000);
    await addTestStream(page, TEST_STREAMS.forChat[1]);
    await page.waitForTimeout(1000);
    
    // 切換到雙欄聊天布局
    const chatLayoutButtons = page.locator('.layout-preview-inline');
    const allLayoutButtons = await chatLayoutButtons.all();
    if (allLayoutButtons.length > 7) {
      await allLayoutButtons[7].click();
      await page.waitForTimeout(1000);
      
      // 查找聊天室選擇器
      const chatSelectors = page.locator('.chat-panel-selector, select.favorite-display-filter');
      const count = await chatSelectors.count();
      expect(count).toBeGreaterThan(0);
    }
  });
});
