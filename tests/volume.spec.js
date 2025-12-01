// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForPageLoad, ensureControlPanelExpanded, addTestStream, clearAllStreams } = require('./helpers');

test.describe('音量控制測試', () => {
  test.beforeEach(async ({ page }) => {
    await waitForPageLoad(page);
    // 所有音量測試都需要先添加串流
    await addTestStream(page);
    await page.waitForTimeout(2000);
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
    await ensureControlPanelExpanded(page);
    
    // 等待 muteAll 函數可用
    await page.waitForFunction(() => typeof muteAll === 'function', { timeout: 10000 });
    
    // 先設置一個非零音量以便測試靜音
    const masterVolume = page.locator('#master-volume');
    await masterVolume.fill('50');
    await page.waitForTimeout(300);
    
    // 直接調用 muteAll 函數
    await page.evaluate(() => {
      if (typeof muteAll === 'function') {
        muteAll();
      }
    });
    await page.waitForTimeout(300);
    
    // 檢查音量是否為 0
    const value = await masterVolume.inputValue();
    expect(parseInt(value)).toBe(0);
  });

  test('可以取消全部靜音', async ({ page }) => {
    await ensureControlPanelExpanded(page);
    
    // 等待 muteAll 函數可用
    await page.waitForFunction(() => typeof muteAll === 'function', { timeout: 10000 });
    
    const masterVolume = page.locator('#master-volume');
    
    // 先設置音量為 0（靜音狀態）
    await masterVolume.fill('0');
    await page.waitForTimeout(300);
    
    // 直接調用 muteAll 函數取消靜音
    await page.evaluate(() => {
      if (typeof muteAll === 'function') {
        muteAll();
      }
    });
    await page.waitForTimeout(300);
    
    // 檢查音量是否恢復（應該變為 100）
    const value = await masterVolume.inputValue();
    expect(parseInt(value)).toBe(100);
  });

  test('可以調整單個串流的音量', async ({ page }) => {
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

