import { safeJSONParse } from '../../utils/security/index';
import { FavoriteStream } from './types';

const STORAGE_KEY = 'favoriteStreams';

export class FavoritesRepository {
    getList(): FavoriteStream[] {
        if (typeof localStorage === 'undefined') return [];
        const saved = localStorage.getItem(STORAGE_KEY);
        return safeJSONParse(saved, []);
    }

    saveList(list: FavoriteStream[]): void {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        // Note: Backup logic is separate, usually triggered by Service
    }

    add(item: FavoriteStream): void {
        const list = this.getList();
        list.push(item);
        this.saveList(list);
    }

    update(id: string, updates: Partial<FavoriteStream>): boolean {
        const list = this.getList();
        const index = list.findIndex(f => f.id === id);
        if (index === -1) return false;

        list[index] = { ...list[index], ...updates };
        this.saveList(list);
        return true;
    }

    remove(id: string): FavoriteStream | null {
        const list = this.getList();
        const item = list.find(f => f.id === id);
        if (!item) return null;

        const filtered = list.filter(f => f.id !== id);
        this.saveList(filtered);
        return item;
    }

    /**
     * Updates categoryId to null for favorites in a removed category
     */
    uncategorize(categoryId: string): void {
        const list = this.getList();
        let changed = false;
        list.forEach(fav => {
            if (fav.categoryId === categoryId) {
                fav.categoryId = null;
                changed = true;
            }
        });
        if (changed) {
            this.saveList(list);
        }
    }
}
