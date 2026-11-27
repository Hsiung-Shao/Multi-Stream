/** 貼圖選單的「最近使用」：存 localStorage（只是方便，讀寫失敗就當沒有） */
import type { PickerEmote } from './emoteSections';

export const RECENT_KEY = 'chat-emote-recent';
const MAX = 30;

export function readRecentEmotes(): PickerEmote[] {
    try {
        const raw: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
        if (!Array.isArray(raw)) return [];
        // 存的值可能被竄改：只收 https 圖片與不含空白的名稱
        return raw.filter((e): e is PickerEmote =>
            typeof e?.name === 'string' && /^\S+$/.test(e.name) && typeof e.url === 'string' && /^https:\/\/[^\s"'<>]+$/.test(e.url)).slice(0, MAX);
    } catch {
        return [];
    }
}

/** 最新的放最前、同名去重、最多 30 個 */
export function pushRecentEmote(e: PickerEmote): PickerEmote[] {
    const next = [{ name: e.name, url: e.url }, ...readRecentEmotes().filter(x => x.name !== e.name)].slice(0, MAX);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* 無痕或滿了：這次就不記 */ }
    return next;
}
