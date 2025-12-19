import { identityManager } from '../features/analytics/IdentityManager.ts';

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
    // Non-blocking initialization
    identityManager.init().catch(err => {
        console.error('[LegacyGlobals] Analytics init failed', err);
    });
};
