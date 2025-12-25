import { safeJSONParse } from '../../utils/security/index';
import { FavoriteCategory } from './types';

const STORAGE_KEY = 'favoriteCategories';

export class CategoryRepository {
    getList(): FavoriteCategory[] {
        if (typeof localStorage === 'undefined') return [];
        const saved = localStorage.getItem(STORAGE_KEY);
        return safeJSONParse(saved, []);
    }

    saveList(list: FavoriteCategory[]): void {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }

    add(name: string): { success: boolean; message: string; category?: FavoriteCategory } {
        const list = this.getList();

        // Check for duplicates
        if (list.some(cat => cat.name === name)) {
            return { success: false, message: 'categoryExists' }; // Key for i18n
        }

        const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newCategory: FavoriteCategory = {
            id: uniqueId,
            name: name,
            createdAt: new Date().toISOString()
        };

        list.push(newCategory);
        this.saveList(list);

        return { success: true, message: 'categoryAdded', category: newCategory };
    }

    update(id: string, newName: string): { success: boolean; message: string } {
        const list = this.getList();
        const category = list.find(cat => cat.id === id);

        if (!category) {
            return { success: false, message: 'categoryNotFound' };
        }

        if (list.some(cat => cat.id !== id && cat.name === newName)) {
            return { success: false, message: 'categoryExists' };
        }

        category.name = newName;
        this.saveList(list);

        return { success: true, message: 'categoryUpdated' };
    }

    remove(id: string): { success: boolean; message: string } {
        const list = this.getList();
        const filtered = list.filter(cat => cat.id !== id);

        if (list.length === filtered.length) {
            return { success: false, message: 'categoryNotFound' };
        }

        this.saveList(filtered);
        return { success: true, message: 'categoryRemoved' };
    }
}
