import { useEffect, useRef } from 'react';
import i18n from 'i18next';
import { useUIStore } from '../store/useUIStore';
import { logPageView, logEvent, isTrackingEnabled } from '../utils/analytics';
import { trackPageView, trackEvent } from '../utils/umami';
import {
    DEFAULT_LANG,
    isSupportedLang,
    isRoutablePage,
    parsePath,
    pathToPage,
    pageToPath,
    buildLangUrl,
    type SupportedLang,
} from '../lib/i18nRouting';

function resolveLang(): SupportedLang {
    const current = i18n.language;
    if (isSupportedLang(current)) return current;
    const base = (current ?? '').split('-')[0];
    if (base === 'zh') return 'zh-TW';
    if (base === 'en') return 'en';
    if (base === 'ja') return 'ja';
    if (base === 'ko') return 'ko';
    return DEFAULT_LANG;
}

export function useRouter() {
    const page = useUIStore(s => s.page);
    const setPage = useUIStore(s => s.setPage);
    const isFirstRender = useRef(true);

    // 從 URL 偵測語言與頁面，必要時 replaceState 補上 lang prefix
    useEffect(() => {
        const handlePopState = () => {
            const { lang, subpath } = parsePath(window.location.pathname);

            if (!lang) {
                // 無 prefix：補上偵測到的語言（不增加 history 長度）
                // 保留 search 與 hash — OAuth callback 的 #access_token 依靠後續元件讀取
                const target = resolveLang();
                const newUrl = buildLangUrl(target, subpath) + window.location.search + window.location.hash;
                window.history.replaceState(null, '', newUrl);
                setPage(pathToPage(subpath));
                return;
            }

            if (lang !== i18n.language) {
                i18n.changeLanguage(lang);
            }
            setPage(pathToPage(subpath));
        };

        handlePopState();
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [setPage]);

    // 監聽 i18next 語言切換 → 即時更新 URL prefix（保留 subpath）
    useEffect(() => {
        const handler = (lng: string) => {
            if (!isSupportedLang(lng)) return;
            const { subpath } = parsePath(window.location.pathname);
            const targetPath = buildLangUrl(lng, subpath);
            if (window.location.pathname !== targetPath) {
                // 保留 search 與 hash（避免清掉 OAuth callback 等狀態）
                window.history.replaceState(null, '', targetPath + window.location.search + window.location.hash);
            }
        };
        i18n.on('languageChanged', handler);
        return () => i18n.off('languageChanged', handler);
    }, []);

    // 頁面切換追蹤
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        if (page === 'not-found') return;
        if (isTrackingEnabled()) {
            logPageView();
            logEvent('Navigation', 'page_view', page);
            trackPageView(window.location.pathname);
            trackEvent('page-navigate', { page });
        }
    }, [page]);

    // page 狀態變更 → 同步 URL，保留當前 lang prefix
    useEffect(() => {
        if (page === 'not-found') return;
        if (!isRoutablePage(page)) return; // 'landing'、'settings' 等非路由頁面不改 URL

        const lang = resolveLang();
        const targetSubpath = pageToPath(page);
        const targetUrl = buildLangUrl(lang, targetSubpath);

        const currentNormalized = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
        const targetNormalized = targetUrl.replace(/\/$/, '') || '/';

        if (currentNormalized === targetNormalized) return;

        // 保留 search 與 hash — OAuth 等流程依賴 hash 由 lazy-loaded 元件後續讀取
        const fullUrl = targetUrl + window.location.search + window.location.hash;

        if (window.location.pathname.endsWith('.html')) {
            window.history.replaceState(null, '', fullUrl);
        } else {
            window.history.pushState(null, '', fullUrl);
        }
    }, [page]);
}
