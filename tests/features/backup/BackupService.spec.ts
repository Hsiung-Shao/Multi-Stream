
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackupService, BackupData } from '../../../src/features/backup/BackupService';

// Mock Global Window and LocalStorage
if (typeof window === 'undefined') {
    (global as any).window = global;
}

if (!global.localStorage) {
    let storage: Record<string, string> = {};
    (global as any).localStorage = {
        getItem: (key: string) => storage[key] || null,
        setItem: (key: string, value: string) => storage[key] = value,
        removeItem: (key: string) => delete storage[key],
        clear: () => storage = {}
    };
}
(global as any).window.localStorage = (global as any).localStorage;

// Mock IndexedDB Factory
const mockIndexedDB = {
    open: vi.fn(),
};
Object.defineProperty(window, 'indexedDB', { value: mockIndexedDB });

describe('BackupService', () => {
    let service: BackupService;
    let mockObjectStore: any;

    // Helper to create an auto-resolving request
    const createAutoRequest = (result: any) => {
        let _onsuccess: Function | null = null;
        return {
            set onsuccess(cb: Function | null) {
                _onsuccess = cb;
                if (cb) cb({ target: { result } });
            },
            get onsuccess() { return _onsuccess; },
            set onerror(cb: Function) { /* no-op */ },
            result
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
            objectStoreNames: { contains: vi.fn() }
        };

        // For open(), we also need auto-resolution
        mockIndexedDB.open.mockImplementation(() => {
            return createAutoRequest(mockDb);
        });

        // Default implementation for put/get is success
        mockObjectStore.put.mockImplementation((val: any) => createAutoRequest(undefined));
        mockObjectStore.get.mockImplementation(() => createAutoRequest(undefined));

        service = new BackupService();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('Backup Data Structure', () => {
        it('should include ms_user_uuid in backup data', async () => {
            localStorage.setItem('ms_user_uuid', 'test-uid-123');
            localStorage.setItem('favoriteStreams', '[]');

            // This waits for init() which calls open(), which auto-resolves.
            await service.init();

            // This calls put(), which auto-resolves.
            await service.backup();

            const putCall = mockObjectStore.put.mock.calls[0][0];
            expect(putCall.data.uid).toBe('test-uid-123');
        });

        it('should collect all legacy data fields', async () => {
            localStorage.setItem('userSettings', '{"vol": 50}');
            localStorage.setItem('favoriteStreams', '[{"id":"1"}]');

            await service.init();
            await service.backup();

            const putCall = mockObjectStore.put.mock.calls[0][0];
            expect(putCall.data.userSettings).toEqual({ vol: 50 });
            expect(putCall.data.favoriteStreams).toEqual([{ id: "1" }]);
        });
    });

    describe('Debounce Logic', () => {
        it('should debounce backup calls by 5 seconds', async () => {
            await service.init();

            service.scheduleBackup();
            vi.advanceTimersByTime(2000);
            service.scheduleBackup(); // Reset

            vi.advanceTimersByTime(4000);
            // Total 6s from first call, but only 4s from second.
            expect(mockObjectStore.put).not.toHaveBeenCalled();

            vi.advanceTimersByTime(1100);
            // Total 5.1s from second call
            expect(mockObjectStore.put).toHaveBeenCalledTimes(1);
        });
    });

    describe('Restore Logic', () => {
        it('Scenario 1: LocalStorage YES, IndexedDB YES -> No Restore', async () => {
            localStorage.setItem('favoriteStreams', '[{"id":"local"}]');

            const dbData = { timestamp: 123, data: { favoriteStreams: [{ id: "db" }] } };
            mockObjectStore.get.mockImplementation(() => createAutoRequest({ data: dbData }));

            await service.init();
            const result = await service.autoRestore();

            expect(result.restored).toBe(false);
            expect(localStorage.getItem('favoriteStreams')).toContain('local');
        });

        it('Scenario 2: LocalStorage NO, IndexedDB YES -> Restore', async () => {
            localStorage.removeItem('favoriteStreams');

            const backupContent = {
                favoriteStreams: [{ id: "db" }],
                uid: "db-uid"
            };
            // The DB record returned by get(). it has a 'data' field containing your backup
            const dbRecord = {
                data: backupContent
            };
            mockObjectStore.get.mockImplementation(() => createAutoRequest(dbRecord));

            await service.init();
            const result = await service.autoRestore();

            expect(result.restored).toBe(true);
            expect(localStorage.getItem('favoriteStreams')).toContain('db');
            expect(localStorage.getItem('ms_user_uuid')).toBe('db-uid');
        });

        it('Scenario 3: LocalStorage YES, IndexedDB NO -> Reverse Backup', async () => {
            localStorage.setItem('favoriteStreams', '[{"id":"local"}]');

            // DB returns null/empty
            mockObjectStore.get.mockImplementation(() => createAutoRequest(null));

            await service.init();
            const result = await service.autoRestore();

            expect(result.restored).toBe(false);
            // Should have triggered backup (put)
            expect(mockObjectStore.put).toHaveBeenCalled();
            // Verify data being put matches local storage
            const putCall = mockObjectStore.put.mock.calls[0][0];
            expect(putCall.data.favoriteStreams).toEqual([{ id: "local" }]);
        });

        it('Scenario 4: LocalStorage NO, IndexedDB NO -> No Action', async () => {
            localStorage.removeItem('favoriteStreams');

            mockObjectStore.get.mockImplementation(() => createAutoRequest(null));

            await service.init();
            const result = await service.autoRestore();

            expect(result.restored).toBe(false);
            expect(mockObjectStore.put).not.toHaveBeenCalled();
        });
    });
});
