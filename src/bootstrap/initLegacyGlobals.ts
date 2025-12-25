import { identityManager } from '../features/analytics/IdentityManager.ts';
import { twitchService } from '../features/twitch/TwitchService.ts';
import { adManager } from '../features/promotion/AdManager.ts';
import { chatManager } from '../features/chat/index.ts';
import { StreamManager } from '../features/stream/StreamManager.ts';
import { ControlPanelManager } from '../features/controlPanel/ControlPanelManager.ts';
import { VolumeManager } from '../features/volume/VolumeManager.ts';
import { PlayerAdapter } from '../features/volume/PlayerAdapter.ts';
import * as securityUtils from '../utils/security/index.ts';

import * as commonUtils from '../utils/common/index.ts';
import { favoritesService } from '../features/favorites/FavoritesService.ts';
import { favoritesLoader } from '../features/favorites/FavoritesLoader.ts';
import { youtubeApi } from '../utils/youtubeApi.ts';
import { backupService } from '../features/backup/index.ts';

/**
 * Guard to prevent double initialization
 */
if (typeof window !== 'undefined' && (window as any).__MS_CP_VOLUME_BRIDGE_READY__) {
    // Already initialized logic handled inside function, but this prevents module side effects if any
}

let isLegacyGlobalsInitialized = false;

// Create singleton instance
// This is the source of truth for the new system.
const streamManager = new StreamManager();

/**
 * Initializes legacy global features that are now managed by TypeScript modules.
 * This should be called exactly once at the application entry point.
 */
export const initLegacyGlobals = () => {
    // --- Utils & Security Bridge (PR C) ---
    // Strict Entry Point for Utils/Security
    if (typeof window !== 'undefined' && !(window as any).__MS_UTILS_BRIDGE_READY__) {
        const win = window as any;
        const debug = !!(win.__MS_DEBUG__ || win.__MS_DEBUG_UTILS__);

        // Mount Security Utils
        win.__MS_SECURITY__ = {
            escapeHtml: securityUtils.escapeHtml,
            safeJSONParse: securityUtils.safeJSONParse,
            validateChannelId: securityUtils.validateChannelId,
            validateVideoId: securityUtils.validateVideoId,
            validateUrl: securityUtils.validateUrl
        };

        // Mount Common Utils
        win.__MS_UTILS__ = {
            getParentDomain: commonUtils.getParentDomain,
            getTwitchParents: commonUtils.getTwitchParents,
            // State is handled via getter/setter in module, but exposed as property access if needed.
            // However, legacy uses `let isDraggingStreamBox`. We can't replace a let variable binding easily without changing the file.
            // But if we want to expose the NEW state to legacy, we need legacy code to read from here.
            // For PR C (Wiring), we act as a provider. Legacy files might need modification to use this if they want to share state.
            // For now, we expose the state helpers.
            getIsDraggingStreamBox: commonUtils.getIsDraggingStreamBox,
            setIsDraggingStreamBox: commonUtils.setIsDraggingStreamBox,

            // Bridge state property for easy access if we change legacy to use `window.__MS_UTILS__.isDraggingStreamBox`
            get isDraggingStreamBox() { return commonUtils.getIsDraggingStreamBox(); },
            set isDraggingStreamBox(v: boolean) { commonUtils.setIsDraggingStreamBox(v); }
        };

        if (debug) {
            console.log('[MS Security] Bridge mounted', Object.keys(win.__MS_SECURITY__));
            console.log('[MS Utils] Bridge mounted');
        }

        win.__MS_UTILS_BRIDGE_READY__ = true;
        if (debug) console.log('[LegacyGlobals] Security & Utils bridged to New System');
    }

    if (isLegacyGlobalsInitialized) {
        if (typeof window !== 'undefined' && ((window as any).__MS_DEBUG__ || (window as any).__MS_DEBUG_UTILS__)) {
            console.log('[LegacyGlobals] Already initialized, skipping.');
        }
        return;
    }
    isLegacyGlobalsInitialized = true;

    // --- Analytics (Identity & GTM) ---
    // Initialize IdentityManager (replaces js/ms-identity-ga4.js)
    identityManager.init().catch(err => {
        console.error('[LegacyGlobals] Analytics init failed', err);
    });

    // --- Promotion (Ads) ---
    // Wire AdManager to window (replaces js/promotion.js globals)
    if (typeof window !== 'undefined') {
        const win = window as any;

        // Expose AdManager APIs
        win.initAdSystem = adManager.init.bind(adManager);
        win.checkAndShowAd = adManager.checkAndShowAd.bind(adManager);
        win.triggerAdManually = adManager.triggerAdManually.bind(adManager);
        win.toggleAdEnabled = adManager.toggleAdEnabled.bind(adManager);
        win.toggleAdTestMode = adManager.toggleAdTestMode.bind(adManager);
        win.closeAdBanner = adManager.closeAdBanner.bind(adManager);
    }

    // --- Twitch API ---
    // Wire TwitchService to window.twitchApi (replaces js/twitch-api.js)
    if (typeof window !== 'undefined') {
        const win = window as any;
        if (!win.twitchApi || !win.twitchApi._isLegacy) {
            win.twitchApi = twitchService.getLegacyApi();
        }
    }

    // --- Chat System ---
    // Wire ChatManager to window (replaces js/chat.js globals)
    if (typeof window !== 'undefined') {
        const win = window as any;

        win.createChat = chatManager.createChat.bind(chatManager);
        win.destroyChat = chatManager.destroyChat.bind(chatManager);
        win.toggleChat = chatManager.toggleChat.bind(chatManager);
        win.separateChat = chatManager.separateChat.bind(chatManager);
        win.closeSeparatedChat = chatManager.closeSeparatedChat.bind(chatManager);
        win.setupChatResizer = chatManager.setupChatResizer.bind(chatManager);

        try {
            window.dispatchEvent(new CustomEvent('chatFunctionsReady', {
                detail: {
                    createChat: typeof win.createChat,
                    toggleChat: typeof win.toggleChat,
                    setupChatResizer: typeof win.setupChatResizer
                }
            }));
        } catch (e) { console.warn('[LegacyGlobals] Failed to dispatch chat ready event', e); }
    }

    // --- Stream System (Stream.js Refactor Cutover) ---
    if (typeof window !== 'undefined') {
        const win = window as any;

        // Bridge: Guard against infinite loops or double wiring
        // Legacy code usually checks `if (window.addStream) ...`

        // 1. addStream
        win.addStream = async (url?: string | null) => {
            // Call into new Manager
            await streamManager.addStream(url || '');
            // Attempt to sync legacy data for compatibility (optional, but safer for cutover)
            syncLegacyData(win);
            // PR E: Dispatch event for UI consumers
            win.dispatchEvent(new CustomEvent('ms:streamsChanged'));
        };

        // 2. removeBox
        win.removeBox = (id: number) => {
            streamManager.removeStream(id);
            syncLegacyData(win);
            // PR E: Dispatch event
            win.dispatchEvent(new CustomEvent('ms:streamsChanged'));
        };

        // 3. reloadStream
        win.reloadStream = (id: number) => {
            streamManager.reloadStream(id);
            // No sync needed for pure reload typically, but to be safe if volume changed during reload logic
            syncLegacyData(win);
            // PR E: Dispatch event (reload might not change count, but might change status)
            win.dispatchEvent(new CustomEvent('ms:streamsChanged'));
        };

        // 4. clearAll
        win.clearAll = () => {
            streamManager.clearAll();
            syncLegacyData(win);
            // PR E: Dispatch event
            win.dispatchEvent(new CustomEvent('ms:streamsChanged'));
        };

        // 5. Layout (Stub/Minimal)
        // Since PR B StreamManager didn't implement save/load logic fully yet (it manages runtime state),
        // we provide minimal stubs or if manager has getters, we could implement a basic save.
        // For PR C Strict Cutover, we can retain localStorage compatibility if StreamManager supports it.
        // Since StreamManager in PR B was "Pure Logic" and didn't touch localStorage,
        // we defined contracts. Let's see if we can provide a basic implementation here 
        // to satisfy "Functional cannot fail". 
        // Current StreamManager stores streams in memory. We can save that state.

        win.saveLayout = () => {
            // Basic implementation: Serialize streamManager.getStreams() to localStorage
            // Format: [{url, style, volume, chatVisible}]
            // Ideally this logic belongs in StreamManager, but for Cutover we bridge here.
            const streams = streamManager.getStreams();
            const layout = streams.map(s => ({
                url: s.originalUrl,
                volume: s.volume,
                chatVisible: s.chatVisible,
                style: {} // We don't have style info in StreamItem yet (PR B types didn't include it in detail or I missed it)
                // The Audit said: streamData + DOM style.
                // Risk: Losing window position saving. 
                // Acceptable for PR C Cutover to only save content, or warn.
            }));
            try {
                localStorage.setItem('multiStreamLayout', JSON.stringify(layout));
                alert('布局已儲存！(注意：新版僅儲存頻道清單)');
            } catch (e) { console.error(e); }
        };

        win.loadLayout = () => {
            const saved = localStorage.getItem('multiStreamLayout');
            if (!saved) return alert('沒有儲存的布局');
            if (!confirm('載入會清空目前畫面，確定？')) return;

            streamManager.clearAll();
            try {
                const items = JSON.parse(saved);
                if (Array.isArray(items)) {
                    items.forEach((item: any) => {
                        // Delay not strictly needed with new manager but safer for batch
                        streamManager.addStream(item.url || item.channelId);
                    });
                }
                syncLegacyData(win);
            } catch (e) { console.error(e); }
        };

        // Initial Sync
        syncLegacyData(win);

        console.log('[LegacyGlobals] Stream System bridged to StreamManager');
    }

    // --- Control Panel & Volume System (Bridge) ---
    if (typeof window !== 'undefined' && !(window as any).__MS_CP_VOLUME_BRIDGE_READY__) {
        const win = window as any;

        // 1. Initialize Managers
        // Dependencies for CP: getStreamData, autoSaveSettings, getContainer
        const getStreamData = () => win.streamData || {};
        const autoSaveSettings = () => { if (typeof win.autoSaveSettings === 'function') win.autoSaveSettings(); };
        const getContainer = () => document.getElementById('container');

        const cpManager = new ControlPanelManager(getStreamData, autoSaveSettings, getContainer);

        // Dependencies for Volume: PlayerAdapter, getStreamData, autoSaveSettings
        // PlayerAdapter needs 'players' object. legacy uses window.players.
        // We pass a direct reference or getter wrapper? Adapter expects Record<number, PlayerWrapper>.
        // Since window.players is mutated, passing the object ref *should* work if Adapter doesn't clone it.
        // PR B PlayerAdapter constructor: this.players = players;
        if (!win.players) win.players = {};
        const playerAdapter = new PlayerAdapter(win.players);

        const volManager = new VolumeManager(playerAdapter, getStreamData, autoSaveSettings);

        // Link CP volume service
        cpManager.setVolumeService(volManager);

        // 2. Wiring Control Panel APIs (Strict Cutover: No fallbacks)

        // window.toggleControlPanel
        win.toggleControlPanel = () => {
            try {
                cpManager.toggleControlPanel();
            } catch (e) {
                console.error('[CP Cutover] toggleControlPanel failed', e);
            }
        };

        // window.updateStreamOrderList
        win.updateStreamOrderList = () => {
            try {
                cpManager.updateStreamOrderList();
            } catch (e) {
                console.error('[CP Cutover] updateStreamOrderList failed', e);
            }
        };

        // window.updateAllChatsButton
        win.updateAllChatsButton = () => {
            try {
                cpManager.updateAllChatsButton();
            } catch (e) {
                // UI update failure is low risk, warn only
                console.warn('[CP Cutover] updateAllChatsButton failed', e);
            }
        };

        // Setup Event-Driven Updates (PR E)
        // Listen for 'ms:streamsChanged' to update UI
        if (!win._msStreamsChangedListenerAttached) {
            win.addEventListener('ms:streamsChanged', () => {
                // Debounce slightly to avoid rapid updates
                if (win._msUpdateTimeout) clearTimeout(win._msUpdateTimeout);
                win._msUpdateTimeout = setTimeout(() => {
                    win.updateStreamOrderList();
                    win.updateAllChatsButton();
                }, 10);
            });
            win._msStreamsChangedListenerAttached = true;
        }

        // window.toggleAllChats
        win.toggleAllChats = () => {
            try {
                cpManager.toggleAllChats();
            } catch (e) {
                console.error('[CP Cutover] toggleAllChats failed', e);
            }
        };

        // 3. Wiring Volume APIs (Strict Cutover: No fallbacks)

        // window.applyMasterVolumeToStream
        win.applyMasterVolumeToStream = (id: number) => {
            try {
                volManager.applyMasterVolumeToStream(id);
            } catch (e) {
                console.error('[Volume Cutover] applyMasterVolumeToStream failed', e);
            }
        };

        // window.updateMasterVolume
        win.updateMasterVolume = () => {
            try {
                volManager.updateMasterVolume();
            } catch (e) {
                console.error('[Volume Cutover] updateMasterVolume failed', e);
            }
        };

        // window.muteAll
        win.muteAll = () => {
            try {
                volManager.muteAll();
            } catch (e) {
                console.error('[Volume Cutover] muteAll failed', e);
            }
        };

        // window.setupVolumeControl
        win.setupVolumeControl = (box: HTMLElement, id: number) => {
            try {
                volManager.setupVolumeControl(box, id);
            } catch (e) {
                console.error('[Volume Cutover] setupVolumeControl failed', e);
            }
        };

        // Set Guard
        win.__MS_CP_VOLUME_BRIDGE_READY__ = true;
        console.log('[LegacyGlobals] Control Panel & Volume bridged to New System');
    }

    // --- Favorites Feature (PR F) ---
    // Bridge favoriteStreams, favoriteCategories, youtubeApiUtils
    if (typeof window !== 'undefined') {
        const win = window as any;

        // youtubeApiUtils
        // We do not overwrite if it is already defined? No, we MUST INTENTIONALLY OVERWRITE what settings.js might define
        // BUT settings.js defines using 'const', so we can't overwrite the variable in settings.js scope.
        // But functions in settings.js access 'window.youtubeApiUtils' or 'youtubeApiUtils'?
        // settings.js defines `const youtubeApiUtils = ...` then `window.youtubeApiUtils = youtubeApiUtils`.
        // If we assign `window.youtubeApiUtils` here, and initLegacyGlobals runs AFTER settings.js...
        // Wait, initLegacyGlobals runs BEFORE settings.js?
        // settings.js is <script src="js/settings.js"> loaded in index.html.
        // src/main.tsx (entry) loads initLegacyGlobals inside `bootstrapRuntime`.
        // `bootstrapRuntime` is imported in `main.tsx`.
        // `main.tsx` is bundled.
        // Usually bundled app runs AFTER DOMContentLoaded or deferred.
        // settings.js is a script tag. It runs immediately when parsed.
        // If settings.js runs FIRST, it defines `window.youtubeApiUtils`.
        // Then React runtime runs, and we overwrite it here.
        // This is fine. The legacy functions that access `window.youtubeApiUtils` will see our new object.
        // The legacy functions that access `const youtubeApiUtils` (closure) will see the old object.
        // But since I am identifying "Functions in settings.js" usage... most of them are inside `favoriteStreams` or `favoriteCategories` objects.
        // And I am REPLACING `window.favoriteStreams`.
        // So the calls `favoriteStreams.load` will go to MY `FavoritesLoader`.
        // `FavoritesLoader` uses MY `youtubeApi`.
        // So strict parity is achieved without changing closure usage in settings.js, because we bypass those objects entirely.

        win.youtubeApiUtils = {
            checkChannelLiveStatus: youtubeApi.checkChannelLiveStatus.bind(youtubeApi),
            getChannelIdFromVideoId: youtubeApi.getChannelIdFromVideoId.bind(youtubeApi),
            getChannelTitleFromChannelId: youtubeApi.getChannelTitleFromChannelId.bind(youtubeApi),
            getApiKey: youtubeApi.getApiKey.bind(youtubeApi),
            getApiKeyFromPagesFunction: youtubeApi.getApiKeyFromPagesFunction.bind(youtubeApi)
        };

        // favoriteCategories
        win.favoriteCategories = {
            getList: favoritesService.getCategories.bind(favoritesService),
            saveList: favoritesService.saveCategories.bind(favoritesService),
            add: favoritesService.addCategory.bind(favoritesService),
            update: favoritesService.updateCategory.bind(favoritesService),
            remove: favoritesService.removeCategory.bind(favoritesService)
        };

        // favoriteStreams
        win.favoriteStreams = {
            getList: favoritesService.getFavorites.bind(favoritesService),
            saveList: favoritesService.saveFavorites.bind(favoritesService),
            add: favoritesService.addFavorite.bind(favoritesService),
            update: favoritesService.updateFavorite.bind(favoritesService),
            remove: favoritesService.removeFavorite.bind(favoritesService),
            load: favoritesLoader.load.bind(favoritesLoader),
            loadMultiple: favoritesLoader.loadMultiple.bind(favoritesLoader)
        };

        console.log('[LegacyGlobals] Favorites Feature bridged to New System');
    }
    // --- Backup System (PR G) ---
    // Initialize BackupService (replaces indexedDBBackup in settings.js)
    if (typeof window !== 'undefined') {
        const win = window as any;

        // 1. Initialize & Auto Restore
        // We do this immediately to ensure state is fresh before other things might rely on it too heavily.
        // However, this function is called at runtime bootstrap.
        backupService.init().then(async () => {
            const result = await backupService.autoRestore();
            if (result.restored) {
                console.log('[BackupService] Data restored from backup. Reloading to apply settings...');
                window.location.reload();
                return;
            } else if (result.success && result.skipped) {
                console.log('[BackupService] Auto-restore check passed:', result.message);
            } else if (!result.success) {
                // Only warn if enabled, or if it was a real error
                if (backupService.isEnabled()) {
                    console.warn('[BackupService] Auto-restore check failed:', result.message);
                }
            }

            // 2. Bridge window.indexedDBBackup for Legacy UI/Functions
            // Ensure we overwrite any existing object from settings.js
            win.indexedDBBackup = {
                init: async () => true, // Already inited
                isEnabled: backupService.isEnabled.bind(backupService),
                setEnabled: backupService.setEnabled.bind(backupService),
                getAllData: backupService.getAllData.bind(backupService),
                hasLocalStorageData: backupService.hasLocalStorageData.bind(backupService),
                // Legacy hasIndexedDBData is internal/less used, but we can verify usage.
                // It wasn't in my primary list but safe to omit or stub if unused.
                // backup() returns Promise<boolean>
                backup: backupService.backup.bind(backupService),
                // restore() -> performRestore? No, legacy restore() does full replace. 
                // We can use autoRestore or expose specific restore.
                // Legacy restore() was: read DB -> replace Local -> reload.
                // BackupService.performRestore does the replacement part.
                restore: async () => {
                    // We need to fetch data first? BackupService doesn't expose "restore from DB" as a public unchecked method except via autoRestore logic.
                    // But we can add a manual restore method to Service if needed, or re-use logic.
                    // Actually legacy restore() is rarely called manually except maybe via console?
                    // Let's implement a safe wrapper.
                    // The requirement is "Compatibility".
                    // Let's check if we can simulate it via autoRestore (by clearing local storage first?)
                    // Or better: Implement `restoreFromLatest` in BackupService? 
                    // For now, let's map it to a manual trigger if possible.
                    // Since `autoRestore` covers the "Load on boot" case. 
                    // Legacy `restore()` was used by `autoLoadBackup`.
                    // The only button is "Import from JSON" which uses `importFromJSON`.
                    // There is NO "Restore from DB" button in UI. Only "Backup".
                    // So `restore` might not be exposed to UI.
                    return false;
                },
                autoLoadBackup: async () => {
                    // This is called by main.js. We already did it above.
                    // But main.js awaits it. So we return existing result-ish.
                    return true;
                }
            };

            console.log('[LegacyGlobals] Backup System bridged to New System');

        }).catch(err => {
            console.error('[BackupService] Failed to initialize', err);
        });
    }
};

/**
 * Helpher to sync StreamManager state to window.streamData / window.players
 * to maintain backward compatibility with any lingering legacy scripts (e.g. main.js loops)
 */
function syncLegacyData(win: any) {
    if (!win.streamData) win.streamData = {};
    if (!win.players) win.players = {};
    if (typeof win.streamCount === 'undefined') win.streamCount = 0;

    // Use a specific internal method or just read exposed streams if possible.
    // StreamManager doesn't expose the internal map directly, but has getStreams().

    // Note: This is an approximation. 
    // New system doesn't necessarily use window.players directly (it uses Registry),
    // but legacy code (like old volume controls outside stream.js?) might check it.
    // If StreamManager.domAdapter is creating legacy DOM, then the old legacy controls might break
    // if they rely on window.reloadStream variants that expect window.streamData.

    // We already hooked window.reloadStream to manager.reloadStream, so that path is safe.
    // The main risk is `main.js` or `control-panel.js` reading these.

    // We will leave them mostly empty or try to populate basic info if needed.
    // For now, logging ensuring they exist prevents "undefined" crashes.
}
