// 歌單備份：BackupService 要把 localStorage['song-playlists'] 原字串納入備份與還原
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackupService } from '../../../src/features/backup/BackupService';

// Mock IndexedDB Factory（寫法同 BackupService.spec.ts）
const mockIndexedDB = {
    open: vi.fn(),
};
Object.defineProperty(window, 'indexedDB', { value: mockIndexedDB, configurable: true });

describe('BackupService 歌單備份', () => {
    let service: BackupService;
    let mockObjectStore: any;

    const createAutoRequest = (result: any) => {
        let _onsuccess: Function | null = null;
        return {
            set onsuccess(cb: Function | null) {
                _onsuccess = cb;
                if (cb) cb({ target: { result } });
            },
            get onsuccess() { return _onsuccess; },
            set onerror(cb: Function) { /* no-op */ },
            result,
        };
    };

    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
        vi.clearAllMocks();

        mockObjectStore = {
            put: vi.fn(),
            get: vi.fn(),
            createIndex: vi.fn(),
        };
        const mockTransaction = {
            objectStore: vi.fn().mockReturnValue(mockObjectStore),
            oncomplete: null,
            onerror: null,
        };
        const mockDb = {
            transaction: vi.fn().mockReturnValue(mockTransaction),
            createObjectStore: vi.fn().mockReturnValue(mockObjectStore),
            objectStoreNames: { contains: vi.fn() },
        };
        mockIndexedDB.open.mockImplementation(() => createAutoRequest(mockDb));
        mockObjectStore.put.mockImplementation(() => createAutoRequest(undefined));
        mockObjectStore.get.mockImplementation(() => createAutoRequest(undefined));

        service = new BackupService();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('備份含歌單原字串，還原後寫回同字串', async () => {
        const raw = '{"state":{"playlists":[{"id":"p1","name":"我的歌單","codes":["abcd1234"],"createdAt":1,"updatedAt":2}]},"version":1}';
        localStorage.setItem('song-playlists', raw);

        await service.init();
        await service.backup();
        const saved = mockObjectStore.put.mock.calls[0][0].data;
        expect(saved.songPlaylists).toBe(raw);

        localStorage.clear();
        const result = await service.performRestore(saved);
        expect(result.success).toBe(true);
        expect(localStorage.getItem('song-playlists')).toBe(raw);
    });

    it('沒有歌單時備份不帶 songPlaylists，還原不寫入空值', async () => {
        await service.init();
        const data = service.getAllData() as any;
        expect(data.songPlaylists == null).toBe(true);

        await service.performRestore(data);
        expect(localStorage.getItem('song-playlists')).toBeNull();
    });
});
