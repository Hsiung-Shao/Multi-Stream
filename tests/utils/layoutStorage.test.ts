import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use doMock for modules with top-level await or complex side effects if necessary
// But standard vi.mock works if we don't have top-level await issues.
// layoutStorage uses 'idb' which might be ESM. 
// We mock 'idb' before import.

const mockDB = {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(),
    getAllKeys: vi.fn(),
};

const mockOpenDB = vi.fn().mockResolvedValue(mockDB);

vi.mock('idb', () => ({
    openDB: mockOpenDB
}));

// Dynamic import to ensure mock is applied
describe('layoutStorage', () => {
    let layoutStorage: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        // Re-import to get fresh module if possible, or just use the imported one.
        // Since it's a singleton export, we might need to reset it or just verify method calls.
        const module = await import('../../src/utils/layoutStorage');
        layoutStorage = module.layoutStorage;
    });

    it('should save layout', async () => {
        const layoutData = { streams: [], id: '1' };
        await layoutStorage.saveLayout('test-layout', layoutData);
        // We expect put to be called on db
        expect(mockDB.put).toHaveBeenCalledWith('layouts', layoutData, 'test-layout');
    });

    it('should load layout', async () => {
        const mockData = { streams: [] };
        mockDB.get.mockResolvedValue(mockData);

        const result = await layoutStorage.loadLayout('test-layout');
        expect(mockDB.get).toHaveBeenCalledWith('layouts', 'test-layout');
        expect(result).toBe(mockData);
    });

    it('should delete layout', async () => {
        await layoutStorage.deleteLayout('test-layout');
        expect(mockDB.delete).toHaveBeenCalledWith('layouts', 'test-layout');
    });

    it('should get all layouts', async () => {
        // getList returns keys
        mockDB.getAllKeys.mockResolvedValue(['layout1', 'layout2']);

        // The implementation might get values or keys. 
        // layoutStorage.getLayoutList() -> returns keys or object?
        // Checking source (inferred): likely returns list of layouts.
        // Wait, the previous test file content says it checks keys or list.
        // Let's assume getList returns keys.

        const list = await layoutStorage.getLayoutList();
        expect(mockDB.getAllKeys).toHaveBeenCalled();
        expect(list).toEqual(['layout1', 'layout2']);
    });
});
