import { useEffect, useRef } from 'react';
import { useUIStore } from '../store/useUIStore';
import { logPageView, isTrackingEnabled } from '../utils/analytics';
import { pathToPage, pageToPath } from '../config/routes';

export function useRouter() {
    const page = useUIStore(s => s.page);
    const setPage = useUIStore(s => s.setPage);
    const isFirstRender = useRef(true);

    // 初始化：從 URL 設定 Page 狀態（對照表見 src/config/routes.ts）
    // 註：useUIStore 的 page 初值已由 pathToPage(location.pathname) 推導，
    // 這裡首次 setPage 是同值 no-op，不會觸發下方 URL 同步去 pushState。
    useEffect(() => {
        const handlePopState = () => {
            setPage(pathToPage(window.location.pathname));
        };

        // 初始執行一次
        handlePopState();

        // 監聽瀏覽器上一頁/下一頁
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [setPage]);

    // 同步：當 Page 狀態改變時更新 URL
    // 順序重要：必須宣告在下方 GA4 pageview effect 之前，同一次 commit 內先 pushState，
    // logPageView 讀到的 location.href / pathname 才是新頁面（否則 page_location 會是上一頁）。
    useEffect(() => {
        const path = window.location.pathname;
        // 404 回 null：不主動改變 URL，保留使用者輸入的錯誤網址
        const targetPath = pageToPath(page);
        if (targetPath === null) return;

        // 避免重複 pushState (例如從 URL 初始化時已經是該路徑)
        // 注意：這裡簡單比對，忽略 index.html 或結尾斜線差異
        const currentPathNormalized = path.replace(/\/$/, '') || '/';
        const targetPathNormalized = targetPath.replace(/\/$/, '') || '/';

        if (currentPathNormalized !== targetPathNormalized) {
            // 如果目前是 .html 結尾 (來自舊連結或是靜態檔)，我們使用 replaceState 改為乾淨的 URL
            // 或者如果是全新的頁面切換，使用 pushState
            if (path.endsWith('.html')) {
                window.history.replaceState(null, '', targetPath);
            } else {
                window.history.pushState(null, '', targetPath);
            }
        }
    }, [page]);

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
