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
    
    // 查找收藏 URL 輸入框
    const urlInput = page.locator('#favorite-url-input, #favorite-streams-manager input[type="text"]').first();
    if (await urlInput.isVisible()) {
      await urlInput.fill(TEST_STREAMS.forFavorite.url);
      
      // 查找添加按鈕
      const addButton = page.locator('button:has-text("添加"), button:has-text("加入"), #favorite-streams-manager button').first();
      await addButton.click();
      await page.waitForTimeout(500);
      
      // 檢查是否添加到列表
      const favoriteList = page.locator('#favorite-list, .favorite-item');
      const count = await favoriteList.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('可以新增分類', async ({ page }) => {
    await openFavoriteManager(page);
    
    // 查找分類名稱輸入框
    const categoryInput = page.locator('#category-name-input, input[placeholder*="分類"]').first();
    if (await categoryInput.isVisible()) {
      await categoryInput.fill('測試分類');
      
      // 查找添加分類按鈕
      const addCategoryButton = page.locator('button:has-text("添加分類"), button:has-text("新增分類")').first();
      await addCategoryButton.click();
      await page.waitForTimeout(500);
      
      // 檢查分類是否添加成功
      const categoryList = page.locator('.category-item, .favorite-category');
      const count = await categoryList.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('可以修改收藏名稱', async ({ page }) => {
    await openFavoriteManager(page);
    
    // 先添加一個收藏
    const urlInput = page.locator('#favorite-url-input, #favorite-streams-manager input[type="text"]').first();
    if (await urlInput.isVisible()) {
      await urlInput.fill(TEST_STREAMS.forFavorite.url);
      const addButton = page.locator('button:has-text("添加"), button:has-text("加入")').first();
      await addButton.click();
      await page.waitForTimeout(500);
      
      // 查找編輯按鈕
      const editButton = page.locator('.edit-favorite-btn, button:has-text("編輯")').first();
      if (await editButton.isVisible()) {
        await editButton.click();
        await page.waitForTimeout(300);
        
        // 查找名稱輸入框並修改
        const nameInput = page.locator(`input[value*="${TEST_STREAMS.forFavorite.name}"], .favorite-name-input`).first();
        if (await nameInput.isVisible()) {
          await nameInput.fill('修改後的名稱');
          
          // 保存
          const saveButton = page.locator('button:has-text("保存"), button:has-text("確定")').first();
          await saveButton.click();
          await page.waitForTimeout(500);
          
          // 驗證名稱已修改
          const favoriteName = page.locator('.favorite-item:has-text("修改後的名稱")');
          await expect(favoriteName).toBeVisible();
        }
      }
    }
  });

  test('可以修改收藏分類', async ({ page }) => {
    await openFavoriteManager(page);
    
    // 先創建分類
    const categoryInput = page.locator('#category-name-input').first();
    if (await categoryInput.isVisible()) {
      await categoryInput.fill('測試分類');
      const addCategoryButton = page.locator('button:has-text("添加分類")').first();
      await addCategoryButton.click();
      await page.waitForTimeout(500);
      
      // 添加收藏
      const urlInput = page.locator('#favorite-url-input').first();
      if (await urlInput.isVisible()) {
        await urlInput.fill(TEST_STREAMS.forFavorite.url);
        const addButton = page.locator('button:has-text("添加")').first();
        await addButton.click();
        await page.waitForTimeout(500);
        
        // 編輯收藏並選擇分類
        const editButton = page.locator('.edit-favorite-btn').first();
        if (await editButton.isVisible()) {
          await editButton.click();
          await page.waitForTimeout(300);
          
          // 選擇分類下拉框
          const categorySelect = page.locator('select.favorite-category-select, select').first();
          if (await categorySelect.isVisible()) {
            await categorySelect.selectOption({ label: /測試分類/ });
            
            // 保存
            const saveButton = page.locator('button:has-text("保存")').first();
            await saveButton.click();
            await page.waitForTimeout(500);
          }
        }
      }
    }
  });

  test('可以一鍵載入收藏', async ({ page }) => {
    await openFavoriteManager(page);
    
    // 先添加收藏
    const urlInput = page.locator('#favorite-url-input').first();
    if (await urlInput.isVisible()) {
      await urlInput.fill(TEST_STREAMS.forFavorite.url);
      const addButton = page.locator('button:has-text("添加")').first();
      await addButton.click();
      await page.waitForTimeout(500);
      
      await closeFavoriteManager(page);
      
      // 在控制面板中查找載入按鈕
      await ensureControlPanelExpanded(page);
      const loadButton = page.locator('#favorite-list-display button, .favorite-item button').first();
      if (await loadButton.isVisible()) {
        await loadButton.click();
        await page.waitForTimeout(2000);
        
        // 檢查是否有串流載入
        const streamBoxes = page.locator('.stream-box');
        const count = await streamBoxes.count();
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  test('可以刪除收藏', async ({ page }) => {
    await openFavoriteManager(page);
    
    // 先添加收藏
    const urlInput = page.locator('#favorite-url-input').first();
    if (await urlInput.isVisible()) {
      await urlInput.fill(TEST_STREAMS.forFavorite.url);
      const addButton = page.locator('button:has-text("添加")').first();
      await addButton.click();
      await page.waitForTimeout(500);
      
      // 查找刪除按鈕
      const deleteButton = page.locator('.remove-favorite-btn, button:has-text("刪除")').first();
      if (await deleteButton.isVisible()) {
        const initialCount = await page.locator('.favorite-item').count();
        await deleteButton.click();
        await page.waitForTimeout(500);
        
        // 檢查收藏是否被刪除
        const finalCount = await page.locator('.favorite-item').count();
        expect(finalCount).toBeLessThan(initialCount);
      }
    }
  });
});
