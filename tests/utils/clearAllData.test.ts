// 「清除所有資料」：只清 localStorage 的話，下次進站會從 IndexedDB MultiStreamBackup 還原，
// 所以兩個 IndexedDB 也要刪，而且清完後不能再被記憶體中的 store 寫回。
import { describe, it, expect, vi, afterEach } from 'vitest';

const { closeForDeletion, closeLayouts } = vi.hoisted(() => ({
    closeForDeletion: vi.fn(),
    closeLayouts: vi.fn(async () => {}),
}));
vi.mock('../../src/features/backup', () => ({ backupService: { closeForDeletion } }));
vi.mock('../../src/utils/layoutStorage', () => ({ layoutStorage: { close: closeLayouts }, LAYOUT_DB_NAME: 'multi-stream-db' }));

import { clearAllSiteData, SITE_INDEXED_DBS } from '../../src/utils/clearAllData';

const originalSetItem = Storage.prototype.setItem;
const originalRemoveItem = Storage.prototype.removeItem;

afterEach(() => {
    Storage.prototype.setItem = originalSetItem;
    Storage.prototype.removeItem = originalRemoveItem;
    vi.unstubAllGlobals();
});

function stubIndexedDB() {
    const deleted: string[] = [];
    vi.stubGlobal('indexedDB', {
        deleteDatabase: (name: string) => {
            deleted.push(name);
            const req: any = {};
            queueMicrotask(() => req.onsuccess?.());
            return req;
        },
    });
    return deleted;
}

describe('clearAllSiteData', () => {
    it('刪除兩個 IndexedDB、清空 localStorage 與 sessionStorage（含 versionCheck 會保留的 key）', async () => {
        const deleted = stubIndexedDB();
        localStorage.setItem('favoriteStreams', '[]');
        localStorage.setItem('stream-storage', '{}');
        localStorage.setItem('app_version', '3.6.1');
        sessionStorage.setItem('x', '1');

        await clearAllSiteData();

        expect(closeForDeletion).toHaveBeenCalled();
        expect(closeLayouts).toHaveBeenCalled();
        expect(deleted.sort()).toEqual([...SITE_INDEXED_DBS].sort());
        expect(deleted).toContain('MultiStreamBackup');
        // tests/setup.ts 的 localStorage 是簡化 mock(沒有 length),逐一確認
        expect(localStorage.getItem('favoriteStreams')).toBeNull();
        expect(localStorage.getItem('stream-storage')).toBeNull();
        expect(localStorage.getItem('app_version')).toBeNull();
        expect(sessionStorage.length).toBe(0);
    });

    it('清完後到重新載入前，store 的寫入不會把資料寫回去', async () => {
        stubIndexedDB();
        await clearAllSiteData();
        // 瀏覽器的 localStorage / sessionStorage 都是 Storage 實例；jsdom 的 sessionStorage 是真的 Storage
        sessionStorage.setItem('stream-storage', '{"state":{}}');
        expect(sessionStorage.getItem('stream-storage')).toBeNull();
        expect(Storage.prototype.setItem).not.toBe(originalSetItem);
    });

    it('其他分頁擋住刪除（blocked）時不會卡住', async () => {
        vi.stubGlobal('indexedDB', {
            deleteDatabase: () => {
                const req: any = {};
                queueMicrotask(() => req.onblocked?.());
                return req;
            },
        });
        await expect(clearAllSiteData()).resolves.toBeUndefined();
    });
});
