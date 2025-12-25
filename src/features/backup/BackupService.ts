
export interface BackupData {
    version: string;
    exportDate: string;
    uid?: string | null;
    userSettings: any;
    favoriteStreams: any[];
    favoriteCategories: any[];
    controlPanelCollapsed: string | null;
    multiStreamLayout: any;
    adConfig: any;
}

export interface RestoreResult {
    success: boolean;
    restored: boolean;
    message: string;
    skipped?: boolean;
}

export class BackupService {
    private dbName = 'MultiStreamBackup';
    private dbVersion = 1;
    private storeName = 'backup';
    private db: IDBDatabase | null = null;
    private backupTimeout: number | null = null;
    private readonly DEBOUNCE_MS = 5000;

    constructor() { }

    async init(): Promise<boolean> {
        if (typeof window === 'undefined' || !window.indexedDB) {
            return false;
        }

        return new Promise((resolve, reject) => {
            const request = window.indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve(true);
            };

            request.onupgradeneeded = (event: any) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    try {
                        const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id' });
                        objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    } catch (error) {
                        // Ignore creation errors
                    }
                }
            };
        });
    }

    isEnabled(): boolean {
        const enabled = localStorage.getItem('indexedDBBackupEnabled');
        if (enabled === null) {
            localStorage.setItem('indexedDBBackupEnabled', 'true');
            return true;
        }
        return enabled === 'true';
    }

    setEnabled(enabled: boolean): void {
        localStorage.setItem('indexedDBBackupEnabled', enabled ? 'true' : 'false');
    }

    getAllData(): BackupData {
        const safeParse = (key: string, def: any) => {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : def;
            } catch {
                return def;
            }
        };

        return {
            version: '1.0',
            exportDate: new Date().toISOString(),
            uid: localStorage.getItem('ms_user_uuid'),
            userSettings: safeParse('userSettings', null),
            favoriteStreams: safeParse('favoriteStreams', []),
            favoriteCategories: safeParse('favoriteCategories', []),
            controlPanelCollapsed: localStorage.getItem('controlPanelCollapsed'),
            multiStreamLayout: safeParse('multiStreamLayout', null),
            adConfig: safeParse('adConfig', null)
        };
    }

    async backup(): Promise<boolean> {
        if (!this.isEnabled()) return false;
        if (!this.db) await this.init();
        if (!this.db) return false;

        try {
            const data = this.getAllData();
            const backupPayload = {
                id: 'latest',
                timestamp: Date.now(),
                data: data
            };

            return new Promise((resolve) => {
                if (!this.db) return resolve(false);
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.put(backupPayload);

                request.onsuccess = () => resolve(true);
                request.onerror = () => resolve(false);
            });
        } catch (error) {
            return false;
        }
    }

    scheduleBackup(): void {
        if (this.backupTimeout) {
            window.clearTimeout(this.backupTimeout);
        }

        this.backupTimeout = window.setTimeout(async () => {
            await this.backup();
            this.backupTimeout = null;
        }, this.DEBOUNCE_MS);
    }

    // Check if we have meaningful data in local storage
    // "Meaningful" means favoriteStreams exists and is not empty/null
    // Check if we have meaningful data in local storage
    // "Meaningful" means favoriteStreams exists (even empty array is considered initialized data)
    hasLocalStorageData(): boolean {
        const fs = localStorage.getItem('favoriteStreams');

        // Treat existing key as data, even if empty array '[]'.
        // We do NOT check app_version here, because versionCheck runs first and sets it,
        // which would falsely indicate "User Data Exists" and prevent restoration.
        if (fs !== null) return true;

        return false;
    }

    private async getLatestBackup(): Promise<any> {
        if (!this.db) await this.init();
        if (!this.db) return null;

        return new Promise((resolve) => {
            if (!this.db) return resolve(null);
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get('latest');

            request.onsuccess = () => {
                if (request.result && request.result.data) {
                    resolve(request.result.data);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => resolve(null);
        });
    }

    async autoRestore(): Promise<RestoreResult> {
        if (!this.isEnabled()) {
            return { success: false, restored: false, message: 'Backup disabled', skipped: true };
        }

        const hasLocal = this.hasLocalStorageData();
        const dbData = await this.getLatestBackup();
        const hasDb = !!dbData;

        // Strategy Matrix
        // Local | DB  | Action
        // YES   | YES | No Restore
        // NO    | YES | Restore
        // YES   | NO  | Reverse Backup
        // NO    | NO  | No Action

        if (hasLocal && hasDb) {
            return { success: true, restored: false, message: 'Local data exists', skipped: true };
        }

        if (!hasLocal && hasDb) {
            // Restore
            return await this.performRestore(dbData);
        }

        if (hasLocal && !hasDb) {
            // Reverse Backup
            const backedUp = await this.backup();
            return {
                success: backedUp,
                restored: false,
                message: backedUp ? 'Reverse backup created' : 'Failed to create reverse backup',
                skipped: true
            };
        }

        return { success: true, restored: false, message: 'No data found anywhere', skipped: true };
    }

    async performRestore(data: BackupData): Promise<RestoreResult> {
        try {
            if (data.userSettings) localStorage.setItem('userSettings', JSON.stringify(data.userSettings));
            if (data.favoriteStreams) localStorage.setItem('favoriteStreams', JSON.stringify(data.favoriteStreams));
            if (data.favoriteCategories) localStorage.setItem('favoriteCategories', JSON.stringify(data.favoriteCategories));
            if (data.controlPanelCollapsed !== undefined && data.controlPanelCollapsed !== null)
                localStorage.setItem('controlPanelCollapsed', data.controlPanelCollapsed);
            if (data.multiStreamLayout) localStorage.setItem('multiStreamLayout', JSON.stringify(data.multiStreamLayout));
            if (data.adConfig) localStorage.setItem('adConfig', JSON.stringify(data.adConfig));
            // Should we restore UID? Usually yes for continuity
            if (data.uid) localStorage.setItem('ms_user_uuid', data.uid);

            return { success: true, restored: true, message: 'Data restored from backup' };
        } catch (e: any) {
            return { success: false, restored: false, message: e.message || 'Restore failed' };
        }
    }
}
