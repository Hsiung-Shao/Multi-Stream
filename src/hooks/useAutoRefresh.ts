import { useEffect } from 'react';

export function useAutoRefresh() {
    useEffect(() => {
        // 檢查是否啟用自動刷新
        const isAutoRefreshEnabled = () => {
            if (typeof localStorage === 'undefined') return true; // 預設啟用
            const setting = localStorage.getItem('favoriteLiveStatusAutoRefresh');
            return setting !== 'false';
        };

        if (!isAutoRefreshEnabled()) return;

        // 獲取刷新間隔 (預設 25 分鐘)
        const getRefreshInterval = () => {
            if (typeof localStorage === 'undefined') return 25;
            const intervalStr = localStorage.getItem('favoriteLiveStatusAutoRefreshInterval');
            const interval = parseInt(intervalStr || '25', 10);
            return isNaN(interval) || interval <= 0 ? 25 : interval;
        };

        const intervalMinutes = getRefreshInterval();
        const intervalMs = intervalMinutes * 60 * 1000;

        console.log(`[AutoRefresh] 啟動背景自動刷新，間隔: ${intervalMinutes} 分鐘`);

        const intervalId = setInterval(() => {
            if (typeof document !== 'undefined' && !document.hidden) {
                console.log('[AutoRefresh] 觸發定時刷新...');
                window.dispatchEvent(new CustomEvent('refreshFavoritesStatus'));
            }
        }, intervalMs);

        return () => clearInterval(intervalId);
    }, []);
}
