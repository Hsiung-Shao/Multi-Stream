import { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SEO_DEFAULT_TITLE,
  SEO_DEFAULT_DESCRIPTION,
  SEO_DEFAULT_IMAGE,
  SEO_SITE_URL,
  SEO_ROBOTS_INDEX,
  SEO_ROBOTS_NOINDEX,
} from '../seo/defaults';
import { toHtmlLang } from '../i18n/i18n';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  /** 覆寫 og:locale；未提供時依當前 i18n 語言自動對應（zh_TW / zh_CN / en_US / ja_JP / ko_KR） */
  locale?: string;
  jsonLd?: object;
  /** true → robots 設為 noindex,follow 並移除 canonical（404 / admin 等不該進索引的頁面） */
  noindex?: boolean;
}

const OG_LOCALE: Record<string, string> = {
  'zh-TW': 'zh_TW',
  'zh-CN': 'zh_CN',
  en: 'en_US',
  ja: 'ja_JP',
  ko: 'ko_KR',
};

// 預設 title 與 index.html（build 時由 seoHtmlPlugin 注入同一常數）對齊，單一來源在 src/seo/defaults.ts
// 保留既有 export 名稱供外部引用
export const DEFAULT_TITLE = SEO_DEFAULT_TITLE;

export function SEO({
  title = SEO_DEFAULT_TITLE,
  description = SEO_DEFAULT_DESCRIPTION,
  image = SEO_DEFAULT_IMAGE,
  url = `${SEO_SITE_URL}/`,
  type = 'website',
  locale,
  jsonLd,
  noindex = false,
}: SEOProps) {
  // useTranslation 讓本元件訂閱 languageChanged：語言切換時 effect 會以新的 og:locale 重跑
  const { i18n } = useTranslation();
  const ogLocale = locale ?? OG_LOCALE[toHtmlLang(i18n.language)] ?? 'zh_TW';
  // 以序列化字串當依賴,避免呼叫端每次 render 傳新物件導致 effect 重跑
  // 跳脫 <：避免 jsonLd 內容含 </script> 時提前關閉 script 標籤（textContent 注入雖不解析 HTML，
  // 但 JSON-LD 會被抓取器原樣讀取，跳脫是 schema.org 建議做法，與 LandingPage FaqJsonLd 一致）
  const jsonLdStr = jsonLd ? JSON.stringify(jsonLd).replace(/</g, '\\u003c') : null;
  // 用 useLayoutEffect 確保 document.title 在瀏覽器繪製前就同步完成，
  // 讓父層 useRouter 的 useEffect（在子元件 effect 後執行）讀到的 title 已是當前頁面標題
  useLayoutEffect(() => {
    // 更新 title
    if (title) {
      document.title = title;
    }

    // 更新或創建 meta 標籤的輔助函數
    const updateMetaTag = (property: string, content: string, isProperty = false) => {
      const selector = isProperty ? `meta[property="${property}"]` : `meta[name="${property}"]`;
      let element = document.querySelector(selector) as HTMLMetaElement;

      if (!element) {
        element = document.createElement('meta');
        if (isProperty) {
          element.setAttribute('property', property);
        } else {
          element.setAttribute('name', property);
        }
        document.head.appendChild(element);
      }

      element.setAttribute('content', content);
    };

    // 更新 Primary Meta Tags
    updateMetaTag('title', title);
    updateMetaTag('description', description);
    // 每個 SEO mount 都重新斷言 robots：從 404/admin（noindex）切回一般頁面時會自動恢復 index
    updateMetaTag('robots', noindex ? SEO_ROBOTS_NOINDEX : SEO_ROBOTS_INDEX);

    // 更新 Open Graph Tags
    updateMetaTag('og:type', type, true);
    updateMetaTag('og:url', url, true);
    updateMetaTag('og:title', title, true);
    updateMetaTag('og:description', description, true);
    updateMetaTag('og:image', image, true);
    updateMetaTag('og:locale', ogLocale, true);

    // 更新 Twitter Card Tags
    updateMetaTag('twitter:card', 'summary_large_image');
    updateMetaTag('twitter:url', url);
    updateMetaTag('twitter:title', title);
    updateMetaTag('twitter:description', description);
    updateMetaTag('twitter:image', image);

    // 更新 canonical URL（noindex 頁面不該宣告 canonical，否則軟 404 會把權重導向首頁）
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (noindex) {
      canonical?.remove();
    } else {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
      }
      canonical.setAttribute('href', url);
    }

  }, [title, description, image, url, type, ogLocale, noindex]);

  // JSON-LD 直接 render 進 tree（而非 effect 寫 document.head）：
  // SSG 預渲染（entry-server.tsx）在 Node 不執行 effect，寫進 tree 才會出現在靜態 HTML；
  // 放在 <body> 內對 Google 同樣有效（與 LandingPage 的 FaqJsonLd 同一做法）。
  // 換頁時該頁沒有 jsonLd → 不 render → 自然不會跨頁殘留。
  if (!jsonLdStr) return null;
  return (
    <script
      type="application/ld+json"
      data-seo-jsonld=""
      dangerouslySetInnerHTML={{ __html: jsonLdStr }}
    />
  );
}
