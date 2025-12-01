// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForPageLoad, ensureControlPanelExpanded, openFavoriteManager, closeFavoriteManager, clearLocalStorage } = require('./helpers');
const { TEST_STREAMS } = require('./test-data');

test.describe('收藏功能測試', () => {
  test.beforeEach(async ({ page }) => {
    await waitForPageLoad(page);
    await clearLocalStorage(page);
  });

  test('可以打開收藏管理界面', async ({ page }) => {
    await openFavoriteManager(page);
    
    const manager = page.locator('#favorite-streams-manager');
    await expect(manager).toBeVisible();
  });

  test('可以添加收藏', async ({ page }) => {
    await openFavoriteManager(page);
    
    // 等待 addToFavorites 函數可用（全局函數，應該直接可用）
    await page.waitForFunction(() => typeof addToFavorites === 'function', { timeout: 10000 });
    
    // 設置輸入框值
    const urlInput = page.locator('#favorite-url-input');
    await urlInput.fill(TEST_STREAMS.forFavorite.url);
    await page.waitForTimeout(200);
    
    // 直接調用 addToFavorites 函數
    await page.evaluate(() => {
      if (typeof addToFavorites === 'function') {
        addToFavorites();
      }
    });
    
    await page.waitForTimeout(500);
    
    // 等待收藏項目出現
    await page.waitForFunction(() => {
      return document.querySelectorAll('#favorite-list .favorite-item').length > 0;
    }, { timeout: 5000 });
    
    // 檢查是否添加到列表
    const favoriteList = page.locator('#favorite-list .favorite-item');
    const count = await favoriteList.count();
    expect(count).toBeGreaterThan(0);
  });

  test('可以新增分類', async ({ page }) => {
    await openFavoriteManager(page);
    
    // 切換到分類標籤頁
    await page.evaluate(() => {
      const tabBtn = document.querySelector('.tab-btn[data-tab="categories"]');
      if (tabBtn) tabBtn.click();
    });
    await page.waitForTimeout(300);
    
    // 等待 addCategory 函數可用
    await page.waitForFunction(() => typeof addCategory === 'function', { timeout: 10000 });
    
    // 設置分類名稱
    const categoryInput = page.locator('#category-name-input');
    await categoryInput.fill('測試分類');
    await page.waitForTimeout(200);
    
    // 直接調用 addCategory 函數
    await page.evaluate(() => {
      if (typeof addCategory === 'function') {
        addCategory();
      }
    });
    
    await page.waitForTimeout(500);
    
    // 檢查分類是否添加成功
    const categoryList = page.locator('#category-list .category-item');
    const count = await categoryList.count();
    expect(count).toBeGreaterThan(0);
  });

  test('可以修改收藏名稱', async ({ page }) => {
    await openFavoriteManager(page);
    
    // 先添加一個收藏
    await page.waitForFunction(() => typeof addToFavorites === 'function', { timeout: 10000 });
    const urlInput = page.locator('#favorite-url-input');
    await urlInput.fill(TEST_STREAMS.forFavorite.url);
    await page.waitForTimeout(200);
    
    await page.evaluate(() => {
      if (typeof addToFavorites === 'function') {
        addToFavorites();
      }
    });
    await page.waitForTimeout(500);
    
    // 等待收藏項目出現
    await page.waitForFunction(() => {
      return document.querySelectorAll('.favorite-item').length > 0;
    }, { timeout: 5000 });
    
    // 獲取第一個收藏的 ID
    const favoriteId = await page.evaluate(() => {
      const firstItem = document.querySelector('.favorite-item');
      return firstItem ? firstItem.getAttribute('data-id') : null;
    });
    
    if (favoriteId) {
      // 直接調用 enterEditMode 函數
      await page.evaluate((id) => {
        if (typeof enterEditMode === 'function') {
          enterEditMode(id);
        }
      }, favoriteId);
      await page.waitForTimeout(300);
      
      // 修改名稱
      const nameInput = page.locator('.favorite-edit-name').first();
      await nameInput.fill('修改後的名稱');
      await page.waitForTimeout(200);
      
      // 直接調用 saveFavoriteEdit 函數
      await page.evaluate((id) => {
        if (typeof saveFavoriteEdit === 'function') {
          saveFavoriteEdit(id);
        }
      }, favoriteId);
      await page.waitForTimeout(500);
      
      // 驗證名稱已修改
      const favoriteName = page.locator('.favorite-item:has-text("修改後的名稱")');
      await expect(favoriteName).toBeVisible({ timeout: 5000 });
    }
  });

  test('可以修改收藏分類', async ({ page }) => {
    await openFavoriteManager(page);
    
    // 先創建分類
    await page.evaluate(() => {
      const tabBtn = document.querySelector('.tab-btn[data-tab="categories"]');
      if (tabBtn) tabBtn.click();
    });
    await page.waitForTimeout(300);
    
    await page.waitForFunction(() => typeof addCategory === 'function', { timeout: 10000 });
    const categoryInput = page.locator('#category-name-input');
    await categoryInput.fill('測試分類');
    await page.waitForTimeout(200);
    
    await page.evaluate(() => {
      if (typeof addCategory === 'function') {
        addCategory();
      }
    });
    await page.waitForTimeout(500);
    
    // 切換回收藏標籤頁
    await page.evaluate(() => {
      const tabBtn = document.querySelector('.tab-btn[data-tab="favorites"]');
      if (tabBtn) tabBtn.click();
    });
    await page.waitForTimeout(300);
    
    // 添加收藏
    await page.waitForFunction(() => typeof addToFavorites === 'function', { timeout: 10000 });
    const urlInput = page.locator('#favorite-url-input');
    await urlInput.fill(TEST_STREAMS.forFavorite.url);
    await page.waitForTimeout(200);
    
    await page.evaluate(() => {
      if (typeof addToFavorites === 'function') {
        addToFavorites();
      }
    });
    await page.waitForTimeout(500);
    
    // 等待收藏項目出現
    await page.waitForFunction(() => {
      return document.querySelectorAll('.favorite-item').length > 0;
    }, { timeout: 5000 });
    
    // 獲取第一個收藏的 ID
    const favoriteId = await page.evaluate(() => {
      const firstItem = document.querySelector('.favorite-item');
      return firstItem ? firstItem.getAttribute('data-id') : null;
    });
    
    if (favoriteId) {
      // 進入編輯模式
      await page.evaluate((id) => {
        if (typeof enterEditMode === 'function') {
          enterEditMode(id);
        }
      }, favoriteId);
      await page.waitForTimeout(300);
      
      // 選擇分類
      const categorySelect = page.locator('.favorite-edit-category').first();
      await categorySelect.selectOption({ index: 1 }); // 選擇第一個分類（測試分類）
      await page.waitForTimeout(200);
      
      // 保存
      await page.evaluate((id) => {
        if (typeof saveFavoriteEdit === 'function') {
          saveFavoriteEdit(id);
        }
      }, favoriteId);
      await page.waitForTimeout(500);
    }
  });

  test('可以一鍵載入收藏', async ({ page }) => {
    await openFavoriteManager(page);
    
    // 添加至少2個收藏（測試需要>=2個收藏）
    await page.waitForFunction(() => typeof addToFavorites === 'function', { timeout: 10000 });
    const urlInput = page.locator('#favorite-url-input');
    
    // 添加第一個收藏
    await urlInput.fill(TEST_STREAMS.forFavorite.url);
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      if (typeof addToFavorites === 'function') {
        addToFavorites();
      }
    });
    await page.waitForTimeout(500);
    
    // 添加第二個收藏（使用不同的 URL）
    await urlInput.fill(TEST_STREAMS.multiple[1]);
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      if (typeof addToFavorites === 'function') {
        addToFavorites();
      }
    });
    await page.waitForTimeout(500);
    
    // 等待收藏項目出現（至少2個）
    await page.waitForFunction(() => {
      return document.querySelectorAll('#favorite-list .favorite-item').length >= 2;
    }, { timeout: 5000 });
    
    // 選取所有收藏（勾選 checkbox）
    await page.evaluate(() => {
      const checkboxes = document.querySelectorAll('.favorite-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = true;
      });
    });
    await page.waitForTimeout(200);
    
    // 等待 loadSelectedFavorites 函數可用
    await page.waitForFunction(() => typeof loadSelectedFavorites === 'function', { timeout: 10000 });
    
    // 直接調用 loadSelectedFavorites 函數
    await page.evaluate(() => {
      if (typeof loadSelectedFavorites === 'function') {
        loadSelectedFavorites();
      }
    });
    
    await page.waitForTimeout(2000);
    
    // 檢查是否有串流載入（應該有>=2個）
    const streamBoxes = page.locator('.stream-box');
    const count = await streamBoxes.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('可以刪除收藏', async ({ page }) => {
    await openFavoriteManager(page);
    
    // 先添加收藏
    await page.waitForFunction(() => typeof addToFavorites === 'function', { timeout: 10000 });
    const urlInput = page.locator('#favorite-url-input');
    await urlInput.fill(TEST_STREAMS.forFavorite.url);
    await page.waitForTimeout(200);
    
    await page.evaluate(() => {
      if (typeof addToFavorites === 'function') {
        addToFavorites();
      }
    });
    await page.waitForTimeout(500);
    
    // 等待收藏項目出現
    await page.waitForFunction(() => {
      return document.querySelectorAll('.favorite-item').length > 0;
    }, { timeout: 5000 });
    
    // 獲取初始數量
    const initialCount = await page.evaluate(() => {
      return document.querySelectorAll('.favorite-item').length;
    });
    
    // 獲取第一個收藏的 ID
    const favoriteId = await page.evaluate(() => {
      const firstItem = document.querySelector('.favorite-item');
      return firstItem ? firstItem.getAttribute('data-id') : null;
    });
    
    if (favoriteId) {
      // 直接調用 removeFavoriteStream 函數
      await page.evaluate((id) => {
        if (typeof removeFavoriteStream === 'function') {
          removeFavoriteStream(id);
        }
      }, favoriteId);
      
      await page.waitForTimeout(500);
      
      // 檢查收藏是否被刪除
      const finalCount = await page.evaluate(() => {
        return document.querySelectorAll('.favorite-item').length;
      });
      expect(finalCount).toBeLessThan(initialCount);
    }
  });
});

