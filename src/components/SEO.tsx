import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SUPPORTED_LANGS,
  X_DEFAULT_LANG,
  OG_LOCALE_MAP,
  buildAbsoluteUrl,
  isSupportedLang,
  DEFAULT_LANG,
  type SupportedLang,
} from '../lib/i18nRouting';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  /** 不含 lang prefix 的子路徑，例如 '/'、'/about'、'/faq' */
  pathWithoutLang?: string;
  type?: 'website' | 'article';
  /** 自訂 robots 指令，例如 'noindex, nofollow'（admin 等不公開頁） */
  robots?: string;
}

const SITE_ORIGIN = 'https://multistreaming.org';

const HREFLANG_MARKER = 'data-seo-hreflang';

function resolveLang(raw: string | undefined): SupportedLang {
  if (raw && isSupportedLang(raw)) return raw;
  return DEFAULT_LANG;
}

export function SEO({
  title = 'MultiStream Hub｜多直播同步觀看工具',
  description = '免費同時觀看多個 Twitch 與 YouTube 直播，無需註冊。多種布局模式、聊天室整合、獨立音量控制與本地收藏管理。',
  keywords = '多直播觀看, multistream, multi twitch viewer, Twitch 多視窗, 同時觀看多個直播',
  image = `${SITE_ORIGIN}/icon.png`,
  pathWithoutLang = '/',
  type = 'website',
  robots,
}: SEOProps) {
  const { i18n } = useTranslation();
  const lang = resolveLang(i18n.language);
  const ogLocale = OG_LOCALE_MAP[lang];
  const canonical = buildAbsoluteUrl(lang, pathWithoutLang, SITE_ORIGIN);

  useEffect(() => {
    document.title = title;

    const updateMetaTag = (key: string, content: string, isProperty = false) => {
      const selector = isProperty ? `meta[property="${key}"]` : `meta[name="${key}"]`;
      let element = document.querySelector(selector) as HTMLMetaElement | null;
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(isProperty ? 'property' : 'name', key);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    // Primary
    updateMetaTag('title', title);
    updateMetaTag('description', description);
    updateMetaTag('keywords', keywords);
    if (robots) {
      updateMetaTag('robots', robots);
    } else {
      updateMetaTag('robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    }

    // Open Graph
    updateMetaTag('og:type', type, true);
    updateMetaTag('og:url', canonical, true);
    updateMetaTag('og:title', title, true);
    updateMetaTag('og:description', description, true);
    updateMetaTag('og:image', image, true);
    updateMetaTag('og:locale', ogLocale, true);

    // Twitter
    updateMetaTag('twitter:card', 'summary_large_image');
    updateMetaTag('twitter:url', canonical);
    updateMetaTag('twitter:title', title);
    updateMetaTag('twitter:description', description);
    updateMetaTag('twitter:image', image);

    // Canonical
    let canonicalEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalEl) {
      canonicalEl = document.createElement('link');
      canonicalEl.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute('href', canonical);

    // Hreflang：每次 effect 先清掉舊有由 SEO 元件產生的 alternate links，再重建
    document.head.querySelectorAll(`link[rel="alternate"][${HREFLANG_MARKER}]`).forEach(el => el.remove());
    const fragment = document.createDocumentFragment();
    SUPPORTED_LANGS.forEach(l => {
      const link = document.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', l);
      link.setAttribute('href', buildAbsoluteUrl(l, pathWithoutLang, SITE_ORIGIN));
      link.setAttribute(HREFLANG_MARKER, '');
      fragment.appendChild(link);
    });
    const xDefault = document.createElement('link');
    xDefault.setAttribute('rel', 'alternate');
    xDefault.setAttribute('hreflang', 'x-default');
    xDefault.setAttribute('href', buildAbsoluteUrl(X_DEFAULT_LANG, pathWithoutLang, SITE_ORIGIN));
    xDefault.setAttribute(HREFLANG_MARKER, '');
    fragment.appendChild(xDefault);
    document.head.appendChild(fragment);

    // <html lang="..."> 也同步，協助無障礙與爬蟲識別
    document.documentElement.setAttribute('lang', lang);
  }, [title, description, keywords, image, canonical, ogLocale, type, robots, pathWithoutLang, lang]);

  return null;
}
