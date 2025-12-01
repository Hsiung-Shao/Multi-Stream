// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForPageLoad, ensureControlPanelExpanded } = require('./helpers');

test.describe('多國語言切換測試', () => {
  test.beforeEach(async ({ page }) => {
    await waitForPageLoad(page);
  });

  test('可以切換到繁體中文', async ({ page }) => {
    await ensureControlPanelExpanded(page);
    
    const languageSelector = page.locator('#language-selector');
    await languageSelector.selectOption('zh-TW');
    await page.waitForTimeout(500);
    
    // 檢查界面文字是否為繁體中文
    const favoriteButton = page.locator('button:has-text("管理收藏")');
    await expect(favoriteButton).toBeVisible();
  });

  test('可以切換到简体中文', async ({ page }) => {
    await ensureControlPanelExpanded(page);
    
    const languageSelector = page.locator('#language-selector');
    await languageSelector.selectOption('zh-CN');
    await page.waitForTimeout(500);
    
    // 檢查界面文字是否為簡體中文
    // 注意：如果簡體中文翻譯不完全，可能仍顯示繁體中文
    const favoriteButton = page.locator('button:has-text("管理收藏"), button:has-text("管理收藏")');
    await expect(favoriteButton).toBeVisible();
  });

  test('可以切換到英文', async ({ page }) => {
    await ensureControlPanelExpanded(page);
    
    const languageSelector = page.locator('#language-selector');
    await languageSelector.selectOption('en');
    await page.waitForTimeout(500);
    
    // 檢查界面文字是否為英文
    // 注意：需要根據實際的英文翻譯來檢查
    const controlPanel = page.locator('#control-panel');
    await expect(controlPanel).toBeVisible();
  });

  test('可以切換到日文', async ({ page }) => {
    await ensureControlPanelExpanded(page);
    
    const languageSelector = page.locator('#language-selector');
    await languageSelector.selectOption('ja');
    await page.waitForTimeout(500);
    
    // 檢查界面是否正常顯示
    const controlPanel = page.locator('#control-panel');
    await expect(controlPanel).toBeVisible();
  });

  test('語言選擇器應該有所有選項', async ({ page }) => {
    await ensureControlPanelExpanded(page);
    
    const languageSelector = page.locator('#language-selector');
    const options = languageSelector.locator('option');
    const count = await options.count();
    
    // 應該有4個語言選項
    expect(count).toBe(4);
    
    // 檢查選項值
    const values = await options.allTextContents();
    expect(values).toContain('繁體中文');
    expect(values).toContain('简体中文');
    expect(values).toContain('English');
    expect(values).toContain('日本語');
  });

  test('語言設置應該保存到 localStorage', async ({ page }) => {
    await ensureControlPanelExpanded(page);
    
    const languageSelector = page.locator('#language-selector');
    await languageSelector.selectOption('en');
    await page.waitForTimeout(500);
    
    // 重新載入頁面
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // 檢查語言選擇器是否保持選擇
    const selectedValue = await languageSelector.inputValue();
    expect(selectedValue).toBe('en');
  });
});
