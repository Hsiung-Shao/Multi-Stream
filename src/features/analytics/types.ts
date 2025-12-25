/**
 * Analytics & Identity Type Definitions
 * Contract for PR A - No implementation logic here.
 */

declare global {
    interface Window {
        dataLayer: any[];
        // External hooks used by IdentityManager
        __MS_LOAD_BACKUP__?: () => Promise<any>;
        __MS_RESTORE_BACKUP__?: (backup: any) => void;
        // Debug exposure
        __MS_USER_UUID__?: string;
    }
}

export interface IdentityConfig {
    /** LocalStorage key for storing UUID */
    lsKey: string;
    /** DataLayer event name */
    dataLayerEvent: string;
    /** DataLayer key for user ID */
    dlUserKey: string;
    /** DataLayer key for app name */
    dlAppKey: string;
    /** Value for app name */
    appValue: string;
}

export interface IdentityEventPayload {
    event: string;
    [key: string]: any;
}

export interface IdentityResult {
    uuid: string;
    isNew: boolean;
    restoredFromBackup: boolean;
}

export interface IdentityManagerContract {
    /**
     * Main entry point.
     * 1. Checks restore hooks if LS empty.
     * 2. Gets or creates UUID.
     * 3. Pushes to DataLayer.
     */
    init(): Promise<IdentityResult>;

    /**
     * Returns current UUID or null if not initialized.
     */
    getUUID(): string | null;
}
