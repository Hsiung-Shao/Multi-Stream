import { useEffect } from 'react';
import { useUIStore } from '../store/useUIStore';

export function useRouter() {
    const page = useUIStore(s => s.page);
    const setPage = useUIStore(s => s.setPage);

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

    // 同步：當 Page 狀態改變時更新 URL
    useEffect(() => {
        const path = window.location.pathname;
        let targetPath = '/';

        switch (page) {
            case 'home':
                targetPath = '/';
                break;
            case 'about':
                targetPath = '/about';
                break;
            case 'privacy':
                targetPath = '/privacy';
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
