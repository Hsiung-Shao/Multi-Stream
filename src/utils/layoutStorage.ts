import { openDB, DBSchema } from 'idb';
import { CustomLayout } from '../types/canvas';

interface StreamDB extends DBSchema {
    'custom-layouts': {
        key: string;
        value: CustomLayout;
        indexes: { 'by-date': number };
    };
}

const DB_NAME = 'multi-stream-db';
const STORE_NAME = 'custom-layouts';

const dbPromise = openDB<StreamDB>(DB_NAME, 1, {
    upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by-date', 'createdAt');
    },
});

export const layoutStorage = {
    async saveToBackup(layouts: CustomLayout[]) {
        try {
            const db = await dbPromise;
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
            const db = await dbPromise;
            return await db.getAllFromIndex(STORE_NAME, 'by-date');
        } catch (error) {
            console.error('Failed to load layouts from IndexedDB:', error);
            return [];
        }
    },

    async deleteFromBackup(id: string) {
        try {
            const db = await dbPromise;
            await db.delete(STORE_NAME, id);
        } catch (error) {
            console.error('Failed to delete layout from IndexedDB:', error);
        }
    }
};
