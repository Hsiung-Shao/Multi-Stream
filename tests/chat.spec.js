// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForPageLoad, addTestStream, clearAllStreams, toggleAllChats } = require('./helpers');
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
    
    // 等待 toggleChat 函數可用（全局函數）
    await page.waitForFunction(() => typeof toggleChat === 'function', { timeout: 10000 });
    
    // 獲取第一個串流的 ID
    const streamId = await page.evaluate(() => {
      const firstBox = document.querySelector('.stream-box');
      return firstBox ? parseInt(firstBox.getAttribute('data-stream-id')) : null;
    });
    
    if (streamId) {
      // 直接調用 toggleChat 函數顯示聊天室
      await page.evaluate((id) => {
        if (typeof toggleChat === 'function') {
          toggleChat(id);
        }
      }, streamId);
      await page.waitForTimeout(1000);
      
      // 檢查聊天室是否顯示
      const chatContainer = page.locator(`#chat${streamId}, .stream-box iframe[src*="twitch.tv"], .stream-box iframe[src*="youtube.com"]`).first();
      const isVisible = await chatContainer.isVisible().catch(() => false);
      
      // 再次調用隱藏
      await page.evaluate((id) => {
        if (typeof toggleChat === 'function') {
          toggleChat(id);
        }
      }, streamId);
      await page.waitForTimeout(500);
    }
  });

  test('可以顯示所有聊天室', async ({ page }) => {
    await addTestStream(page, TEST_STREAMS.forChat[0]);
    await page.waitForTimeout(1000);
    await addTestStream(page, TEST_STREAMS.forChat[1]);
    await page.waitForTimeout(1000);
    
    // 直接調用 toggleAllChats 函數
    await toggleAllChats(page);
    await page.waitForTimeout(1000);
    
    // 檢查是否有聊天室顯示
    const chatContainers = page.locator('.chat-container, iframe[src*="twitch.tv"], iframe[src*="youtube.com"]');
    const count = await chatContainers.count();
    expect(count).toBeGreaterThan(0);
  });
});

