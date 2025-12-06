// 主題切換功能
// 支援暗色和亮色主題

const themeManager = {
  // 當前主題
  currentTheme: 'dark',
  
  // 初始化主題
  init() {
    // 從 localStorage 讀取保存的主題
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme && (savedTheme === 'dark' || savedTheme === 'light')) {
      this.currentTheme = savedTheme;
    } else {
      // 如果沒有保存的主題，檢查系統偏好
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.currentTheme = prefersDark ? 'dark' : 'light';
    }
    
    // 應用主題
    this.applyTheme(this.currentTheme);
    
    // 監聽系統主題變化
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', (e) => {
        // 只有在用戶沒有手動設置主題時才跟隨系統
        if (!localStorage.getItem('theme')) {
          this.currentTheme = e.matches ? 'dark' : 'light';
          this.applyTheme(this.currentTheme);
        }
      });
    }
    
    // 更新按鈕顯示
    this.updateThemeButton();
  },
  
  // 切換主題
  toggleTheme() {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(this.currentTheme);
    localStorage.setItem('theme', this.currentTheme);
    this.updateThemeButton();
  },
  
  // 設置主題
  setTheme(theme) {
    if (theme !== 'dark' && theme !== 'light') {
      return;
    }
    this.currentTheme = theme;
    this.applyTheme(this.currentTheme);
    localStorage.setItem('theme', this.currentTheme);
    this.updateThemeButton();
  },
  
  // 應用主題
  applyTheme(theme) {
    const html = document.documentElement;
    if (theme === 'light') {
      html.setAttribute('data-theme', 'light');
      // 更新 meta 標籤
      this.updateMetaTags('light');
    } else {
      html.removeAttribute('data-theme');
      // 更新 meta 標籤
      this.updateMetaTags('dark');
    }
  },
  
  // 更新 meta 標籤
  updateMetaTags(theme) {
    // 更新 color-scheme meta 標籤
    let colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
    if (!colorSchemeMeta) {
      colorSchemeMeta = document.createElement('meta');
      colorSchemeMeta.setAttribute('name', 'color-scheme');
      document.head.appendChild(colorSchemeMeta);
    }
    colorSchemeMeta.setAttribute('content', theme);
    
    // 更新 supported-color-schemes meta 標籤
    let supportedColorSchemeMeta = document.querySelector('meta[name="supported-color-schemes"]');
    if (!supportedColorSchemeMeta) {
      supportedColorSchemeMeta = document.createElement('meta');
      supportedColorSchemeMeta.setAttribute('name', 'supported-color-schemes');
      document.head.appendChild(supportedColorSchemeMeta);
    }
    supportedColorSchemeMeta.setAttribute('content', theme);
  },
  
  // 更新主題切換按鈕顯示
  updateThemeButton() {
    // 更新所有 switch 輸入框狀態（支援多個頁面）
    const switchInputs = [
      document.getElementById('theme-switch-input'),
      document.getElementById('about-theme-switch-input'),
      document.getElementById('privacy-theme-switch-input')
    ].filter(input => input !== null);
    
    switchInputs.forEach(input => {
      input.checked = this.currentTheme === 'light';
    });
  },
  
  // 獲取當前主題
  getTheme() {
    return this.currentTheme;
  }
};

// 將 themeManager 暴露到全局
window.themeManager = themeManager;

// 當 DOM 載入完成後初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    themeManager.init();
  });
} else {
  themeManager.init();
}

