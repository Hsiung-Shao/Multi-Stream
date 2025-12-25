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

        console.log(`[VersionCheck] Version change detected: ${storedVersion} -> ${currentVersion}`);
        console.log('[VersionCheck] Performing cleanup of stale session data...');

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
            console.log(`[VersionCheck] Removing stale key: ${key}`);
            localStorage.removeItem(key);
        });

        // Update Version
        localStorage.setItem('app_version', currentVersion);

        console.log('[VersionCheck] Cleanup complete. Reloading...');

        // Force Reload to ensure fresh code is loaded
        // Note: We only reload if we actually detected a change.
        // If strict reload is required, we can uncomment:
        window.location.reload();

    } catch (e) {
        console.error('[VersionCheck] Error during version check:', e);
    }
};
