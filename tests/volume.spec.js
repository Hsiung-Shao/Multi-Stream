// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForPageLoad, ensureControlPanelExpanded, addTestStream, clearAllStreams } = require('./helpers');

test.describe('音量控制測試', () => {
  test.beforeEach(async ({ page }) => {
    await waitForPageLoad(page);
  });

  test.afterEach(async ({ page }) => {
    await clearAllStreams(page);
  });

  test('可以調整總音量', async ({ page }) => {
    await ensureControlPanelExpanded(page);
    
    const masterVolume = page.locator('#master-volume');
    await expect(masterVolume).toBeVisible();
    
    // 調整音量到 50
    await masterVolume.fill('50');
    await page.waitForTimeout(300);
    
    // 檢查音量值顯示
    const volumeValue = page.locator('#master-volume-value');
    const value = await volumeValue.textContent();
    expect(value).toContain('50');
  });

  test('可以全部靜音', async ({ page }) => {
    await addTestStream(page);
    await ensureControlPanelExpanded(page);
    
    const muteButton = page.locator('button:has-text("全部靜音")');
    await expect(muteButton).toBeVisible();
    
    // 點擊靜音按鈕
    await muteButton.click();
    await page.waitForTimeout(300);
    
    // 檢查音量是否為 0
    const masterVolume = page.locator('#master-volume');
    const value = await masterVolume.inputValue();
    expect(parseInt(value)).toBe(0);
  });

  test('可以取消全部靜音', async ({ page }) => {
    await addTestStream(page);
    await ensureControlPanelExpanded(page);
    
    const muteButton = page.locator('button:has-text("全部靜音")');
    
    // 先靜音
    await muteButton.click();
    await page.waitForTimeout(300);
    
    // 再點擊取消靜音
    await muteButton.click();
    await page.waitForTimeout(300);
    
    // 檢查音量是否恢復
    const masterVolume = page.locator('#master-volume');
    const value = await masterVolume.inputValue();
    expect(parseInt(value)).toBeGreaterThan(0);
  });

  test('可以調整單個串流的音量', async ({ page }) => {
    await addTestStream(page);
    await ensureControlPanelExpanded(page);
    
    // 查找串流順序列表中的音量控制
    const streamOrderList = page.locator('#stream-order-list');
    await expect(streamOrderList).toBeVisible();
    
    // 查找串流項目的音量滑桿
    const streamVolumeSlider = streamOrderList.locator('input[type="range"]').first();
    if (await streamVolumeSlider.isVisible()) {
      await streamVolumeSlider.fill('50');
      await page.waitForTimeout(300);
      
      const value = await streamVolumeSlider.inputValue();
      expect(parseInt(value)).toBe(50);
    }
  });

  test('音量值顯示應該更新', async ({ page }) => {
    await ensureControlPanelExpanded(page);
    
    const masterVolume = page.locator('#master-volume');
    const volumeValue = page.locator('#master-volume-value');
    
    // 調整音量
    await masterVolume.fill('75');
    await page.waitForTimeout(300);
    
    // 檢查顯示值
    const value = await volumeValue.textContent();
    expect(value).toContain('75');
  });
});
