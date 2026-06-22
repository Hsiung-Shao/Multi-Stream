/**
 * LocalStorage 旗標管理(per-announcement 顯示狀態)
 *
 * key 設計:
 *   announcement:dismissed:<id> — 使用者點「不再顯示 / 關閉」(toast / chip)
 *   announcement:voted:<id>     — 使用者已投票或填過問卷
 *   announcement:viewed:<id>    — 使用者已看過(目前未使用,保留擴充)
 *
 * 寫入失敗一律 silent(Safari 隱私模式 / quota 滿)— 這只是 UX 優化,
 * 真正的去重靠 backend unique 索引。
 */

const PREFIX = 'announcement';

type Flag = 'dismissed' | 'voted' | 'viewed';

function key(flag: Flag, id: string): string {
    return `${PREFIX}:${flag}:${id}`;
}

function safeGet(k: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage.getItem(k);
    } catch {
        return null;
    }
}

function safeSet(k: string, v: string): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(k, v);
    } catch {
        /* ignore — UX-only */
    }
}

export function isFlagSet(flag: Flag, id: string): boolean {
    return safeGet(key(flag, id)) === '1';
}

export function setFlag(flag: Flag, id: string): void {
    safeSet(key(flag, id), '1');
}
