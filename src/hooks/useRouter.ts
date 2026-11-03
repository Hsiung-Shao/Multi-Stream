import { useEffect, useRef } from 'react';
import { useUIStore } from '../store/useUIStore';
import { logPageView, isTrackingEnabled } from '../utils/analytics';
import { useTranslation } from 'react-i18next';
import i18nInstance from '../i18n/i18n';
import { pathToPage, pageToPath } from '../config/routes';
import { splitLangPath, urlLangOf, withLang } from '../../functions/lib/locale.js';

export function useRouter() {
    const page = useUIStore(s => s.page);
    const setPage = useUIStore(s => s.setPage);
    const isFirstRender = useRef(true);
    // 網址語言：只有 zh-TW 有 /zh-TW 前綴，其他介面語言都住在無前綴網址（functions/lib/locale.js）
    const { i18n } = useTranslation();
    const urlLang = urlLangOf(i18n.language);
    const prevPage = useRef(page);

    // 初始化：從 URL 設定 Page 狀態（對照表見 src/config/routes.ts）
    // 註：useUIStore 的 page 初值已由 pathToPage(location.pathname) 推導，
    // 這裡首次 setPage 是同值 no-op，不會觸發下方 URL 同步去 pushState。
    useEffect(() => {
        const handlePopState = () => {
            // 上一頁／下一頁回到切語言前留下的歷史（例如 /about ⇄ /zh-TW/about）：
            // 不改介面語言（那是使用者明確選的，也不能悄悄改寫 i18nextLng），改把網址換成目前語言版，
            // 下方的 URL 同步 effect 看到網址已一致就不會再 pushState。用全域實例，不依賴 hook 回傳的物件。
            const { lang, path } = splitLangPath(window.location.pathname);
            const current = urlLangOf(i18nInstance.language);
            if ((lang ?? 'en') !== current) {
                window.history.replaceState(window.history.state, '', withLang(current, path) + window.location.search + window.location.hash);
            }
            setPage(pathToPage(window.location.pathname));
        };

        // 初始執行一次（只同步 page）
        setPage(pathToPage(window.location.pathname));

        // 監聽瀏覽器上一頁/下一頁
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [setPage]);

    // 同步：Page 或網址語言改變時更新 URL
    // 順序重要：必須宣告在下方 GA4 pageview effect 之前，同一次 commit 內先 pushState，
    // logPageView 讀到的 location.href / pathname 才是新頁面（否則 page_location 會是上一頁）。
    useEffect(() => {
        const path = window.location.pathname;
        const pageChanged = prevPage.current !== page;
        prevPage.current = page;
        // 404 回 null：不主動改變 URL，保留使用者輸入的錯誤網址
        const targetPath = pageToPath(page, urlLang);
        if (targetPath === null) return;

        // 避免重複 pushState (例如從 URL 初始化時已經是該路徑)
        // 注意：這裡簡單比對，忽略 index.html 或結尾斜線差異
        const currentPathNormalized = path.replace(/\/$/, '') || '/';
        const targetPathNormalized = targetPath.replace(/\/$/, '') || '/';

        if (currentPathNormalized !== targetPathNormalized) {
            // .html 舊連結 → replaceState 換成乾淨網址；只是切語言（同一頁換前綴）也用 replaceState，不塞歷史；
            // 真正換頁才 pushState
            if (!pageChanged) {
                // 只是切語言：保留 query／hash 與 history.state（歌回頁的 ?v=、教學的 #段落、songsFrom）
                window.history.replaceState(window.history.state, '', targetPath + window.location.search + window.location.hash);
            } else if (path.endsWith('.html')) {
                window.history.replaceState(null, '', targetPath);
            } else {
                window.history.pushState(null, '', targetPath);
            }
        }
    }, [page, urlLang]);

    // 頁面切換追蹤：當 page 狀態改變時發送 GA4 事件
    useEffect(() => {
        // 跳過首次渲染（App.tsx 已經處理）
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        // 不追蹤 404 頁面
        if (page === 'not-found') return;

        // 發送 pageview 事件
        // 注意：此 useEffect 在所有子元件 effect 之後執行，子層 SEO 元件已用 useLayoutEffect
        // 完成 document.title 更新，所以這裡 logPageView 讀到的 title 已是當前頁面標題；
        // 上方 URL 同步 effect 也已先跑，location 為新頁面。
        // 不再額外送 logEvent('Navigation', 'page_view', page) — 與 logPageView 重複，會雙計
        if (isTrackingEnabled()) {
            logPageView();
        }
    }, [page]);
}
