/**
 * Version Check Utility
 * 
 * Checks if the application version has changed.
 * If changed, it clears stale data from localStorage (Session Data)
 * while preserving critical User Data (Favorites, Settings).
 */

/**
 * 版本更新時必須保留的 key：使用者資料與偏好。其餘（快取、工作階段計數、流程暫存）一律清掉。
 *
 * 2026-09 補齊：原本清單漏了下面標「補」的項目，每次發版都會把它們刪掉。其中最嚴重的是
 * stream-storage：使用者「儲存的自訂版面」和目前的畫布都在裡面，而且 IndexedDB 備份不含它，刪了就找不回來。
 * 新增會長期保存使用者資料的 key 時，要加進這裡（tests/utils/versionCheck.test.ts 有鎖）。
 */
export const PRESERVED_KEYS = [
    'favoriteStreams',       // 收藏
    'favoriteCategories',    // 收藏分類
    'preference_tags',       // 收藏標籤（補）
    'stream-storage',        // 畫布、自訂版面、預設組合（補；zustand persist）
    'settings',              // Global settings (volume, theme, etc.)
    'userSettings',          // 使用者設定（主題、動態島外觀、音量…）
    'theme',                 // Theme preference (if stored separately)
    'i18nextLng',            // 介面語言（補）
    'cookie_consent',        // Cookie 同意（補；刪掉會重新跳橫幅，同意者的 GA 也會中斷）
    'app_version',           // The version key itself (will be updated)
    'adConfig',              // Ad preferences
    'adLastShown',           // Ad timing state
    'adLastClosed',          // Ad timing state
    'indexedDBBackupEnabled',// Backup setting
    'ms_user_uuid',          // User Identity (UID)
    'ms_internal_user',      // 內部人員旗標（補；不送 GA）
    'announcement:device_id',// 公告投票的裝置 ID（補；刪掉可重複投票）
    'twitchAccessToken',     // Twitch 連結（補；刪掉要重新授權匯入）
    'twitchAccessTokenExpiresAt',
    'twitch_user_token',
    'twitchClientId',
    'twitchProxyUrl',
    'twitchUseProxy',
    'favoriteLiveStatusAutoRefresh',         // 收藏直播自動刷新設定（補）
    'favoriteLiveStatusAutoRefreshInterval',
    'brave_twitch_dismissed',                // 「不再提醒」（補）
    'canvas_tour_done',                      // 畫布導覽已看過／略過（補）
    'canvas_tour_intro_done',
    'ms_admin_api_token',                    // 後台登入（補）
    'ControlPanelManager_isCollapsed',       // Control panel state
    'controlPanelCollapsed',
];

export const checkAppVersion = () => {
    try {
        const currentVersion = __APP_VERSION__;
        const storedVersion = localStorage.getItem('app_version');

        // If version matches, do nothing
        if (storedVersion === currentVersion) {
            return;
        }

        // 首次造訪（無任何已存版本）：此時載入的就是最新程式碼，沒有「過時快取」要清，
        // 不需 reload。先前無條件 reload 會讓每個新訪客（與每次 Lighthouse 量測，因其
        // 一律從空 storage 開始）都多跑一次完整重載 → 嚴重拖累首屏 FCP/LCP。
        const isFirstVisit = storedVersion === null;




        const WHITELIST = PRESERVED_KEYS;

        // Backup keys we want to keep? Usually yes.
        // We'll preserve anything starting with 'backup_' just in case.

        const itemsToRemove: string[] = [];

        // Scan localStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;

            // If key is NOT in whitelist AND does NOT start with 'backup_', mark for removal
            if (!WHITELIST.includes(key) && !key.startsWith('backup_')) {
                itemsToRemove.push(key);
            }
        }

        // Execute Removal
        itemsToRemove.forEach(key => {

            localStorage.removeItem(key);
        });

        // Update Version
        localStorage.setItem('app_version', currentVersion);



        // Force Reload to ensure fresh code is loaded
        // 僅在「從舊版本升級」時 reload（清掉可能殘留的記憶體狀態）；
        // 首次造訪不 reload（見上方說明）。
        if (!isFirstVisit) {
            window.location.reload();
        }

    } catch (e) {
        console.error('[VersionCheck] Error during version check:', e);
    }
};
