// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('MultiStream Hub 基本功能測試', () => {
  test.beforeEach(async ({ page }) => {
    // 訪問主頁面
    await page.goto('http://localhost:8000');
    // 等待頁面載入完成
    await page.waitForLoadState('networkidle');
  });

  test('頁面應該正確載入', async ({ page }) => {
    // 檢查頁面標題
    await expect(page).toHaveTitle(/MultiStream Hub/);
    
    // 檢查控制面板是否存在
    const controlPanel = page.locator('#control-panel');
    await expect(controlPanel).toBeVisible();
    
    // 檢查輸入框是否存在
    const urlInput = page.locator('#url-input');
    await expect(urlInput).toBeVisible();
  });

  test('控制面板可以展開和收起', async ({ page }) => {
    const controlPanel = page.locator('#control-panel');
    const toggleButton = page.locator('.control-panel-toggle');
    
    // 檢查初始狀態（應該是展開的）
    await expect(controlPanel).not.toHaveClass(/collapsed/);
    
    // 點擊收起按鈕
    await toggleButton.click();
    await page.waitForTimeout(300); // 等待動畫完成
    
    // 檢查是否已收起
    await expect(controlPanel).toHaveClass(/collapsed/);
    
    // 再次點擊展開
    const collapsedToggle = page.locator('#control-panel-toggle-collapsed');
    await collapsedToggle.click();
    await page.waitForTimeout(300);
    
    // 檢查是否已展開
    await expect(controlPanel).not.toHaveClass(/collapsed/);
  });

  test('可以輸入 URL 到輸入框', async ({ page }) => {
    const urlInput = page.locator('#url-input');
    const testUrl = 'https://www.twitch.tv/test';
    
    // 輸入 URL
    await urlInput.fill(testUrl);
    
    // 檢查輸入值
    await expect(urlInput).toHaveValue(testUrl);
  });

  test('布局按鈕應該存在', async ({ page }) => {
    // 檢查布局預覽按鈕
    const layoutPreviews = page.locator('.layout-preview-inline');
    const count = await layoutPreviews.count();
    
    // 應該有多個布局選項
    expect(count).toBeGreaterThan(0);
  });

  test('收藏管理按鈕應該存在', async ({ page }) => {
    const favoriteButton = page.locator('button:has-text("管理收藏")');
    await expect(favoriteButton).toBeVisible();
  });

  test('音量控制應該存在', async ({ page }) => {
    const masterVolume = page.locator('#master-volume');
    await expect(masterVolume).toBeVisible();
    
    // 檢查音量值顯示
    const volumeValue = page.locator('#master-volume-value');
    await expect(volumeValue).toBeVisible();
  });

  test('語言選擇器應該存在', async ({ page }) => {
    const languageSelector = page.locator('#language-selector');
    await expect(languageSelector).toBeVisible();
    
    // 檢查選項
    const options = await languageSelector.locator('option').count();
    expect(options).toBeGreaterThan(0);
  });
});

test.describe('頁面導航測試', () => {
  test('可以訪問關於我們頁面', async ({ page }) => {
    await page.goto('http://localhost:8000/about.html');
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveTitle(/關於我們/);
  });

  test('可以訪問隱私權政策頁面', async ({ page }) => {
    await page.goto('http://localhost:8000/privacy.html');
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveTitle(/隱私權政策/);
  });
});
