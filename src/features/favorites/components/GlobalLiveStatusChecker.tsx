import { useEffect } from 'react';
import { useLiveStatusCheck } from '../useLiveStatusCheck';
import { useUIStore } from '../../../store/useUIStore';

// 「背景自動偵測直播狀態」的輪詢間隔:每 5 分鐘檢查一次收藏頻道(對齊設計 FM 播放卡)
const BG_LIVE_DETECT_INTERVAL = 5 * 60 * 1000;

/**
 * A headless component that listens for 'refreshFavoritesStatus' events
 * and triggers the global live status check logic.
 *
 * This should be mounted at a high level (e.g., App.tsx or NewCanvasPage)
 * to ensure background checks work even when ControlPanel is hidden.
 */
export const GlobalLiveStatusChecker = () => {
    const { checkNow } = useLiveStatusCheck();
    const bgLiveDetect = useUIStore(s => s.bgLiveDetect);

    useEffect(() => {
        const handleRefresh = () => {

            checkNow();
        };

        window.addEventListener('refreshFavoritesStatus', handleRefresh);

        return () => {
            window.removeEventListener('refreshFavoritesStatus', handleRefresh);
        };
    }, [checkNow]);

    // 背景偵測:設定開啟時,每 5 分鐘自動跑一次收藏直播狀態檢查;關閉時不掛 interval
    useEffect(() => {
        if (!bgLiveDetect) return;
        const id = setInterval(() => { checkNow(); }, BG_LIVE_DETECT_INTERVAL);
        return () => clearInterval(id);
    }, [bgLiveDetect, checkNow]);

    // Optional: Render a tiny indicator if debugging, but mostly headless
    return null;
};
