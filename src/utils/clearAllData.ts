/**
 * 「清除所有資料」(收藏管理 → 設定):刪除本站存在這個瀏覽器的所有資料,然後重新載入。
 *
 * 必須同時清三處,少一處就會在下次進站被還原:
 * - localStorage / sessionStorage:收藏、版面、設定等(含 versionCheck 的 PRESERVED_KEYS,這裡不保留任何 key)
 * - IndexedDB MultiStreamBackup:收藏自動備份;只清 localStorage 的話,下次進站 autoRestore 會整份還原回來
 * - IndexedDB multi-stream-db:自訂版面備份
 *
 * 清完到重新載入之間,記憶體中的 store(zustand persist、beforeunload 的 touchLastActive)
 * 仍可能把舊狀態寫回 localStorage,所以清除後封住 Storage 寫入,直到頁面重新載入。
 */
import { backupService } from '../features/backup';
import { BACKUP_DB_NAME } from '../features/backup/BackupService';
import { layoutStorage, LAYOUT_DB_NAME } from './layoutStorage';

export const SITE_INDEXED_DBS = [BACKUP_DB_NAME, LAYOUT_DB_NAME] as const;

// 其他分頁仍開著連線時 deleteDatabase 會停在 blocked;刪除會在連線關閉後完成,這裡不無限等
const DELETE_TIMEOUT_MS = 3000;

function deleteDatabase(name: string): Promise<void> {
    return new Promise(resolve => {
        if (typeof indexedDB === 'undefined') return resolve();
        const timer = setTimeout(resolve, DELETE_TIMEOUT_MS);
        const done = () => { clearTimeout(timer); resolve(); };
        try {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = done;
            req.onerror = done;
            req.onblocked = done;
        } catch {
            done();
        }
    });
}

function freezeStorageWrites(): void {
    const noop = () => {};
    Storage.prototype.setItem = noop;
    Storage.prototype.removeItem = noop;
}

/** 清除本站所有本機資料(不含重新載入,方便測試;UI 端呼叫完再 reload) */
export async function clearAllSiteData(): Promise<void> {
    backupService.closeForDeletion();
    await layoutStorage.close();
    await Promise.all(SITE_INDEXED_DBS.map(deleteDatabase));

    try { localStorage.clear(); } catch { /* 被瀏覽器封鎖時無可清 */ }
    try { sessionStorage.clear(); } catch { /* 同上 */ }
    freezeStorageWrites();
}
