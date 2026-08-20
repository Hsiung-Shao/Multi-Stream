import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

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
import zhTWAnnouncements from './locales/zh-TW/announcements';
import zhTWSeo from './locales/zh-TW/seo';

// 其餘語言（zh-CN / ja / ko）改為 lazy load（見檔案下方 lazyLoaders / ensureLanguageLoaded），
// 只有 zh-TW（預設/主要語言）與 en（fallback + 國際 + 多數偵測情境）會打包進首屏 entry。
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
import enAnnouncements from './locales/en/announcements';
import enSeo from './locales/en/seo';

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
        announcements: zhTWAnnouncements,
        seo: zhTWSeo,
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
        announcements: enAnnouncements,
        seo: enSeo,
    },
} as const;

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        defaultNS,
        keySeparator: false, // Disable key separator to support flat keys with dots
        nsSeparator: ':',
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false, // react already safes from xss
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'i18nextLng',
        },
        react: {
            useSuspense: false, // Set to true if you want to use Suspense
        },
    });

// ===== 其餘語言的 lazy load =====
// zh-TW / en 已打包進首屏 entry；zh-CN / ja / ko 在需要時才動態載入，避免拖累 landing 首屏體積。
type LocaleBundle = Record<string, Record<string, string>>;
const lazyLoaders: Record<string, () => Promise<{ default: LocaleBundle }>> = {
    'zh-CN': () => import('./locales/zh-CN'),
    ja: () => import('./locales/ja'),
    ko: () => import('./locales/ko'),
};
const loadedLazyLangs = new Set<string>();
const lazyPromises = new Map<string, Promise<void>>();

// 將偵測到的語言（可能含地區，如 ja-JP）對應到 lazy loader 的 key。
// 注意：zh 系列必須保留地區（zh-CN / zh-TW 不可化簡為 zh）。
const resolveLazyKey = (lng?: string): string | null => {
    if (!lng) return null;
    if (lazyLoaders[lng]) return lng;
    const base = lng.split('-')[0];
    if (base !== 'zh' && lazyLoaders[base]) return base;
    return null;
};

/**
 * 確保指定語言的翻譯資源已載入（zh-TW / en 一律視為已載入）。
 * 在 main.tsx 首次 render 前 await，可避免 lazy 語言使用者看到 fallback 閃爍。
 */
export const ensureLanguageLoaded = (lng?: string): Promise<void> => {
    const key = resolveLazyKey(lng);
    if (!key || loadedLazyLangs.has(key)) return Promise.resolve();
    if (lazyPromises.has(key)) return lazyPromises.get(key)!;
    const p = lazyLoaders[key]()
        .then((mod) => {
            Object.entries(mod.default).forEach(([ns, res]) => {
                i18n.addResourceBundle(key, ns, res, true, true);
            });
            loadedLazyLangs.add(key);
        })
        .catch(() => {
            // 載入失敗時維持 fallback 語言，不中斷應用
        });
    lazyPromises.set(key, p);
    return p;
};

// 執行期切換語言時，補載資源後再重新觸發 render（首次切到該語言才需要）
i18n.on('languageChanged', (lng) => {
    const key = resolveLazyKey(lng);
    if (!key || loadedLazyLangs.has(key)) return;
    ensureLanguageLoaded(lng).then(() => {
        if (i18n.language === lng) i18n.changeLanguage(lng);
    });
});

// ===== <html lang> 同步 =====
// index.html 靜態 lang="zh-TW"；實際內容語言由 i18next 偵測（localStorage/navigator）決定，
// 不同步會造成「英文內文 + zh-TW lang」的語言訊號錯位（SEO/無障礙皆錯）。
const HTML_LANG: Record<string, string> = { 'zh-TW': 'zh-TW', 'zh-CN': 'zh-CN', en: 'en', ja: 'ja', ko: 'ko' };
export const toHtmlLang = (lng?: string): string => {
    if (!lng) return 'zh-TW';
    if (HTML_LANG[lng]) return HTML_LANG[lng];
    const base = lng.split('-')[0]; // 'en-US' → 'en'；zh 系列上面已精確命中
    return HTML_LANG[base] ?? base;
};
const syncHtmlLang = (lng?: string) => {
    if (typeof document !== 'undefined') {
        document.documentElement.lang = toHtmlLang(lng ?? i18n.language);
    }
};
syncHtmlLang(i18n.language); // init 為同步流程（zh-TW/en 已打包），此時 language 已解析完成
i18n.on('languageChanged', syncHtmlLang);

export default i18n;
