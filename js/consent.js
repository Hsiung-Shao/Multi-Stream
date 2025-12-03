// Cookie 同意管理系統
// 支援 Consent Mode v2 和 GDPR/CCPA 合規

const consentManager = {
  // 同意狀態
  consent: {
    analytics: null,  // null = 未選擇, true = 同意, false = 拒絕
    ads: null
  },
  
  // 初始化
  init: function() {
    // 從 localStorage 讀取之前的同意狀態
    const savedConsent = this.getSavedConsent();
    if (savedConsent) {
      this.consent = savedConsent;
      this.applyConsent();
    } else {
      // 如果沒有保存的同意狀態，顯示同意橫幅
      this.showConsentBanner();
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
          <p class="consent-banner-title" data-i18n="consentTitle">我們使用 Cookie 和類似技術</p>
          <p class="consent-banner-description" data-i18n="consentDescription">我們使用 Google Analytics 來分析網站流量，並可能顯示 Google AdSense 廣告。您可以選擇接受或拒絕這些服務。詳細資訊請參閱我們的<a href="/privacy.html" target="_blank" rel="noopener noreferrer" data-i18n="privacyPolicy">隱私權政策</a>。</p>
        </div>
        <div class="consent-banner-options">
          <label class="consent-option">
            <input type="checkbox" id="consent-analytics" checked>
            <span data-i18n="consentAnalytics">分析（Google Analytics）</span>
          </label>
          <label class="consent-option">
            <input type="checkbox" id="consent-ads" checked>
            <span data-i18n="consentAds">廣告（Google AdSense）</span>
          </label>
        </div>
        <div class="consent-banner-buttons">
          <button id="consent-accept-all" class="consent-btn consent-btn-primary" data-i18n="consentAcceptAll">全部接受</button>
          <button id="consent-accept-selected" class="consent-btn consent-btn-secondary" data-i18n="consentAcceptSelected">接受選擇的項目</button>
          <button id="consent-reject-all" class="consent-btn consent-btn-tertiary" data-i18n="consentRejectAll">全部拒絕</button>
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
    const acceptAllBtn = document.getElementById('consent-accept-all');
    const acceptSelectedBtn = document.getElementById('consent-accept-selected');
    const rejectAllBtn = document.getElementById('consent-reject-all');
    
    if (acceptAllBtn) {
      acceptAllBtn.addEventListener('click', () => {
        this.consent.analytics = true;
        this.consent.ads = true;
        this.acceptConsent();
      });
    }
    
    if (acceptSelectedBtn) {
      acceptSelectedBtn.addEventListener('click', () => {
        const analyticsChecked = document.getElementById('consent-analytics')?.checked || false;
        const adsChecked = document.getElementById('consent-ads')?.checked || false;
        this.consent.analytics = analyticsChecked;
        this.consent.ads = adsChecked;
        this.acceptConsent();
      });
    }
    
    if (rejectAllBtn) {
      rejectAllBtn.addEventListener('click', () => {
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
    // 如果有保存的設置，恢復選項
    if (this.consent.analytics !== null) {
      const analyticsCheckbox = document.getElementById('consent-analytics');
      const adsCheckbox = document.getElementById('consent-ads');
      if (analyticsCheckbox) analyticsCheckbox.checked = this.consent.analytics;
      if (adsCheckbox) adsCheckbox.checked = this.consent.ads;
    }
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

