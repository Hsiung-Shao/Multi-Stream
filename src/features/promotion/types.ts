/**
 * Promotion & Ads Type Definitions
 */

declare global {
    interface Window {
        // Legacy global functions
        initAdSystem?: () => void;
        checkAndShowAd?: () => void;
        triggerAdManually?: () => void;
        toggleAdEnabled?: () => void;
        toggleAdTestMode?: () => void;
        closeAdBanner?: () => void;

        // External libs
        adsbygoogle?: any[];
        players?: Record<string, any>;
        streamData?: Record<string, any>;
    }
}

export interface AdDisplayDuration {
    min: number;
    max: number;
}

export interface AdConfig {
    enabled: boolean;
    showControlButtons: boolean;
    testMode: boolean;
    showInterval: number;
    displayDuration: AdDisplayDuration;
}

export interface AdManagerContract {
    init(): void;
    checkAndShowAd(): void;
    triggerManually(): void;
    closeAd(): void;
    toggleEnabled(): void;
    toggleTestMode(): void;

    // State getters
    isEnabled(): boolean;
    isTestMode(): boolean;
}
