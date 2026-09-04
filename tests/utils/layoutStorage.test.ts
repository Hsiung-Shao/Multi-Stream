import { describe, it, expect, beforeEach } from 'vitest';
import { layoutStorage } from '../../src/utils/layoutStorage';
import type { CustomLayout } from '../../src/types/canvas';

// 用 fake-indexeddb(tests/setup.ts 已全域載入)跑真的 idb,不 mock 內部實作:
// 這個模組的價值就在 IndexedDB 的 clear → put → index 讀取流程,mock 掉就什麼都沒測到。

const mk = (id: string, name: string, createdAt: number): CustomLayout => ({
    id,
    name,
    slots: [],
    createdAt,
});

describe('layoutStorage', () => {
    beforeEach(async () => {
        await layoutStorage.saveToBackup([]);
    });

    it('starts empty', async () => {
        expect(await layoutStorage.loadFromBackup()).toEqual([]);
    });

    it('saveToBackup then loadFromBackup round-trips, ordered by createdAt', async () => {
        const newer = mk('b', 'Newer', 2000);
        const older = mk('a', 'Older', 1000);
        await layoutStorage.saveToBackup([newer, older]);

        const loaded = await layoutStorage.loadFromBackup();
        expect(loaded.map(l => l.id)).toEqual(['a', 'b']);
        expect(loaded[0]).toEqual(older);
        expect(loaded[1]).toEqual(newer);
    });

    it('saveToBackup replaces the whole backup (removed layouts disappear)', async () => {
        await layoutStorage.saveToBackup([mk('a', 'A', 1), mk('b', 'B', 2)]);
        await layoutStorage.saveToBackup([mk('b', 'B renamed', 2)]);

        const loaded = await layoutStorage.loadFromBackup();
        expect(loaded).toHaveLength(1);
        expect(loaded[0]).toMatchObject({ id: 'b', name: 'B renamed' });
    });

    it('deleteFromBackup removes one layout by id', async () => {
        await layoutStorage.saveToBackup([mk('a', 'A', 1), mk('b', 'B', 2)]);
        await layoutStorage.deleteFromBackup('a');

        const loaded = await layoutStorage.loadFromBackup();
        expect(loaded.map(l => l.id)).toEqual(['b']);
    });

    it('deleteFromBackup on a missing id is a no-op', async () => {
        await layoutStorage.saveToBackup([mk('a', 'A', 1)]);
        await expect(layoutStorage.deleteFromBackup('nope')).resolves.toBeUndefined();
        expect(await layoutStorage.loadFromBackup()).toHaveLength(1);
    });
});
