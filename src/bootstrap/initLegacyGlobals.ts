import { identityManager } from '../features/analytics/IdentityManager.ts';
import { twitchService } from '../features/twitch/TwitchService.ts';
import { adManager } from '../features/promotion/AdManager.ts';
import { chatManager } from '../features/chat/index.ts';

/**
 * Guard to prevent double initialization
 */
let isLegacyGlobalsInitialized = false;

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

        // Initialize AdManager (lazy init via main.js preserved, but we allow direct usage)
        // Note: main.js calls initAdSystem() with delay, which now routes to adManager.init()
    }

    // --- Twitch API ---
    // Wire TwitchService to window.twitchApi (replaces js/twitch-api.js)
    if (typeof window !== 'undefined') {
        const win = window as any;
        // Guard against overwrite if logic is flawed elsewhere
        if (!win.twitchApi || !win.twitchApi._isLegacy) {
            win.twitchApi = twitchService.getLegacyApi();
        }
    }

    // --- Chat System ---
    // Wire ChatManager to window (replaces js/chat.js globals)
    if (typeof window !== 'undefined') {
        const win = window as any;

        // Guard against double internal initialization logic if handled by manager
        // But here we are wiring to window.

        // Expose ChatManager APIs
        // Legacy: createChat, toggleChat, separateChat, closeSeparatedChat, setupChatResizer
        win.createChat = chatManager.createChat.bind(chatManager);
        win.toggleChat = chatManager.toggleChat.bind(chatManager);
        win.separateChat = chatManager.separateChat.bind(chatManager);
        win.closeSeparatedChat = chatManager.closeSeparatedChat.bind(chatManager);
        win.setupChatResizer = chatManager.setupChatResizer.bind(chatManager);

        // Dispatch ready event to satisfy any listeners waiting for legacy 'chatFunctionsReady'
        // Legacy chat.js dispatched 'chatFunctionsReady' at end of file.
        // We should replicate this if needed, though strictly speaking 
        // calling code usually waits for DOMContentLoaded.
        // Legacy chat.js dispatch logic:
        /*
        window.dispatchEvent(new CustomEvent('chatFunctionsReady', {
            detail: { createChat: ... }
        }));
        */
        // Let's do it to be safe (Zero Regression).
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
};
