/**
 * Google AdSense 載入器
 *
 * 設計原則（與 GA4/Umami 的同意機制一致）：
 * - AdSense 腳本會設定第三方 cookie，因此只在使用者「接受 Cookie」後才注入，
 *   而非在 index.html 無條件載入。
 * - 未同意時（含 Lighthouse 等首次造訪）完全不載入 → 不設第三方 cookie、
 *   不拖累首屏效能，並符合 GDPR。
 * - idempotent：重複呼叫只會注入一次。
 */

const ADSENSE_CLIENT = 'ca-pub-8415424787944153';
let injected = false;

export const loadAdSense = (): void => {
  if (injected || typeof document === 'undefined') return;

  // 若頁面上已存在 AdSense 腳本（理論上不會，但保險）則視為已注入
  if (document.querySelector('script[src*="adsbygoogle.js"]')) {
    injected = true;
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
  injected = true;
};
