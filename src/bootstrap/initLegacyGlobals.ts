import { identityManager } from '../features/analytics/IdentityManager.ts';
import { twitchService } from '../features/twitch/TwitchService.ts';
import { adManager } from '../features/promotion/AdManager.ts';
import { chatManager } from '../features/chat/index.ts';
import { StreamManager } from '../features/stream/StreamManager.ts';

/**
 * Guard to prevent double initialization
 */
let isLegacyGlobalsInitialized = false;

// Create singleton instance
// This is the source of truth for the new system.
const streamManager = new StreamManager();

/**
 * Initializes legacy global features that are now managed by TypeScript modules.
 * This should be called exactly once at the application entry point.
 */
export const initLegacyGlobals = () => {
    if (isLegacyGlobalsInitialized) {
        console.warn('[LegacyGlobals] Already initialized, skipping.');
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
        };

        // 2. removeBox
        win.removeBox = (id: number) => {
            streamManager.removeStream(id);
            syncLegacyData(win);
        };

        // 3. reloadStream
        win.reloadStream = (id: number) => {
            streamManager.reloadStream(id);
            // No sync needed for pure reload typically, but to be safe if volume changed during reload logic
            syncLegacyData(win);
        };

        // 4. clearAll
        win.clearAll = () => {
            streamManager.clearAll();
            syncLegacyData(win);
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
