import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { splitLangPath } from '../../functions/lib/locale.js';

// 翻譯一律依當前語言動態載入（見下方 lazyLoaders / ensureLanguageLoaded），不進首屏 entry：
// 原本 zh-TW＋en 全部 namespace 靜態打包，佔 entry 393KB，拖慢手機 LCP。型別由 src/i18next.d.ts 以 import type 取 zh-TW。
export const defaultNS = 'common';

// 網址語言優先：/zh-TW/... 一律繁中（functions/lib/locale.js 的 splitLangPath），沒有前綴才看 localStorage／navigator。
// 網址命中只決定「這一頁」的語言，不改使用者的長期偏好：i18next 的 caches 會在 init 時把偵測結果寫進 i18nextLng，
// 所以先記下原值，init 後還原（原本沒有就刪掉剛寫入的那筆）。使用者手動切語言仍照常寫入。
const detector = new LanguageDetector();
const readStoredLng = () => {
    try {
        return typeof window !== 'undefined' ? window.localStorage.getItem('i18nextLng') : null;
    } catch {
        return null;
    }
};
let urlLangHit = false;
detector.addDetector({
    name: 'urlPath',
    lookup: () => {
        const lang = typeof window !== 'undefined' ? splitLangPath(window.location.pathname).lang : null;
        urlLangHit = !!lang;
        return lang ?? undefined;
    },
});
const storedLngBeforeInit = readStoredLng();

i18n
    .use(detector)
    .use(initReactI18next)
    .init({
        resources: {}, // 由 ensureLanguageLoaded 補上
        defaultNS,
        keySeparator: false, // Disable key separator to support flat keys with dots
        nsSeparator: ':',
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false, // react already safes from xss
        },
        detection: {
            order: ['urlPath', 'localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'i18nextLng',
        },
        react: {
            useSuspense: false, // Set to true if you want to use Suspense
        },
    });

// init 為同步流程（語言偵測不需資源）：網址命中時還原偏好（見上方說明）
if (urlLangHit && typeof window !== 'undefined') {
    try {
        if (storedLngBeforeInit) window.localStorage.setItem('i18nextLng', storedLngBeforeInit);
        else window.localStorage.removeItem('i18nextLng');
    } catch {
        // 儲存被封鎖：偏好本來就存不了，略過
    }
}

// ===== 其餘語言的 lazy load =====
// 每個語言一個動態 chunk；main.tsx 首次 render 前 await，entry-server 預渲染前 await。
type LocaleBundle = Record<string, object>; // namespace → 資源（可巢狀，如 welcome）
const lazyLoaders: Record<string, () => Promise<{ default: LocaleBundle }>> = {
    'zh-TW': () => import('./locales/zh-TW'),
    en: () => import('./locales/en'),
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

const loadBundle = (key: string): Promise<void> => {
    if (loadedLazyLangs.has(key)) return Promise.resolve();
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

/**
 * 確保指定語言的翻譯資源已載入；不支援的語言（如 zh-HK）載 en（fallbackLng）。
 * en 是缺 key 時的備援：zh-CN / ja / ko 一起等；zh-TW 的 key 齊全，en 等頁面 load 後才補（不跟首屏圖片搶頻寬）。
 */
export const ensureLanguageLoaded = (lng?: string): Promise<void> => {
    const key = resolveLazyKey(lng) ?? 'en';
    if (key === 'zh-TW') {
        if (typeof window !== 'undefined') {
            const later = () => setTimeout(() => void loadBundle('en'), 0);
            if (document.readyState === 'complete') later();
            else window.addEventListener('load', later, { once: true });
        }
        return loadBundle(key);
    }
    return Promise.all([loadBundle(key), loadBundle('en')]).then(() => undefined);
};

// 執行期切換語言時，補載資源後再重新觸發 render（首次切到該語言才需要）
i18n.on('languageChanged', (lng) => {
    const key = resolveLazyKey(lng) ?? 'en';
    if (loadedLazyLangs.has(key)) return;
    ensureLanguageLoaded(lng).then(() => {
        // 載入失敗時 loadedLazyLangs 仍沒有 key：不重觸發，否則 languageChanged 會無限循環
        if (i18n.language === lng && loadedLazyLangs.has(key)) i18n.changeLanguage(lng);
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
syncHtmlLang(i18n.language); // init 為同步流程，此時 language 已解析完成
i18n.on('languageChanged', syncHtmlLang);

export default i18n;
