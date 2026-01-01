import { useEffect } from 'react';
import { backupService } from '../features/backup';

export function useAppInitialization() {
    useEffect(() => {
        // 等待收藏系統和必要的 API 初始化完成
        const initAndRefreshFavorites = async () => {
            try {
                // 等待一小段時間確保 API 完全初始化 (模組化後通常不需要，但保留延遲以防萬一)
                await new Promise(resolve => setTimeout(resolve, 500));

                // 觸發收藏列表刷新事件
                window.dispatchEvent(new CustomEvent('refreshFavoritesStatus'));
            } catch (error) {
                // API 載入失敗，但繼續嘗試刷新（可能部分功能可用）
                window.dispatchEvent(new CustomEvent('refreshFavoritesStatus'));
            }
        };

        // 延遲執行，確保所有腳本都已載入
        setTimeout(() => {
            initAndRefreshFavorites();

            // 嘗試從 IndexedDB 自動復原（或合併）數據
            // 這是為了防止 localStorage 數據意外丟失
            backupService.autoRestore().then(result => {
                if (result.restored) {
                    console.log('[App] Data restored/merged from backup:', result.message);
                    // 如果有數據變更，可能需要刷新 UI，這裡發送刷新事件
                    window.dispatchEvent(new CustomEvent('refreshFavoritesStatus'));
                    window.dispatchEvent(new CustomEvent('favoritesUpdated', { detail: { action: 'restore' } }));
                    window.dispatchEvent(new CustomEvent('tagsUpdated')); // 刷新標籤
                }
            });
        }, 1000);
    }, []);
}
