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
  
  // 檢測用戶地理位置
  detectUserCountry: function() {
    return new Promise((resolve) => {
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
      fetch('https://ipapi.co/json/')
        .then(response => response.json())
        .then(data => {
          const countryCode = data.country_code || null;
          // 緩存結果
          if (countryCode) {
            localStorage.setItem('user_country', countryCode);
            localStorage.setItem('user_country_timestamp', Date.now().toString());
          }
          resolve(countryCode);
        })
        .catch(error => {
          console.warn('無法檢測地理位置，默認顯示同意視窗:', error);
          // 如果檢測失敗，為了安全起見，默認顯示同意視窗
          resolve(null);
        });
    });
  },
  
  // 檢查是否需要顯示同意視窗
  shouldShowConsentBanner: async function() {
    const countryCode = await this.detectUserCountry();
    // 如果無法檢測到國家，為了安全起見，顯示同意視窗
    if (!countryCode) {
      return true;
    }
    // 只有在 GDPR_COUNTRIES 列表中的國家才需要顯示同意視窗
    return GDPR_COUNTRIES.includes(countryCode);
  },
  
  // 初始化
  init: async function() {
    // 從 localStorage 讀取之前的同意狀態
    const savedConsent = this.getSavedConsent();
    if (savedConsent) {
      this.consent = savedConsent;
      this.applyConsent();
    } else {
      // 檢查是否需要顯示同意視窗
      const shouldShow = await this.shouldShowConsentBanner();
      if (shouldShow) {
        // 如果需要顯示，顯示同意橫幅
        this.showConsentBanner();
      } else {
        // 如果不需要顯示（非 GDPR 國家），默認同意
        this.consent.analytics = true;
        this.consent.ads = true;
        this.saveConsent();
        this.applyConsent();
      }
    }
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
      console.error('保存同意狀態失敗:', e);
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
  
  // 設置 Consent Mode v2
  setConsentMode: function() {
    // 初始化 dataLayer
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
    
    // 如果 gtag 已載入，直接設置
    if (typeof gtag !== 'undefined') {
      gtag('consent', 'update', consentParams);
    } else {
      // 如果 gtag 尚未載入，先設置默認值
      window.dataLayer.push({
        'event': 'consent',
        'consent': consentParams
      });
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
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-6M97WLJG2Z';
    document.head.appendChild(script);
    
    // 初始化 gtag
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = gtag;
    gtag('js', new Date());
    
    // 設置 Consent Mode
    this.setConsentMode();
    
    // 配置 Google Analytics
    gtag('config', 'G-6M97WLJG2Z', {
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

