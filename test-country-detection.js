// 地區偵測測試腳本
// 在瀏覽器控制台中執行此腳本，或將內容複製到控制台

(function() {
  console.log('=== 地區偵測測試工具 ===\n');
  
  // 測試函數
  const testCountry = async (countryCode, countryName) => {
    console.log(`\n--- 測試國家: ${countryName} (${countryCode}) ---`);
    
    // 設置測試國家
    if (window.consentManager) {
      window.consentManager.setTestCountry(countryCode);
      
      // 等待一下讓設置生效
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 檢查狀態
      const status = window.consentManager.getTestStatus();
      console.log('測試狀態:', status);
      
      // 測試 shouldShowConsentBanner
      const shouldShow = await window.consentManager.shouldShowConsentBanner();
      console.log(`需要顯示同意橫幅: ${shouldShow ? '✓ 是' : '✗ 否'}`);
      
      return {
        country: countryCode,
        name: countryName,
        isGDPR: status.isGDPR,
        shouldShowBanner: shouldShow
      };
    } else {
      console.error('consentManager 未載入');
      return null;
    }
  };
  
  // 常用測試國家列表
  const testCountries = [
    { code: 'DE', name: '德國 (GDPR)' },
    { code: 'FR', name: '法國 (GDPR)' },
    { code: 'GB', name: '英國 (GDPR)' },
    { code: 'US', name: '美國 (非 GDPR)' },
    { code: 'TW', name: '台灣 (非 GDPR)' },
    { code: 'JP', name: '日本 (非 GDPR)' },
    { code: 'CN', name: '中國 (非 GDPR)' },
    { code: 'KR', name: '韓國 (非 GDPR)' },
    { code: 'AU', name: '澳洲 (非 GDPR)' },
    { code: 'CA', name: '加拿大 (非 GDPR)' }
  ];
  
  // 導出測試函數到全局
  window.testCountryDetection = {
    // 測試單個國家
    test: async (countryCode) => {
      const country = testCountries.find(c => c.code === countryCode.toUpperCase());
      if (country) {
        return await testCountry(country.code, country.name);
      } else {
        console.error(`未找到國家代碼: ${countryCode}`);
        console.log('可用的國家代碼:', testCountries.map(c => c.code).join(', '));
      }
    },
    
    // 測試所有常用國家
    testAll: async () => {
      console.log('開始測試所有國家...\n');
      const results = [];
      for (const country of testCountries) {
        const result = await testCountry(country.code, country.name);
        if (result) {
          results.push(result);
        }
        // 等待一下避免太快
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log('\n=== 測試結果總結 ===');
      console.table(results);
      return results;
    },
    
    // 快速測試 GDPR 國家
    testGDPR: async () => {
      console.log('測試 GDPR 國家...\n');
      const gdprCountries = testCountries.filter(c => 
        ['DE', 'FR', 'GB'].includes(c.code)
      );
      const results = [];
      for (const country of gdprCountries) {
        const result = await testCountry(country.code, country.name);
        if (result) {
          results.push(result);
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      return results;
    },
    
    // 快速測試非 GDPR 國家
    testNonGDPR: async () => {
      console.log('測試非 GDPR 國家...\n');
      const nonGdprCountries = testCountries.filter(c => 
        !['DE', 'FR', 'GB'].includes(c.code)
      );
      const results = [];
      for (const country of nonGdprCountries) {
        const result = await testCountry(country.code, country.name);
        if (result) {
          results.push(result);
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      return results;
    },
    
    // 清除測試設置
    clear: () => {
      if (window.consentManager) {
        window.consentManager.clearTestCountry();
        console.log('✓ 已清除測試設置，重新載入頁面以使用真實 IP 偵測');
      }
    },
    
    // 查看當前測試狀態
    status: () => {
      if (window.consentManager) {
        const status = window.consentManager.getTestStatus();
        if (status.isTestMode) {
          console.log('=== 當前測試狀態 ===');
          console.log('測試模式: 啟用');
          console.log('測試國家:', status.country);
          console.log('設置時間:', status.age);
          console.log('是否為 GDPR 國家:', status.isGDPR ? '是' : '否');
          console.log('需要顯示同意橫幅:', status.shouldShowBanner ? '是' : '否');
        } else {
          console.log('測試模式: 未啟用');
          console.log('提示: 使用 testCountryDetection.test("DE") 來設置測試國家');
        }
        return status;
      }
    },
    
    // 列出所有可用的測試國家
    list: () => {
      console.log('=== 可用的測試國家 ===');
      testCountries.forEach(c => {
        const isGDPR = ['DE', 'FR', 'GB', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 
                       'EE', 'FI', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 
                       'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH', 'NO', 
                       'IS', 'LI'].includes(c.code);
        console.log(`${c.code.padEnd(3)} - ${c.name.padEnd(20)} ${isGDPR ? '[GDPR]' : ''}`);
      });
      return testCountries;
    }
  };
  
  console.log('✓ 測試工具已載入！');
  console.log('\n使用方法:');
  console.log('  1. testCountryDetection.test("DE")  - 測試德國');
  console.log('  2. testCountryDetection.test("US")  - 測試美國');
  console.log('  3. testCountryDetection.testAll()    - 測試所有國家');
  console.log('  4. testCountryDetection.testGDPR()  - 只測試 GDPR 國家');
  console.log('  5. testCountryDetection.testNonGDPR() - 只測試非 GDPR 國家');
  console.log('  6. testCountryDetection.status()     - 查看當前測試狀態');
  console.log('  7. testCountryDetection.clear()      - 清除測試設置');
  console.log('  8. testCountryDetection.list()       - 列出所有可用國家');
  console.log('\n提示: 設置測試國家後，需要重新載入頁面才能看到效果');
})();

