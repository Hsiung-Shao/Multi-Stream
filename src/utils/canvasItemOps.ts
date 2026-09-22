/**
 * 畫布 item 的純函式操作（store 與 UI 共用）。
 *
 * 全部只改 layout 或 contentId，**絕不改 item 的 `i`**：`i` 是畫布的 React key，
 * 一改就會卸載重建播放器 iframe（回到 muted=true 且 player 失聯，見切版面靜音事故）。
 */
import type { CanvasItem } from '../types/canvas';

type StreamId = number;

const byPosition = (a: CanvasItem, b: CanvasItem) => a.layout.y - b.layout.y || a.layout.x - b.layout.x;

/**
 * 「N 串 + 1 共用聊天室」：畫布上恰好 1 個聊天室，且串流視窗（含空槽）至少 2 個。
 * 聊天室標頭在這個狀態下才顯示分頁；新增串流時也依此決定要不要替每一路補聊天室。
 */
export function isSharedChatLayout(items: readonly CanvasItem[]): boolean {
    let chats = 0, streams = 0;
    for (const it of items) {
        if (it.type === 'chat') chats++;
        else if (it.type === 'stream') streams++;
    }
    return chats === 1 && streams >= 2;
}

/** 畫布上有內容的串流 contentId，依位置（上→下、左→右）排序；聊天室分頁與改指向都用這個順序 */
export function streamContentIdsByPosition(items: readonly CanvasItem[]): StreamId[] {
    return items
        .filter(it => it.type === 'stream' && it.contentId != null)
        .sort(byPosition)
        .map(it => it.contentId as StreamId);
}

/**
 * 某一路被移除前，把正在顯示它的聊天室改指向「還沒有任何聊天室在顯示」的另一路（依位置取第一個）。
 * 共用聊天室因此不會跟著那一路消失；每路各配一個聊天室的版面沒有這種候選，行為不變。
 */
export function retargetChatsOf(items: readonly CanvasItem[], removedId: StreamId): CanvasItem[] {
    if (!items.some(it => it.type === 'chat' && it.contentId === removedId)) return items as CanvasItem[];

    const shown = new Set(
        items.filter(it => it.type === 'chat' && it.contentId != null && it.contentId !== removedId).map(it => it.contentId),
    );
    const candidates = streamContentIdsByPosition(items).filter(id => id !== removedId && !shown.has(id));

    return items.map(it => {
        if (it.type !== 'chat' || it.contentId !== removedId || candidates.length === 0) return it;
        return { ...it, contentId: candidates.shift()! };
    });
}

/** 兩個 item 互換位置與尺寸（內容與 `i` 都不動） */
export function swapItemLayouts(items: readonly CanvasItem[], aId: string, bId: string): CanvasItem[] {
    if (aId === bId) return items as CanvasItem[];
    const a = items.find(it => it.i === aId);
    const b = items.find(it => it.i === bId);
    if (!a || !b) return items as CanvasItem[];
    return items.map(it => {
        if (it.i === aId) return { ...it, layout: { ...b.layout } };
        if (it.i === bId) return { ...it, layout: { ...a.layout } };
        return it;
    });
}

/**
 * 「主畫面」＝面積最大、有內容的串流視窗；同面積取最上、再取最左。
 * 空槽不算：否則「保留空視窗」模式下主畫面那路被關掉後，★ 只會把串流換進空槽。
 */
export function selectMainStreamItemId(items: readonly CanvasItem[]): string | null {
    let best: CanvasItem | null = null;
    for (const it of items) {
        if (it.type !== 'stream' || it.contentId == null) continue;
        if (!best) { best = it; continue; }
        const area = it.layout.w * it.layout.h, bestArea = best.layout.w * best.layout.h;
        if (area > bestArea || (area === bestArea && byPosition(it, best) < 0)) best = it;
    }
    return best?.i ?? null;
}

// ---- 以 canvasItems 陣列身分快取的衍生值 ----
// 每個畫布視窗都會訂閱這些值；store 任何更新（音量、直播狀態）都會讓每個視窗重跑 selector。
// canvasItems 只有版面真的變動才換新陣列，用 WeakMap 以陣列身分快取，一次更新只算一次而非「視窗數 × 掃描」。
function cachedByItems<T>(compute: (items: readonly CanvasItem[]) => T) {
    const cache = new WeakMap<readonly CanvasItem[], T>();
    return (items: readonly CanvasItem[]): T => {
        if (cache.has(items)) return cache.get(items)!;
        const value = compute(items);
        cache.set(items, value);
        return value;
    };
}

export const mainStreamItemIdOf = cachedByItems(selectMainStreamItemId);

/** 共用聊天室模式下那個聊天室正在顯示的串流 id；不是共用模式回 undefined（顯示空槽時為 null） */
export const sharedChatContentIdOf = cachedByItems((items): number | null | undefined =>
    isSharedChatLayout(items) ? (items.find(it => it.type === 'chat')!.contentId ?? null) : undefined,
);
