import { identityManager } from '../features/analytics/IdentityManager.ts';
import { twitchService } from '../features/twitch/TwitchService.ts';
import { adManager } from '../features/promotion/AdManager.ts';

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
        // Guard against overwrite if logic is flawed elsewhere
        if (!(window as any).twitchApi || !(window as any).twitchApi._isLegacy) {
            (window as any).twitchApi = twitchService.getLegacyApi();
        }
    }
};

