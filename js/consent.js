// Cookie 同意管理系統
// 支援 Consent Mode v2 和 GDPR/CCPA 合規

// 只需要對這幾個國家/地區跳明確同意彈窗（2025年底實務標準）
const GDPR_COUNTRIES = [
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
  'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',  // EU 27
  'GB',  // 英國
  'CH',  // 瑞士
  'NO','IS','LI'  // EEA 其他
];

const consentManager = {
  // 同意狀態
  consent: {
    analytics: null,  // null = 未選擇, true = 同意, false = 拒絕
    ads: null
  },
  
  // 檢測用戶地理位置（改進版）
  detectUserCountry: function() {
    return new Promise((resolve) => {
      // 檢查是否為測試模式（測試模式下直接使用設置的國家代碼，不檢查過期）
      const testMode = localStorage.getItem('test_country_mode');
      if (testMode === 'true') {
        const testCountry = localStorage.getItem('user_country');
        if (testCountry) {
          console.log(`[測試模式] 使用測試國家: ${testCountry}`);
          resolve(testCountry);
          return;
        }
      }
      
      // 嘗試從 localStorage 讀取緩存的地理位置
      const cachedCountry = localStorage.getItem('user_country');
      const cacheTimestamp = localStorage.getItem('user_country_timestamp');
      const cacheAge = cacheTimestamp ? Date.now() - parseInt(cacheTimestamp) : Infinity;
      
      // 如果緩存未過期（24小時內），直接使用
      if (cachedCountry && cacheAge < 24 * 60 * 60 * 1000) {
        resolve(cachedCountry);
        return;
      }
      
      // 使用免費的 IP 地理位置 API
      // 添加超時處理（5秒超時）
      let timeoutId;
      let isResolved = false;
      
      const handleError = (error) => {
        if (isResolved) return;
        clearTimeout(timeoutId);
        console.warn('地區偵測失敗:', error);
        // 如果檢測失敗，嘗試使用過期的緩存
        const expiredCache = localStorage.getItem('user_country');
        if (expiredCache) {
          isResolved = true;
          resolve(expiredCache);
        } else {
          // 沒有緩存，使用瀏覽器語言作為提示
          const browserLang = navigator.language || navigator.userLanguage || '';
          const langCountry = browserLang.split('-')[1]?.toUpperCase();
          // 如果瀏覽器語言對應的國家在 GDPR 列表中，返回該國家代碼
          if (langCountry && GDPR_COUNTRIES.includes(langCountry)) {
            isResolved = true;
            resolve(langCountry);
          } else {
            // 保守處理：返回 null（視為可能需要同意，顯示同意橫幅）
            isResolved = true;
            resolve(null);
          }
        }
      };
      
      // 設置超時
      timeoutId = setTimeout(() => {
        if (!isResolved) {
          handleError(new Error('地區偵測超時'));
        }
      }, 5000);
      
      // 發起請求
      fetch('https://ipapi.co/json/', {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          if (isResolved) return;
          clearTimeout(timeoutId);
          // 更嚴格的驗證
          if (data && typeof data === 'object' && data.country_code) {
            const countryCode = data.country_code.toUpperCase();
            // 驗證國家代碼格式（2個大寫字母）
            if (/^[A-Z]{2}$/.test(countryCode)) {
              // 緩存結果
              localStorage.setItem('user_country', countryCode);
              localStorage.setItem('user_country_timestamp', Date.now().toString());
              isResolved = true;
              resolve(countryCode);
            } else {
              throw new Error('Invalid country code format');
            }
          } else {
            throw new Error('Invalid API response format');
          }
        })
        .catch(error => {
          if (!isResolved) {
            handleError(error);
          }
        });
    });
  },
  
  // 檢查是否需要顯示同意視窗（改進版）
  shouldShowConsentBanner: async function() {
    try {
      const countryCode = await this.detectUserCountry();
      // 如果無法檢測到國家，保守處理：顯示同意橫幅
      if (!countryCode) {
        // 改為返回 true，確保用戶有機會選擇
        return true; // 保守處理：無法確定時顯示橫幅
      }
      // 只有在 GDPR_COUNTRIES 列表中的國家才需要顯示同意視窗
      return GDPR_COUNTRIES.includes(countryCode);
    } catch (error) {
      console.error('檢查同意橫幅時發生錯誤:', error);
      // 錯誤時保守處理：顯示同意橫幅
      return true;
    }
  },
  
  // 初始化
  init: async function() {
    // 從 localStorage 讀取之前的同意狀態
    const savedConsent = this.getSavedConsent();
    if (savedConsent) {
      // 如果已有保存的同意狀態，直接應用（不顯示橫幅）
      this.consent = savedConsent;
      this.applyConsent();
      console.log('[Consent] 使用已保存的同意狀態:', savedConsent);
    } else {
      // 檢查是否需要顯示同意視窗
      const shouldShow = await this.shouldShowConsentBanner();
      console.log('[Consent] 需要顯示同意橫幅:', shouldShow);
      if (shouldShow) {
        // 如果需要顯示，顯示同意橫幅
        this.showConsentBanner();
      } else {
        // 如果不需要顯示（非 GDPR 國家），默認同意
        this.consent.analytics = true;
        this.consent.ads = true;
        this.saveConsent();
        this.applyConsent();
        console.log('[Consent] 非 GDPR 國家，自動同意');
      }
    }
  },
  
  // 調試函數：診斷為什麼沒有顯示橫幅
  debug: async function() {
    console.log('=== Consent 系統調試 ===\n');
    
    // 1. 檢查已保存的同意狀態
    const savedConsent = this.getSavedConsent();
    if (savedConsent) {
      console.log('⚠ 發現已保存的同意狀態:', savedConsent);
      console.log('   這是為什麼沒有顯示橫幅的原因！');
      console.log('   解決方法: 執行 consentManager.clearSavedConsent() 清除同意狀態\n');
    } else {
      console.log('✓ 沒有已保存的同意狀態\n');
    }
    
    // 2. 檢查地區偵測
    try {
      const country = await this.detectUserCountry();
      console.log('地區偵測結果:', country || '無法偵測');
      
      const isGDPR = country && GDPR_COUNTRIES.includes(country);
      console.log('是否為 GDPR 國家:', isGDPR ? '是' : '否');
      
      const shouldShow = await this.shouldShowConsentBanner();
      console.log('需要顯示同意橫幅:', shouldShow ? '是' : '否');
      console.log('');
    } catch (error) {
      console.error('地區偵測錯誤:', error);
    }
    
    // 3. 檢查當前同意狀態
    console.log('當前同意狀態:', this.consent);
    
    // 4. 檢查測試模式
    const testMode = localStorage.getItem('test_country_mode');
    if (testMode === 'true') {
      console.log('⚠ 測試模式已啟用');
    }
    
    console.log('\n=== 調試完成 ===');
  },
  
  // 清除已保存的同意狀態（用於測試）
  clearSavedConsent: function() {
    localStorage.removeItem('consent_preferences');
    localStorage.removeItem('consent_timestamp');
    this.consent = {
      analytics: null,
      ads: null
    };
    console.log('✓ 已清除已保存的同意狀態');
    console.log('  請重新載入頁面以查看效果');
  },
  
  // 獲取保存的同意狀態
  getSavedConsent: function() {
    try {
      const saved = localStorage.getItem('consent_preferences');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      // 解析失敗，返回 null
    }
    return null;
  },
  
  // 保存同意狀態
  saveConsent: function() {
    try {
      localStorage.setItem('consent_preferences', JSON.stringify(this.consent));
      localStorage.setItem('consent_timestamp', new Date().toISOString());
    } catch (e) {
      // 靜默處理錯誤
    }
  },
  
  // 顯示同意橫幅
  showConsentBanner: function() {
    // 檢查是否已經顯示過橫幅
    if (document.getElementById('consent-banner')) {
      return;
    }
    
    const banner = document.createElement('div');
    banner.id = 'consent-banner';
    banner.className = 'consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie 同意橫幅');
    
    const i18n = window.i18n || { t: (key) => key };
    
    banner.innerHTML = `
      <div class="consent-banner-content">
        <div class="consent-banner-text">
          <p class="consent-banner-description" data-i18n="consentDescription">我們使用 Cookie 和類似技術來分析網站流量並可能顯示廣告。詳細資訊請參閱我們的<a href="/privacy.html" target="_blank" rel="noopener noreferrer" data-i18n="privacyPolicy">隱私權政策</a>。</p>
        </div>
        <div class="consent-banner-buttons">
          <button id="consent-accept" class="consent-btn consent-btn-primary" data-i18n="consentAccept">接受</button>
          <button id="consent-reject" class="consent-btn consent-btn-tertiary" data-i18n="consentReject">拒絕</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(banner);
    
    // 更新多語言
    if (window.i18n) {
      window.i18n.updateAllI18nElements();
    }
    
    // 綁定事件
    this.bindConsentEvents();
    
    // 添加動畫
    setTimeout(() => {
      banner.classList.add('show');
    }, 100);
  },
  
  // 綁定同意橫幅事件
  bindConsentEvents: function() {
    const acceptBtn = document.getElementById('consent-accept');
    const rejectBtn = document.getElementById('consent-reject');
    
    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => {
        this.consent.analytics = true;
        this.consent.ads = true;
        this.acceptConsent();
      });
    }
    
    if (rejectBtn) {
      rejectBtn.addEventListener('click', () => {
        this.consent.analytics = false;
        this.consent.ads = false;
        this.acceptConsent();
      });
    }
  },
  
  // 接受同意
  acceptConsent: function() {
    this.saveConsent();
    this.applyConsent();
    this.hideConsentBanner();
  },
  
  // 應用同意設置
  applyConsent: function() {
    // 設置 Consent Mode v2
    this.setConsentMode();
    
    // 根據同意狀態載入服務
    if (this.consent.analytics) {
      this.loadGoogleAnalytics();
    }
    
    if (this.consent.ads) {
      // AdSense 將由 promotion.js 處理
      // 這裡只需要確保 consent 狀態可用
    }
  },
  
  // 設置 Consent Mode v2（改進版）
  setConsentMode: function() {
    // 確保 dataLayer 已初始化
    window.dataLayer = window.dataLayer || [];
    
    // 設置 Consent Mode v2 參數
    const consentParams = {
      'ad_storage': this.consent.ads ? 'granted' : 'denied',
      'ad_user_data': this.consent.ads ? 'granted' : 'denied',
      'ad_personalization': this.consent.ads ? 'granted' : 'denied',
      'analytics_storage': this.consent.analytics ? 'granted' : 'denied',
      'functionality_storage': 'granted',  // 基本功能始終允許
      'personalization_storage': 'granted',  // 個人化設置始終允許
      'security_storage': 'granted'  // 安全性始終允許
    };
    
    // 先推送默認值到 dataLayer（確保在 gtag 載入前設置）
    window.dataLayer.push({
      'event': 'consent',
      'consent': consentParams
    });
    
    // 如果 gtag 已載入，也調用 gtag consent update
    if (typeof gtag !== 'undefined') {
      try {
        gtag('consent', 'update', consentParams);
      } catch (error) {
        console.warn('gtag consent update 失敗:', error);
      }
    }
  },
  
  // 載入 Google Analytics
  loadGoogleAnalytics: function() {
    // 檢查是否已經載入
    if (document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
      return;
    }
    
    // 載入 gtag.js
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-0DX8PWTS4X';
    document.head.appendChild(script);
    
    // 初始化 gtag
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = gtag;
    gtag('js', new Date());
    
    // 設置 Consent Mode
    this.setConsentMode();
    
    // 配置 Google Analytics
    gtag('config', 'G-0DX8PWTS4X', {
      'anonymize_ip': true,  // IP 匿名化
      'allow_google_signals': this.consent.ads || false,  // 僅在同意廣告時啟用
      'allow_ad_personalization_signals': this.consent.ads || false
    });
  },
  
  // 隱藏同意橫幅
  hideConsentBanner: function() {
    const banner = document.getElementById('consent-banner');
    if (banner) {
      banner.classList.remove('show');
      setTimeout(() => {
        banner.remove();
      }, 300);
    }
  },
  
  // 顯示同意設置（允許用戶修改）
  showConsentSettings: function() {
    this.showConsentBanner();
  },
  
  // 獲取同意狀態
  getConsent: function() {
    return { ...this.consent };
  },
  
  // 檢查是否已同意
  hasConsent: function(type) {
    if (type === 'analytics') {
      return this.consent.analytics === true;
    } else if (type === 'ads') {
      return this.consent.ads === true;
    }
    return false;
  },
  
  // 測試模式：手動設置國家代碼（僅用於開發測試）
  // 使用方法：在控制台執行 consentManager.setTestCountry('DE') 或 consentManager.setTestCountry('US')
  setTestCountry: function(countryCode) {
    if (!countryCode || typeof countryCode !== 'string') {
      console.error('請提供有效的國家代碼（例如：DE, US, TW, JP）');
      return;
    }
    const upperCode = countryCode.toUpperCase();
    if (!/^[A-Z]{2}$/.test(upperCode)) {
      console.error('國家代碼格式錯誤，應為 2 個大寫字母（例如：DE, US）');
      return;
    }
    // 設置測試國家代碼
    localStorage.setItem('user_country', upperCode);
    localStorage.setItem('user_country_timestamp', Date.now().toString());
    localStorage.setItem('test_country_mode', 'true'); // 標記為測試模式
    console.log(`✓ 已設置測試國家: ${upperCode}`);
    console.log(`  GDPR 國家: ${GDPR_COUNTRIES.includes(upperCode) ? '是' : '否'}`);
    console.log(`  需要顯示同意橫幅: ${GDPR_COUNTRIES.includes(upperCode) ? '是' : '否'}`);
    console.log('  提示：重新載入頁面以查看效果');
  },
  
  // 清除測試模式
  clearTestCountry: function() {
    localStorage.removeItem('user_country');
    localStorage.removeItem('user_country_timestamp');
    localStorage.removeItem('test_country_mode');
    console.log('✓ 已清除測試國家設置');
    console.log('  提示：重新載入頁面以使用真實 IP 偵測');
  },
  
  // 獲取當前測試狀態
  getTestStatus: function() {
    const testMode = localStorage.getItem('test_country_mode');
    const country = localStorage.getItem('user_country');
    const timestamp = localStorage.getItem('user_country_timestamp');
    if (testMode && country) {
      const age = timestamp ? Math.floor((Date.now() - parseInt(timestamp)) / 1000 / 60) : '未知';
      return {
        isTestMode: true,
        country: country,
        age: `${age} 分鐘前`,
        isGDPR: GDPR_COUNTRIES.includes(country),
        shouldShowBanner: GDPR_COUNTRIES.includes(country)
      };
    }
    return { isTestMode: false };
  }
};

// 初始化
if (typeof window !== 'undefined') {
  window.consentManager = consentManager;
  
  // 頁面載入完成後初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      consentManager.init();
    });
  } else {
    consentManager.init();
  }
}

