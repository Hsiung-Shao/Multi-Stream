// 「清除所有資料」跨分頁：其他分頁記憶體中的 store 會把舊資料寫回共用的 localStorage，
// 所以清除的分頁要廣播，收到的分頁封住寫入並重新載入；發起的分頁自己不能被重新載入。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 同名頻道的所有物件互相廣播（不含發送的那個物件本身），模擬瀏覽器 BroadcastChannel
class FakeChannel {
    static all: FakeChannel[] = [];
    onmessage: ((e: { data: unknown }) => void) | null = null;
    constructor(public name: string) { FakeChannel.all.push(this); }
    postMessage(data: unknown) {
        for (const c of FakeChannel.all) if (c !== this && c.name === this.name) c.onmessage?.({ data });
    }
    close() { FakeChannel.all = FakeChannel.all.filter(c => c !== this); }
}

const originalSetItem = Storage.prototype.setItem;
const originalRemoveItem = Storage.prototype.removeItem;
let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.resetModules();
    FakeChannel.all = [];
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
});

afterEach(() => {
    Storage.prototype.setItem = originalSetItem;
    Storage.prototype.removeItem = originalRemoveItem;
    vi.unstubAllGlobals();
});

describe('clearAllDataSignal', () => {
    it('其他分頁廣播清除時：封住 Storage 寫入並重新載入', async () => {
        const { listenForClearAllData } = await import('../../src/utils/clearAllDataSignal');
        listenForClearAllData();

        // 另一個分頁（另一份模組實例）發出廣播
        new FakeChannel('multistream-clear-all-data').postMessage('clear');

        expect(reload).toHaveBeenCalledTimes(1);
        expect(Storage.prototype.setItem).not.toBe(originalSetItem);
    });

    it('發起清除的分頁收到自己的廣播時不重新載入', async () => {
        const { listenForClearAllData, broadcastClearAllData } = await import('../../src/utils/clearAllDataSignal');
        listenForClearAllData();

        broadcastClearAllData();

        expect(reload).not.toHaveBeenCalled();
    });

    it('瀏覽器不支援 BroadcastChannel 時不丟錯', async () => {
        vi.stubGlobal('BroadcastChannel', undefined);
        const { listenForClearAllData, broadcastClearAllData } = await import('../../src/utils/clearAllDataSignal');
        expect(() => { listenForClearAllData(); broadcastClearAllData(); }).not.toThrow();
    });
});
