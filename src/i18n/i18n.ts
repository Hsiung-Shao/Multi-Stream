import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { SUPPORTED_LANGS, parsePath } from '../lib/i18nRouting';

// Import namespaced translations for zh-TW as default/fallback
import zhTWCommon from './locales/zh-TW/common';
import zhTWNavbar from './locales/zh-TW/navbar';
import zhTWControlPanel from './locales/zh-TW/controlPanel';
import zhTWWelcome from './locales/zh-TW/welcome';
import zhTWAbout from './locales/zh-TW/about';
import zhTWTutorial from './locales/zh-TW/tutorial';
import zhTWVersionHistory from './locales/zh-TW/versionHistory';
import zhTWFavorites from './locales/zh-TW/favorites';
import zhTWFeedback from './locales/zh-TW/feedback';
import zhTWPrivacy from './locales/zh-TW/privacy';
import zhTWTags from './locales/zh-TW/tags';
import zhTWYoutubeRisk from './locales/zh-TW/youtubeRisk';
import zhTWStream from './locales/zh-TW/stream';
import zhTWFAQ from './locales/zh-TW/faq';
import zhTWVtuber from './locales/zh-TW/vtuber';
import zhTWSeo from './locales/zh-TW/seo';

// Import other locales
import zhCNCommon from './locales/zh-CN/common';
import zhCNNavbar from './locales/zh-CN/navbar';
import zhCNControlPanel from './locales/zh-CN/controlPanel';
import zhCNWelcome from './locales/zh-CN/welcome';
import zhCNAbout from './locales/zh-CN/about';
import zhCNTutorial from './locales/zh-CN/tutorial';
import zhCNVersionHistory from './locales/zh-CN/versionHistory';
import zhCNFavorites from './locales/zh-CN/favorites';
import zhCNFeedback from './locales/zh-CN/feedback';
import zhCNPrivacy from './locales/zh-CN/privacy';
import zhCNTags from './locales/zh-CN/tags';
import zhCNYoutubeRisk from './locales/zh-CN/youtubeRisk';
import zhCNStream from './locales/zh-CN/stream';
import zhCNFAQ from './locales/zh-CN/faq';
import zhCNVtuber from './locales/zh-CN/vtuber';
import zhCNSeo from './locales/zh-CN/seo';

import enCommon from './locales/en/common';
import enNavbar from './locales/en/navbar';
import enControlPanel from './locales/en/controlPanel';
import enWelcome from './locales/en/welcome';
import enAbout from './locales/en/about';
import enTutorial from './locales/en/tutorial';
import enVersionHistory from './locales/en/versionHistory';
import enFavorites from './locales/en/favorites';
import enFeedback from './locales/en/feedback';
import enPrivacy from './locales/en/privacy';
import enTags from './locales/en/tags';
import enYoutubeRisk from './locales/en/youtubeRisk';
import enStream from './locales/en/stream';
import enFAQ from './locales/en/faq';
import enVtuber from './locales/en/vtuber';
import enSeo from './locales/en/seo';

import jaCommon from './locales/ja/common';
import jaNavbar from './locales/ja/navbar';
import jaControlPanel from './locales/ja/controlPanel';
import jaWelcome from './locales/ja/welcome';
import jaAbout from './locales/ja/about';
import jaTutorial from './locales/ja/tutorial';
import jaVersionHistory from './locales/ja/versionHistory';
import jaFavorites from './locales/ja/favorites';
import jaFeedback from './locales/ja/feedback';
import jaPrivacy from './locales/ja/privacy';
import jaTags from './locales/ja/tags';
import jaYoutubeRisk from './locales/ja/youtubeRisk';
import jaStream from './locales/ja/stream';
import jaFAQ from './locales/ja/faq';
import jaVtuber from './locales/ja/vtuber';
import jaSeo from './locales/ja/seo';

import koCommon from './locales/ko/common';
import koNavbar from './locales/ko/navbar';
import koControlPanel from './locales/ko/controlPanel';
import koWelcome from './locales/ko/welcome';
import koAbout from './locales/ko/about';
import koTutorial from './locales/ko/tutorial';
import koVersionHistory from './locales/ko/versionHistory';
import koFavorites from './locales/ko/favorites';
import koFeedback from './locales/ko/feedback';
import koPrivacy from './locales/ko/privacy';
import koTags from './locales/ko/tags';
import koYoutubeRisk from './locales/ko/youtubeRisk';
import koStream from './locales/ko/stream';
import koFAQ from './locales/ko/faq';
import koVtuber from './locales/ko/vtuber';
import koSeo from './locales/ko/seo';

export const defaultNS = 'common';

export const resources = {
    'zh-TW': {
        common: zhTWCommon,
        navbar: zhTWNavbar,
        controlPanel: zhTWControlPanel,
        welcome: zhTWWelcome,
        about: zhTWAbout,
        tutorial: zhTWTutorial,
        versionHistory: zhTWVersionHistory,
        favorites: zhTWFavorites,
        feedback: zhTWFeedback,
        privacy: zhTWPrivacy,
        tags: zhTWTags,
        youtubeRisk: zhTWYoutubeRisk,
        stream: zhTWStream,
        faq: zhTWFAQ,
        vtuber: zhTWVtuber,
        seo: zhTWSeo,
    },
    'zh-CN': {
        common: zhCNCommon,
        navbar: zhCNNavbar,
        controlPanel: zhCNControlPanel,
        welcome: zhCNWelcome,
        about: zhCNAbout,
        tutorial: zhCNTutorial,
        versionHistory: zhCNVersionHistory,
        favorites: zhCNFavorites,
        feedback: zhCNFeedback,
        privacy: zhCNPrivacy,
        tags: zhCNTags,
        youtubeRisk: zhCNYoutubeRisk,
        stream: zhCNStream,
        faq: zhCNFAQ,
        vtuber: zhCNVtuber,
        seo: zhCNSeo,
    },
    en: {
        common: enCommon,
        navbar: enNavbar,
        controlPanel: enControlPanel,
        welcome: enWelcome,
        about: enAbout,
        tutorial: enTutorial,
        versionHistory: enVersionHistory,
        favorites: enFavorites,
        feedback: enFeedback,
        privacy: enPrivacy,
        tags: enTags,
        youtubeRisk: enYoutubeRisk,
        stream: enStream,
        faq: enFAQ,
        vtuber: enVtuber,
        seo: enSeo,
    },
    ja: {
        common: jaCommon,
        navbar: jaNavbar,
        controlPanel: jaControlPanel,
        welcome: jaWelcome,
        about: jaAbout,
        tutorial: jaTutorial,
        versionHistory: jaVersionHistory,
        favorites: jaFavorites,
        feedback: jaFeedback,
        privacy: jaPrivacy,
        tags: jaTags,
        youtubeRisk: jaYoutubeRisk,
        stream: jaStream,
        faq: jaFAQ,
        vtuber: jaVtuber,
        seo: jaSeo,
    },
    ko: {
        common: koCommon,
        navbar: koNavbar,
        controlPanel: koControlPanel,
        welcome: koWelcome,
        about: koAbout,
        tutorial: koTutorial,
        versionHistory: koVersionHistory,
        favorites: koFavorites,
        feedback: koFeedback,
        privacy: koPrivacy,
        tags: koTags,
        youtubeRisk: koYoutubeRisk,
        stream: koStream,
        faq: koFAQ,
        vtuber: koVtuber,
        seo: koSeo,
    },
} as const;

// 自製 path detector：從 URL 第一段（例如 /zh-TW/about）解析語言
// 必須在 i18n.init 之前 addDetector 才會被 detection.order 中的 'path' 識別
const languageDetector = new LanguageDetector();
languageDetector.addDetector({
    name: 'path',
    lookup() {
        if (typeof window === 'undefined') return undefined;
        const { lang } = parsePath(window.location.pathname);
        return lang ?? undefined;
    },
});

i18n
    .use(languageDetector)
    .use(initReactI18next)
    .init({
        resources,
        defaultNS,
        supportedLngs: [...SUPPORTED_LANGS],
        // load: 'currentOnly' 防止 i18next 把 'zh-TW' 拆成 base 'zh' 去查；
        // 我們的 resources 沒有 'zh' 這層，會導致 t() fallback 到英文
        load: 'currentOnly',
        keySeparator: false,
        nsSeparator: ':',
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ['path', 'localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'i18nextLng',
        },
        react: {
            useSuspense: false,
        },
    });

export default i18n;
