import { useLayoutEffect } from 'react';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  locale?: string;
}

// 預設 title 與 LandingPage 對齊，避免空 props 落到舊預設值產生雙標題
// 任何未明確傳 title 的頁面都會用此值；新頁面建議明確傳 title
export const DEFAULT_TITLE = 'MultiStream Hub - 免費多平台直播觀看工具 | 同時觀看 Twitch & YouTube (Free Multistreaming)';

export function SEO({
  title = DEFAULT_TITLE,
  description = 'MultiStream Hub 是一個完全免費的多平台直播串流觀看工具，支援同時觀看多個 Twitch 和 YouTube 直播。提供多種布局模式、聊天室整合、音量控制和收藏功能，無需註冊即可使用。',
  keywords = 'MultiStream, 多串流, Twitch, YouTube, 直播, 串流觀看, 多平台直播, 直播工具, 免費直播工具, 同時觀看多個直播, 直播整合, 聊天室整合',
  image = 'https://multistreaming.org/icon.png',
  url = 'https://multistreaming.org/',
  type = 'website',
  locale = 'zh_TW',
}: SEOProps) {
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
    updateMetaTag('keywords', keywords);

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

    // 更新 canonical URL
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);
  }, [title, description, keywords, image, url, type, locale]);

  return null; // 此組件不渲染任何內容
}



