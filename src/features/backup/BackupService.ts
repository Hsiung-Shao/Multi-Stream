
export interface BackupData {
    version: string;
    exportDate: string;
    uid?: string | null;
    userSettings: any;
    favoriteStreams: any[];
    favoriteCategories: any[];
    preference_tags: any[];
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
            preference_tags: safeParse('preference_tags', []),
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
        // YES   | YES | Merge (Smart Patch)
        // NO    | YES | Full Restore
        // YES   | NO  | Reverse Backup (Preserve Local)
        // NO    | NO  | No Action

        if (hasLocal && hasDb) {
            // MERGE STRATEGY
            return await this.performMerge(dbData);
        }

        if (!hasLocal && hasDb) {
            // FULL RESTORE STRATEGY
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
            if (data.preference_tags) localStorage.setItem('preference_tags', JSON.stringify(data.preference_tags));
            if (data.controlPanelCollapsed !== undefined && data.controlPanelCollapsed !== null)
                localStorage.setItem('controlPanelCollapsed', data.controlPanelCollapsed);
            if (data.multiStreamLayout) localStorage.setItem('multiStreamLayout', JSON.stringify(data.multiStreamLayout));
            if (data.adConfig) localStorage.setItem('adConfig', JSON.stringify(data.adConfig));
            // Should we restore UID? Usually yes for continuity
            if (data.uid) localStorage.setItem('ms_user_uuid', data.uid);

            return { success: true, restored: true, message: 'Data fully restored from backup' };
        } catch (e: any) {
            return { success: false, restored: false, message: e.message || 'Restore failed' };
        }
    }

    /**
     * MEGRE STRATEGY:
     * - Favorites/Categories/Tags: Add items from Backup that are missing in Local.
     * - Settings/Config: Local wins (do not overwrite).
     */
    async performMerge(backupData: BackupData): Promise<RestoreResult> {
        try {
            let mergedCount = 0;

            // 1. Merge Favorites
            const localFavsRaw = localStorage.getItem('favoriteStreams');
            const localFavs = localFavsRaw ? JSON.parse(localFavsRaw) : [];
            const backupFavs = backupData.favoriteStreams || [];

            if (backupFavs.length > 0) {
                let favsChanged = false;
                backupFavs.forEach((bItem: any) => {
                    // Check existence by ID (primary) or URL (secondary)
                    const exists = localFavs.some((lItem: any) =>
                        lItem.id === bItem.id || lItem.url === bItem.url
                    );

                    if (!exists) {
                        localFavs.push(bItem);
                        favsChanged = true;
                        mergedCount++;
                    }
                });

                if (favsChanged) {
                    localStorage.setItem('favoriteStreams', JSON.stringify(localFavs));
                }
            }

            // 2. Merge Categories
            const localCatsRaw = localStorage.getItem('favoriteCategories');
            const localCats = localCatsRaw ? JSON.parse(localCatsRaw) : [];
            const backupCats = backupData.favoriteCategories || [];

            if (backupCats.length > 0) {
                let catsChanged = false;
                backupCats.forEach((bCat: any) => {
                    // Check by ID
                    const exists = localCats.some((lCat: any) => lCat.id === bCat.id);
                    if (!exists) {
                        localCats.push(bCat);
                        catsChanged = true;
                        mergedCount++;
                    }
                });

                if (catsChanged) {
                    localStorage.setItem('favoriteCategories', JSON.stringify(localCats));
                }
            }

            // 3. Merge Tags
            const localTagsRaw = localStorage.getItem('preference_tags');
            const localTags = localTagsRaw ? JSON.parse(localTagsRaw) : [];
            const backupTags = backupData.preference_tags || [];

            if (backupTags.length > 0) {
                let tagsChanged = false;
                backupTags.forEach((bTag: any) => {
                    // Check by ID
                    const exists = localTags.some((lTag: any) => lTag.id === bTag.id);
                    if (!exists) {
                        localTags.push(bTag);
                        tagsChanged = true;
                        mergedCount++;
                    }
                });

                if (tagsChanged) {
                    localStorage.setItem('preference_tags', JSON.stringify(localTags));
                }
            }

            // 4. Other Settings: Local Wins (Do not overwrite)

            if (mergedCount > 0) {
                console.log(`[BackupService] Merged ${mergedCount} missing items from backup.`);
                return { success: true, restored: true, message: `Merged ${mergedCount} items from backup` };
            } else {
                return { success: true, restored: false, message: 'Local data is up to date', skipped: true };
            }

        } catch (e: any) {
            console.error('[BackupService] Merge failed', e);
            return { success: false, restored: false, message: 'Merge failed: ' + e.message };
        }
    }
}
