/**
 * 「清除所有資料」的跨分頁通知(清除流程本體見 clearAllData.ts)。
 *
 * 其他分頁記憶體中的 store(zustand persist、收藏)會在下一次寫入時把舊資料寫回共用的 localStorage,
 * 開著的 IndexedDB 連線也會讓 deleteDatabase 卡在 blocked。所以清除的分頁先廣播,
 * 其他分頁收到就封住 Storage 寫入並重新載入。
 *
 * 獨立成零依賴小模組:main.tsx 啟動時就要掛監聽,不能為此把 backup / idb 拉進首屏 bundle。
 */
const CHANNEL_NAME = 'multistream-clear-all-data';

// 同一個分頁裡,發送端與監聽端是不同的 BroadcastChannel 物件,監聽端也會收到自己發的訊息;
// 用這個旗標讓發起清除的分頁不要在清到一半時把自己重新載入
let clearingHere = false;

/** 封住 Storage 寫入直到頁面重新載入(清除後記憶體中的 store 仍可能寫回) */
export function freezeStorageWrites(): void {
    const noop = () => {};
    Storage.prototype.setItem = noop;
    Storage.prototype.removeItem = noop;
}

/** 啟動時呼叫一次:其他分頁清除資料時,本分頁封住寫入並重新載入 */
export function listenForClearAllData(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
        const channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = () => {
            if (clearingHere) return;
            freezeStorageWrites();
            window.location.reload();
        };
    } catch {
        /* main.tsx 頂層呼叫:建構失敗(如 opaque origin)不能讓整個 App 起不來 */
    }
}

/** 清除前呼叫:通知其他分頁 */
export function broadcastClearAllData(): void {
    clearingHere = true;
    if (typeof BroadcastChannel === 'undefined') return;
    try {
        const channel = new BroadcastChannel(CHANNEL_NAME);
        channel.postMessage('clear');
        channel.close();
    } catch {
        /* 不支援就退回「請關閉其他分頁」的確認文案 */
    }
}
