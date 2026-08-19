import { useLayoutEffect } from 'react';
import {
  SEO_DEFAULT_TITLE,
  SEO_DEFAULT_DESCRIPTION,
  SEO_DEFAULT_IMAGE,
  SEO_SITE_URL,
  SEO_ROBOTS_INDEX,
  SEO_ROBOTS_NOINDEX,
} from '../seo/defaults';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  locale?: string;
  jsonLd?: object;
  /** true → robots 設為 noindex,follow 並移除 canonical（404 / admin 等不該進索引的頁面） */
  noindex?: boolean;
}

// 預設 title 與 index.html（build 時由 seoHtmlPlugin 注入同一常數）對齊，單一來源在 src/seo/defaults.ts
// 保留既有 export 名稱供外部引用
export const DEFAULT_TITLE = SEO_DEFAULT_TITLE;

export function SEO({
  title = SEO_DEFAULT_TITLE,
  description = SEO_DEFAULT_DESCRIPTION,
  image = SEO_DEFAULT_IMAGE,
  url = `${SEO_SITE_URL}/`,
  type = 'website',
  locale = 'zh_TW',
  jsonLd,
  noindex = false,
}: SEOProps) {
  // 以序列化字串當依賴,避免呼叫端每次 render 傳新物件導致 effect 重跑
  const jsonLdStr = jsonLd ? JSON.stringify(jsonLd) : null;
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
    updateMetaTag('og:locale', locale, true);

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

    // 更新或移除 JSON-LD 結構化資料(無 jsonLd 時清掉,避免跨頁殘留)
    let ldScript = document.querySelector('script[data-seo-jsonld]') as HTMLScriptElement | null;
    if (jsonLdStr) {
      if (!ldScript) {
        ldScript = document.createElement('script');
        ldScript.type = 'application/ld+json';
        ldScript.setAttribute('data-seo-jsonld', '');
        document.head.appendChild(ldScript);
      }
      ldScript.textContent = jsonLdStr;
    } else if (ldScript) {
      ldScript.remove();
    }
  }, [title, description, image, url, type, locale, jsonLdStr, noindex]);

  return null; // 此組件不渲染任何內容
}
