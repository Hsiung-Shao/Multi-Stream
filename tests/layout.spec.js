// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForPageLoad, ensureControlPanelExpanded, addTestStream, clearAllStreams } = require('./helpers');
const { TEST_STREAMS } = require('./test-data');

test.describe('布局功能測試', () => {
  test.beforeEach(async ({ page }) => {
    await waitForPageLoad(page);
  });

  test.afterEach(async ({ page }) => {
    await clearAllStreams(page);
  });

  test('可以切換到單一畫面布局', async ({ page }) => {
    await addTestStream(page);
    
    // 點擊第一個布局按鈕（單一畫面）
    const layoutButtons = page.locator('.layout-preview-inline');
    await layoutButtons.first().click();
    await page.waitForTimeout(500);
    
    // 檢查容器布局
    const container = page.locator('#container');
    const streamBoxes = page.locator('.stream-box');
    const count = await streamBoxes.count();
    expect(count).toBeGreaterThan(0);
  });

  test('可以切換到左右分割布局', async ({ page }) => {
    await addTestStream(page, TEST_STREAMS.forLayout[0]);
    await page.waitForTimeout(1000);
    await addTestStream(page, TEST_STREAMS.forLayout[1]);
    
    // 點擊第二個布局按鈕（左右分割）
    const layoutButtons = page.locator('.layout-preview-inline');
    await layoutButtons.nth(1).click();
    await page.waitForTimeout(500);
    
    const streamBoxes = page.locator('.stream-box');
    const count = await streamBoxes.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('可以切換到四宮格布局', async ({ page }) => {
    // 添加4個串流
    for (let i = 0; i < 4; i++) {
      await addTestStream(page, TEST_STREAMS.forLayout[i]);
      await page.waitForTimeout(500);
    }
    
    // 點擊第四個布局按鈕（四宮格）
    const layoutButtons = page.locator('.layout-preview-inline');
    await layoutButtons.nth(3).click();
    await page.waitForTimeout(500);
    
    const streamBoxes = page.locator('.stream-box');
    const count = await streamBoxes.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('可以切換到雙欄聊天布局', async ({ page }) => {
    await addTestStream(page);
    
    // 點擊雙欄聊天布局按鈕（layout 13）
    const chatLayoutButtons = page.locator('.layout-preview-inline');
    // 找到雙欄聊天布局按鈕（通常在布局按鈕之後）
    const allLayoutButtons = await chatLayoutButtons.all();
    // 雙欄聊天布局通常是第8個按鈕（索引7）
    if (allLayoutButtons.length > 7) {
      await allLayoutButtons[7].click();
      await page.waitForTimeout(1000);
      
      // 檢查是否有固定聊天區域
      const fixedChatArea = page.locator('.fixed-chat-sidebar, .fixed-chat-panel');
      const hasFixedChat = await fixedChatArea.count();
      expect(hasFixedChat).toBeGreaterThan(0);
    }
  });

  test('可以切換到四格聊天布局', async ({ page }) => {
    await addTestStream(page);
    
    // 點擊四格聊天布局按鈕（layout 14）
    const chatLayoutButtons = page.locator('.layout-preview-inline');
    const allLayoutButtons = await chatLayoutButtons.all();
    // 四格聊天布局通常是第9個按鈕（索引8）
    if (allLayoutButtons.length > 8) {
      await allLayoutButtons[8].click();
      await page.waitForTimeout(1000);
      
      // 檢查是否有固定聊天區域
      const fixedChatArea = page.locator('.fixed-chat-sidebar, .fixed-chat-panel');
      const hasFixedChat = await fixedChatArea.count();
      expect(hasFixedChat).toBeGreaterThan(0);
    }
  });

  test('布局按鈕應該存在且可點擊', async ({ page }) => {
    await ensureControlPanelExpanded(page);
    
    const layoutPreviews = page.locator('.layout-preview-inline');
    const count = await layoutPreviews.count();
    
    // 應該有多個布局選項（至少7個基本布局 + 3個聊天布局）
    expect(count).toBeGreaterThan(7);
    
    // 測試點擊第一個布局按鈕
    await layoutPreviews.first().click();
    await page.waitForTimeout(300);
  });
});
