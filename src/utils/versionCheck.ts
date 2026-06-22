/**
 * Version Check Utility
 * 
 * Checks if the application version has changed.
 * If changed, it clears stale data from localStorage (Session Data)
 * while preserving critical User Data (Favorites, Settings).
 */

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




        // WHITELIST: Critical User Data that MUST BE PRESERVED
        const WHITELIST = [
            'favoriteStreams',       // User's favorite streams
            'favoriteCategories',    // User's custom categories
            'settings',              // Global settings (volume, theme, etc.)
            'app_version',           // The version key itself (will be updated)
            'adConfig',              // Ad preferences
            'adLastShown',           // Ad timing state
            'adLastClosed',          // Ad timing state
            'theme',                 // Theme preference (if stored separately)
            'indexedDBBackupEnabled',// Backup setting
            'ms_user_uuid',           // User Identity (UID)
            'userSettings',           // User settings object
            'ControlPanelManager_isCollapsed' // Control panel state
        ];

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
