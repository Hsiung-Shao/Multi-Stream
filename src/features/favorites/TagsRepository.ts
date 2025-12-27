import { safeJSONParse } from '../../utils/security/index';
import { Tag } from './types';

const STORAGE_KEY = 'preference_tags';

export class TagsRepository {
    getList(): Tag[] {
        if (typeof localStorage === 'undefined') return [];
        const saved = localStorage.getItem(STORAGE_KEY);
        return safeJSONParse(saved, []);
    }

    saveList(list: Tag[]): void {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }

    add(item: Tag): void {
        const list = this.getList();
        list.push(item);
        this.saveList(list);
    }

    update(id: string, updates: Partial<Tag>): boolean {
        const list = this.getList();
        const index = list.findIndex(t => t.id === id);
        if (index === -1) return false;

        list[index] = { ...list[index], ...updates };
        this.saveList(list);
        return true;
    }

    remove(id: string): Tag | null {
        const list = this.getList();
        const item = list.find(t => t.id === id);
        if (!item) return null;

        const filtered = list.filter(t => t.id !== id);
        this.saveList(filtered);
        return item;
    }

    findById(id: string): Tag | undefined {
        return this.getList().find(t => t.id === id);
    }
}
