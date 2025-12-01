// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright 測試配置
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: './tests',
  
  // 測試超時時間（30秒）
  timeout: 30000,
  
  // 預期測試失敗時的重試次數
  retries: process.env.CI ? 2 : 0,
  
  // 並行執行的 worker 數量
  workers: process.env.CI ? 1 : undefined,
  
  // 測試報告配置
  reporter: process.env.CI ? 'html' : 'list',
  
  use: {
    // 基礎 URL
    baseURL: 'http://localhost:8000',
    
    // 截圖設置
    screenshot: 'only-on-failure',
    
    // 視頻設置（僅在失敗時錄製）
    video: 'retain-on-failure',
    
    // 追蹤設置
    trace: 'on-first-retry',
  },

  // 配置測試項目
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // 可以添加更多瀏覽器
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // 本地開發伺服器配置（可選）
  // webServer: {
  //   command: 'python3 -m http.server 8000',
  //   url: 'http://localhost:8000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
