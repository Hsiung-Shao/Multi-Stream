import { IdentityConfig, IdentityResult, IdentityManagerContract } from './types.ts';

/**
 * Default Configuration matching legacy behavior
 */
export const DEFAULT_IDENTITY_CONFIG: IdentityConfig = {
    lsKey: 'ms_user_uuid',
    dataLayerEvent: 'ms_identity_ready',
    dlUserKey: 'ms_user_id',
    dlAppKey: 'ms_app',
    appValue: 'multistream_hub',
};

/**
 * IdentityManager responsible for UUID generation and DataLayer integration.
 * Passive implementation: Init must be called explicitly.
 */
export class IdentityManager implements IdentityManagerContract {
    private config: IdentityConfig;

    constructor(config: Partial<IdentityConfig> = {}) {
        this.config = { ...DEFAULT_IDENTITY_CONFIG, ...config };
    }

    /**
     * Initializes identity:
     * 1. Check restore hooks (if LS empty)
     * 2. Get or create UUID
     * 3. Push to DataLayer
     */
    public async init(): Promise<IdentityResult> {
        const isNew = !this.hasStoredUUID();
        let restoredFromBackup = false;

        // 1. Hook: Backup Restore (Legacy)
        if (!this.hasAnyLocalStorageData()) {
            restoredFromBackup = await this.tryRestoreFromBackup();
        }

        // 2. Logic: Ensure UUID exists
        let uuid = this.getUUID();
        if (!uuid) {
            uuid = this.generateSafeUUID();
            this.setUUID(uuid);
        }

        // 3. Side Effect: Push to DataLayer
        this.pushToDataLayer(uuid);

        return {
            uuid,
            isNew,
            restoredFromBackup,
        };
    }

    /**
     * Returns current UUID or null if not found
     */
    public getUUID(): string | null {
        try {
            return localStorage.getItem(this.config.lsKey);
        } catch (e) {
            console.warn('IdentityManager: Failed to access localStorage', e);
            return null;
        }
    }

    // --- Private Helpers ---

    private hasStoredUUID(): boolean {
        return !!this.getUUID();
    }

    private setUUID(uuid: string): boolean {
        try {
            localStorage.setItem(this.config.lsKey, uuid);
            return true;
        } catch (e) {
            console.warn('IdentityManager: Failed to write UUID to localStorage', e);
            return false;
        }
    }

    private hasAnyLocalStorageData(): boolean {
        try {
            return localStorage.length > 0;
        } catch {
            return false;
        }
    }

    private async tryRestoreFromBackup(): Promise<boolean> {
        if (typeof window === 'undefined') return false;

        const loadFn = window.__MS_LOAD_BACKUP__;
        const restoreFn = window.__MS_RESTORE_BACKUP__;

        if (typeof loadFn !== 'function' || typeof restoreFn !== 'function') {
            return false;
        }

        try {
            const backup = await loadFn();
            if (backup) {
                restoreFn(backup);
                return true;
            }
        } catch (e) {
            console.error('IdentityManager: Backup restore failed', e);
        }
        return false;
    }

    private pushToDataLayer(uuid: string): void {
        if (typeof window === 'undefined') return;

        // Ensure dataLayer exists
        window.dataLayer = window.dataLayer || [];

        const eventPayload = {
            event: this.config.dataLayerEvent,
            [this.config.dlUserKey]: uuid,
            [this.config.dlAppKey]: this.config.appValue,
        };

        try {
            window.dataLayer.push(eventPayload);

            // Legacy Debug Exposure
            window.__MS_USER_UUID__ = uuid;
        } catch (e) {
            console.error('IdentityManager: Failed to push to dataLayer', e);
        }
    }

    /**
     * Matches legacy js/ms-identity-ga4.js safeRandomUUID logic
     */
    private generateSafeUUID(): string {
        if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
            return globalThis.crypto.randomUUID();
        }

        // Fallback RFC4122 v4-like
        const getRandomValues = (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues)
            ? (arr: Uint8Array) => globalThis.crypto.getRandomValues(arr)
            : (arr: Uint8Array) => {
                for (let i = 0; i < arr.length; i++) {
                    arr[i] = Math.floor(Math.random() * 256);
                }
                return arr;
            };

        const bytes = new Uint8Array(16);
        getRandomValues(bytes);

        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;

        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
}

// Export singleton instance but DO NOT call init()
export const identityManager = new IdentityManager();
