import { openDB, DBSchema } from 'idb';
import { CustomLayout } from '../types/canvas';

interface StreamDB extends DBSchema {
    'custom-layouts': {
        key: string;
        value: CustomLayout;
        indexes: { 'by-date': number };
    };
}

/** 自訂版面備份資料庫名稱(「清除所有資料」也要刪這個,見 utils/clearAllData.ts) */
export const LAYOUT_DB_NAME = 'multi-stream-db';
const DB_NAME = LAYOUT_DB_NAME;
const STORE_NAME = 'custom-layouts';

// 延遲到第一次用到才開 DB：模組頂層就 openDB 會讓 SSG 預渲染（Node 無 indexedDB）在 import 時直接炸
let dbPromise: ReturnType<typeof openDB<StreamDB>> | null = null;
const getDb = () => {
    dbPromise ??= openDB<StreamDB>(DB_NAME, 1, {
        upgrade(db) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('by-date', 'createdAt');
        },
    });
    return dbPromise;
};

export const layoutStorage = {
    /** 關閉連線(刪除資料庫前呼叫,否則刪除會被自己的連線擋住) */
    async close() {
        if (!dbPromise) return;
        const pending = dbPromise;
        dbPromise = null;
        try { (await pending).close(); } catch { /* 沒開成功就沒有連線要關 */ }
    },

    async saveToBackup(layouts: CustomLayout[]) {
        try {
            const db = await getDb();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            // We overwrite everything to match store or just put items?
            // Since it's a backup of the whole state, let's just ensure all items exist.
            // But clearing old ones if deleted is cleaner.
            // For simplicity in this iteration: Clear and Put All (Backup Strategy).
            await store.clear();

            for (const layout of layouts) {
                await store.put(layout);
            }

            await tx.done;
        } catch (error) {
            console.error('Failed to save layouts to IndexedDB:', error);
        }
    },

    async loadFromBackup(): Promise<CustomLayout[]> {
        try {
            const db = await getDb();
            return await db.getAllFromIndex(STORE_NAME, 'by-date');
        } catch (error) {
            console.error('Failed to load layouts from IndexedDB:', error);
            return [];
        }
    },

    async deleteFromBackup(id: string) {
        try {
            const db = await getDb();
            await db.delete(STORE_NAME, id);
        } catch (error) {
            console.error('Failed to delete layout from IndexedDB:', error);
        }
    }
};
