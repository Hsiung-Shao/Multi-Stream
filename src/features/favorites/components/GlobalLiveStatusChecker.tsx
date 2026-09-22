import { useEffect, useRef } from 'react';
import { useLiveStatusCheck } from '../useLiveStatusCheck';
import { useUIStore } from '../../../store/useUIStore';

// 「背景自動偵測直播狀態」的輪詢間隔:每 5 分鐘檢查一次收藏頻道(對齊設計 FM 播放卡)
const BG_LIVE_DETECT_INTERVAL = 5 * 60 * 1000;
// 與 FavoritesRepository 的 STORAGE_KEY 一致:其他分頁寫入收藏時,本分頁據此重讀
const FAVORITES_STORAGE_KEY = 'favoriteStreams';

/**
 * A headless component that listens for 'refreshFavoritesStatus' events
 * and triggers the global live status check logic.
 *
 * This should be mounted at a high level (e.g., App.tsx or NewCanvasPage)
 * to ensure background checks work even when ControlPanel is hidden.
 *
 * 分頁不可見時一律不查(2026-09 CPU 超限事件:掛整夜的背景分頁是最大宗呼叫來源),
 * 期間收到的觸發記為待辦,回到前景再補跑一次。每頻道是否真的要查由 liveCheckThrottle 決定。
 */
export const GlobalLiveStatusChecker = () => {
    const { checkNow } = useLiveStatusCheck();
    const bgLiveDetect = useUIStore(s => s.bgLiveDetect);
    // 不可見期間被略過的觸發,回到前景時補跑
    const pendingRef = useRef(false);

    useEffect(() => {
        const handleRefresh = () => {
            if (document.hidden) {
                pendingRef.current = true;
                return;
            }
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
        const id = setInterval(() => {
            if (document.hidden) {
                pendingRef.current = true;
                return;
            }
            checkNow();
        }, BG_LIVE_DETECT_INTERVAL);
        return () => clearInterval(id);
    }, [bgLiveDetect, checkNow]);

    // 回到前景:補跑不可見期間略過的檢查
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden || !pendingRef.current) return;
            pendingRef.current = false;
            checkNow();
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [checkNow]);

    // 跨分頁同步:另一個分頁查完並寫入收藏後,本分頁重讀,
    // 讓被節流跳過的頻道也能顯示最新直播狀態(storage 事件只在「其他」分頁觸發,不會自我迴圈)
    useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key !== FAVORITES_STORAGE_KEY) return;
            window.dispatchEvent(new CustomEvent('favoritesUpdated', {
                detail: { action: 'update', favoriteId: 'cross-tab-sync' },
            }));
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    // Optional: Render a tiny indicator if debugging, but mostly headless
    return null;
};
