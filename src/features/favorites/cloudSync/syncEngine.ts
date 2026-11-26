/**
 * 收藏雲端同步：登入時完整同步一次；之後本機變動 3 秒去抖只推差異（以快照當雲端現況，不拉雲端）；
 * 回到視窗且距上次完整同步超過 5 分鐘再拉一次（看別台裝置的改動）。顧及 Supabase 出口流量，不做即時訂閱。
 */
import { create } from 'zustand';
import { safeJSONParse } from '../../../utils/security/index';
import { useAuthStore } from '../../auth/authStore';
import { mergeSync, type SyncData } from './merge';
import { fetchAll, applyChanges } from './remote';
import { backupService } from '../../backup/index';

export const SNAPSHOT_PREFIX = 'ms_cloud_sync:';
/** 本機收藏目前屬於哪個帳號（最後一次同步成功的帳號；登出後保留，換帳號登入時用來判斷要不要先問） */
const OWNER_KEY = 'ms_cloud_sync_owner';

/** 同步狀態：設定頁顯示用；needs_choice＝本機收藏屬於另一個帳號，等使用者選併入或改用雲端 */
export const useSyncStatus = create<{ state: 'idle' | 'syncing' | 'ok' | 'error' | 'needs_choice' }>(() => ({ state: 'idle' }));
const setStatus = (state: ReturnType<typeof useSyncStatus.getState>['state']) => useSyncStatus.setState({ state });
/** 收藏、分類、標籤的 repository 寫入後發這個事件（見 *Repository.saveList） */
export const LOCAL_SAVED_EVENT = 'ms-favorites-saved';

const KEYS = { favorites: 'favoriteStreams', categories: 'favoriteCategories', tags: 'preference_tags' } as const;
const DEBOUNCE_MS = 3000;
const PULL_INTERVAL_MS = 5 * 60_000;

/** IndexedDB 自動備份立刻跟上本機：否則啟動時的備份合併會把舊資料（換帳號前的收藏、剛刪掉的收藏）併回本機、再同步進雲端 */
const backupNow = () => backupService.backup().catch(() => false);

const readLocal = (): SyncData => ({
    favorites: safeJSONParse(localStorage.getItem(KEYS.favorites), []),
    categories: safeJSONParse(localStorage.getItem(KEYS.categories), []),
    tags: safeJSONParse(localStorage.getItem(KEYS.tags), []),
});

function writeLocal(d: SyncData) {
    localStorage.setItem(KEYS.favorites, JSON.stringify(d.favorites));
    localStorage.setItem(KEYS.categories, JSON.stringify(d.categories));
    localStorage.setItem(KEYS.tags, JSON.stringify(d.tags));
    void backupNow();
    // 跟備份還原同一組事件，讓收藏、分類、標籤的畫面重讀
    window.dispatchEvent(new CustomEvent('favoritesUpdated', { detail: { action: 'restore' } }));
    window.dispatchEvent(new CustomEvent('categoriesUpdated'));
    window.dispatchEvent(new CustomEvent('tagsUpdated'));
}

const userId = () => {
    const { status, user } = useAuthStore.getState();
    return status === 'authed' && user ? user.id : null;
};
const readSnapshot = (uid: string): SyncData | null => safeJSONParse(localStorage.getItem(SNAPSHOT_PREFIX + uid), null);
const saveSnapshot = (uid: string, d: SyncData) => {
    try { localStorage.setItem(SNAPSHOT_PREFIX + uid, JSON.stringify(d)); } catch { /* 存不下就下次當第一次同步：只聯集，不會誤刪 */ }
};
const isEmpty = (r: ReturnType<typeof mergeSync>) =>
    !r.upsert.favorites.length && !r.upsert.categories.length && !r.upsert.tags.length
    && !r.remove.favorites.length && !r.remove.categories.length && !r.remove.tags.length;

let running: Promise<boolean> | null = null;
let lastPull = 0;

/** 完整同步：拉雲端 → 合併 → 寫回本機 → 推差異 → 成功才更新快照 */
export function syncNow(): Promise<boolean> {
    running ??= (async () => {
        const uid = userId();
        if (!uid) return false;
        const owner = localStorage.getItem(OWNER_KEY);
        const local = readLocal();
        if (owner && owner !== uid) {
            // 本機現在屬於別的帳號：這個帳號的舊快照描述的是別份本機資料，拿來合併會把雲端當成被本機刪光，一律丟掉
            localStorage.removeItem(SNAPSHOT_PREFIX + uid);
            // 本機有東西就先問（併入或改用雲端）；本機是空的沒什麼好問，直接聯集
            if (local.favorites.length > 0 || local.categories.length > 0) {
                setStatus('needs_choice');
                return false;
            }
        }
        const snapshot = readSnapshot(uid);
        setStatus('syncing');
        const remote = await fetchAll(uid);
        if (!remote || userId() !== uid) { setStatus('error'); return false; }
        lastPull = Date.now();
        const result = mergeSync(readLocal(), remote, snapshot);
        writeLocal(result.local);
        // 空差異時 applyChanges 不會發任何請求
        const ok = await applyChanges(uid, result.upsert, result.remove);
        if (ok) { saveSnapshot(uid, result.local); localStorage.setItem(OWNER_KEY, uid); }
        setStatus(ok ? 'ok' : 'error');
        return ok;
    })().finally(() => { running = null; });
    return running;
}

/**
 * 換帳號時本機收藏的處理：merge＝併進目前帳號；cloud＝本機先備份（backup_ 開頭，改版號不會清），再改用雲端的收藏
 */
export async function resolveAccountSwitch(mode: 'merge' | 'cloud'): Promise<boolean> {
    const uid = userId();
    if (!uid) return false;
    if (mode === 'cloud') {
        try { localStorage.setItem(`backup_cloud_switch_${Date.now()}`, JSON.stringify(readLocal())); } catch { return false; }
        localStorage.setItem(KEYS.favorites, '[]');
        localStorage.setItem(KEYS.categories, '[]');
        localStorage.setItem(KEYS.tags, '[]');
        // 接著的同步可能失敗：先讓備份也換成清空後的本機，否則下次載入會把前一帳號的收藏併回來
        await backupNow();
    }
    // 舊快照描述的是別份本機資料，留著會被當成本機刪除：丟掉，走第一次同步的聯集
    localStorage.removeItem(SNAPSHOT_PREFIX + uid);
    localStorage.setItem(OWNER_KEY, uid);
    return syncNow();
}

/** 只推本機改動：以快照當雲端現況合併，不拉雲端 */
async function pushLocal(): Promise<boolean> {
    const uid = userId();
    if (!uid || useSyncStatus.getState().state === 'needs_choice') return false;
    const snapshot = readSnapshot(uid);
    if (!snapshot) return syncNow(); // 還沒完整同步過：走完整流程
    const result = mergeSync(readLocal(), snapshot, snapshot);
    if (isEmpty(result)) return true;
    const ok = await applyChanges(uid, result.upsert, result.remove);
    if (ok) { saveSnapshot(uid, result.local); void backupNow(); }
    setStatus(ok ? 'ok' : 'error');
    return ok;
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function notifyLocalChange(): void {
    if (!userId()) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
        timer = undefined;
        // 完整同步進行中就等它結束再推，避免兩邊同時改快照
        void (running ?? Promise.resolve()).then(() => pushLocal());
    }, DEBOUNCE_MS);
}

/** App 啟動時呼叫：登入狀態變成已登入就同步；回到視窗超過 5 分鐘再拉一次 */
export function startCloudSync(): () => void {
    let prev = useAuthStore.getState().status;
    if (prev === 'authed') void syncNow();
    const unsub = useAuthStore.subscribe(s => {
        if (s.status === 'authed' && prev !== 'authed') void syncNow();
        if (s.status === 'anon') setStatus('idle');
        prev = s.status;
    });
    const onSaved = () => notifyLocalChange();
    const onFocus = () => { if (userId() && Date.now() - lastPull > PULL_INTERVAL_MS) void syncNow(); };
    window.addEventListener(LOCAL_SAVED_EVENT, onSaved);
    window.addEventListener('focus', onFocus);
    return () => {
        unsub();
        clearTimeout(timer);
        window.removeEventListener(LOCAL_SAVED_EVENT, onSaved);
        window.removeEventListener('focus', onFocus);
    };
}
