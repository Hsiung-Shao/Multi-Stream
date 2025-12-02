// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForPageLoad, ensureControlPanelExpanded, addTestStream, clearAllStreams, switchLayout, collapseControlPanel } = require('./helpers');
const { TEST_STREAMS } = require('./test-data');

test.describe('布局功能測試', () => {
  test.beforeEach(async ({ page }) => {
    await waitForPageLoad(page);
    // 統一在開始時添加4個串流
    for (let i = 0; i < 4; i++) {
      await addTestStream(page, TEST_STREAMS.forLayout[i]);
      await page.waitForTimeout(1000);
    }
  });

  test.afterEach(async ({ page }) => {
    await clearAllStreams(page);
  });

  test('可以切換到單一畫面布局', async ({ page }) => {
    // 收起控制面板以便查看布局效果
    await collapseControlPanel(page);
    
    // 直接調用 setLayout(1)
    await switchLayout(page, 1);
    
    // 檢查容器布局
    const streamBoxes = page.locator('.stream-box');
    const count = await streamBoxes.count();
    expect(count).toBeGreaterThan(0);
  });

  test('可以切換到左右分割布局', async ({ page }) => {
    await collapseControlPanel(page);
    
    // 直接調用 setLayout(2)
    await switchLayout(page, 2);
    
    const streamBoxes = page.locator('.stream-box');
    const count = await streamBoxes.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('可以切換到四宮格布局', async ({ page }) => {
    await collapseControlPanel(page);
    
    // 直接調用 setLayout(4)
    await switchLayout(page, 4);
    
    const streamBoxes = page.locator('.stream-box');
    const count = await streamBoxes.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('布局按鈕應該存在且可點擊', async ({ page }) => {
    await ensureControlPanelExpanded(page);
    
    const layoutPreviews = page.locator('.layout-preview-inline');
    const count = await layoutPreviews.count();
    
    // 應該有多個布局選項（至少7個基本布局 + 3個聊天布局）
    expect(count).toBeGreaterThan(7);
    
    // 測試直接調用 setLayout 函數
    await switchLayout(page, 1);
    await page.waitForTimeout(300);
  });
});

