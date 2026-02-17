import { useEffect, useRef } from 'react';
import { useUIStore } from '../store/useUIStore';
import { logPageView, logEvent, isTrackingEnabled } from '../utils/analytics';
import { trackPageView, trackEvent } from '../utils/umami';

export function useRouter() {
    const page = useUIStore(s => s.page);
    const setPage = useUIStore(s => s.setPage);
    const isFirstRender = useRef(true);

    // 初始化：從 URL 設定 Page 狀態
    useEffect(() => {
        const handlePopState = () => {
            const path = window.location.pathname;
            if (path === '/' || path === '/index.html') {
                setPage('home');
            } else if (path === '/about' || path === '/about.html') {
                setPage('about');
            } else if (path === '/privacy' || path === '/privacy.html') {
                setPage('privacy');
            } else if (path === '/canvas') {
                setPage('canvas');
            } else if (path === '/tools') {
                setPage('tool');
            } else if (path === '/instructions') {
                setPage('instructions');
            } else if (path === '/faq') {
                setPage('faq');
            } else if (path === '/admin') {
                setPage('admin');
            } else {
                setPage('not-found');
            }
        };

        // 初始執行一次
        handlePopState();

        // 監聽瀏覽器上一頁/下一頁
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [setPage]);

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
        if (isTrackingEnabled()) {
            logPageView();
            logEvent('Navigation', 'page_view', page);

            // Umami: SPA 路由追蹤
            trackPageView(window.location.pathname);
            trackEvent('page-navigate', { page });
        }
    }, [page]);

    // 同步：當 Page 狀態改變時更新 URL
    useEffect(() => {
        const path = window.location.pathname;
        let targetPath = '/';

        switch (page) {
            case 'home':
                targetPath = '/';
                break;
            case 'tool':
                targetPath = '/tools';
                break;
            case 'about':
                targetPath = '/about';
                break;
            case 'privacy':
                targetPath = '/privacy';
                break;
            case 'canvas':
                targetPath = '/canvas';
                break;
            case 'instructions':
                targetPath = '/instructions';
                break;
            case 'faq':
                targetPath = '/faq';
                break;
            case 'admin':
                targetPath = '/admin';
                break;
            case 'not-found':
                // 如果是 404，不主動改變 URL，保留使用者輸入的錯誤網址
                return;
            default:
                targetPath = '/';
        }

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
}
