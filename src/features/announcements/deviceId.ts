/**
 * 公告系統的「裝置匿名識別」
 *
 * 目的:給未登入使用者一個穩定的 id,讓 backend 的 unique 索引能去重
 * (anon 同裝置不能對同一個 poll 投兩次)。
 *
 * 隱私:這個 id 只用來去重 + rate limit,不上 GA4、不送第三方,
 * 也不跨網域傳遞。可被使用者透過清 LocalStorage 重置。
 *
 * 永久化:寫入 LocalStorage,key = `announcement:device_id`。
 * - 沒有 storage(e.g. SSR / 隱私模式 fallback)時:回傳 null,
 *   呼叫端要自行處理(顯示登入提示或不去重)。
 */

const STORAGE_KEY = 'announcement:device_id';
const MAX_LEN = 128; // 對齊 backend isValidDeviceId

function generateUuid(): string {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    // RFC4122 v4 fallback
    const bytes = new Uint8Array(16);
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 取(或建立)當前裝置的 announcement device id。
 * - 已登入也可呼叫(backend 會優先用 user_id,device_id 只是備援)
 * - 無 LocalStorage 可用時回 null
 */
export function getOrCreateDeviceId(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const existing = window.localStorage.getItem(STORAGE_KEY);
        if (existing && existing.length >= 1 && existing.length <= MAX_LEN) {
            return existing;
        }
        const next = generateUuid();
        window.localStorage.setItem(STORAGE_KEY, next);
        return next;
    } catch {
        return null;
    }
}
