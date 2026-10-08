/**
 * 畫布 item 的純函式操作（store 與 UI 共用）。
 *
 * 全部只改 layout 或 contentId，**絕不改 item 的 `i`**：`i` 是畫布的 React key，
 * 一改就會卸載重建播放器 iframe（回到 muted=true 且 player 失聯，見切版面靜音事故）。
 */
import type { CanvasItem } from '../types/canvas';
import { generateColumnLayout, DEFAULT_CHAT_COLS } from './layoutPresets';
import { MIN_STREAM_CELLS } from '../components/Canvas/sizeLimits';

type StreamId = number;

const byPosition = (a: CanvasItem, b: CanvasItem) => a.layout.y - b.layout.y || a.layout.x - b.layout.x;

/**
 * 「N 串 + 1 共用聊天室」：畫布上恰好 1 個聊天室，且串流視窗（含空槽）至少 2 個，
 * 或那個聊天室帶 sharedChat 標記（共用版面刪到只剩 1 路時靠標記維持共用模式）。
 * 新增／移除串流時依此決定要不要替每一路補聊天室、聊天室要不要改指向其他路。
 */
export function isSharedChatLayout(items: readonly CanvasItem[]): boolean {
    let chats = 0, streams = 0, flagged = false;
    for (const it of items) {
        if (it.type === 'chat') { chats++; if (it.sharedChat) flagged = true; }
        else if (it.type === 'stream') streams++;
    }
    return chats === 1 && (streams >= 2 || flagged);
}

/**
 * 沿用既有 item（保留 i）時，sharedChat 標記一律跟著新版型走：
 * 從共用版面換成每路一聊時，被沿用的那個聊天室不能還帶著舊標記。
 */
export function withSharedFlag(item: CanvasItem, shared: boolean): CanvasItem {
    if (shared) return item.sharedChat ? item : { ...item, sharedChat: true };
    if (!item.sharedChat) return item;
    const { sharedChat: _drop, ...rest } = item;
    return rest;
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

/** 共用聊天室模式下那個聊天室正在顯示的串流 id；不是共用模式或聊天室收合時回 undefined（顯示空槽時為 null） */
export const sharedChatContentIdOf = cachedByItems((items): number | null | undefined =>
    isSharedChatLayout(items) && !chatsCollapsed(items) ? (items.find(it => it.type === 'chat')!.contentId ?? null) : undefined,
);

// ---- 聊天室收合 ----
// 收合不另存旗標：收合的聊天室就是 layout 寬 0、貼在最右緣（x = 24）的聊天室。
// 這樣任何重新產生版面的路徑（套用版型、自訂版面、分享連結）都會給聊天室正常寬度而自動展開；
// 漏處理某個 action 的後果只是「聊天室自己展開」，不會變成「聊天室藏起來、右側卻留一個洞」。
// 收合的聊天室不交給 SimpleCanvas（見 NewCanvasPage），推擠、碰撞、連鎖填補都看不到它。

export const isCollapsedChat = (it: CanvasItem): boolean => it.type === 'chat' && it.layout.w === 0;

/** 畫布上有聊天室，且全部都收合 */
export function chatsCollapsed(items: readonly CanvasItem[]): boolean {
    let chats = 0;
    for (const it of items) {
        if (it.type !== 'chat') continue;
        if (!isCollapsedChat(it)) return false;
        chats++;
    }
    return chats > 0;
}

/** 收合全部聊天室：串流填滿全寬，聊天室寬 0（i、contentId、sharedChat 都不動） */
export function collapseChats(items: readonly CanvasItem[], aspect: number): CanvasItem[] {
    return resizeChatColumn(items, aspect, 0);
}

/**
 * 把右側聊天室欄改成 toCols 欄（0 = 收合），用於調寬、收合、展開。
 * 聊天室本來就是右側一欄、串流都在它左邊時，只把串流的欄線依比例縮放：使用者自己排的大小與位置
 * （例如一大三小的主畫面）都保留，高度與上下位置完全不動。以「邊」取整，相鄰視窗不會有縫或重疊。
 * 聊天室不是一欄（每路一聊、被拖到中間），或縮放後有串流窄於下限（sizeLimits 的 MIN_STREAM_CELLS）時，
 * 才退回整個重排（layoutColumns）。
 * 沒有聊天室、或結果與原本一模一樣（例如選了目前已是的寬度）時回傳原陣列：
 * canvasItems 換新陣列就是整張畫布重繪加一次 localStorage 寫入，store 靠 `next === state.canvasItems` 略過。
 */
function resizeChatColumn(items: readonly CanvasItem[], aspect: number, toCols: number): CanvasItem[] {
    const chats = items.filter(it => it.type === 'chat');
    if (chats.length === 0) return items as CanvasItem[];
    const { x: colX, w: fromCols } = chats[0].layout;
    const isColumn = colX + fromCols === 24 && chats.every(c => c.layout.x === colX && c.layout.w === fromCols);
    const streams = items.filter(it => it.type === 'stream');
    if (!isColumn || streams.length === 0 || streams.some(s => s.layout.x + s.layout.w > colX)) {
        return unchangedOr(items, layoutColumns(items, aspect, [], toCols));
    }

    const toX = 24 - toCols;
    const edge = (e: number) => Math.round((e * toX) / colX);
    const next = items.map(it => {
        if (it.type === 'chat') return { ...it, layout: { ...it.layout, x: toX, w: toCols } };
        const x = edge(it.layout.x);
        return { ...it, layout: { ...it.layout, x, w: edge(it.layout.x + it.layout.w) - x } };
    });
    return unchangedOr(items, next.some(it => it.type === 'stream' && it.layout.w < MIN_STREAM_CELLS)
        ? layoutColumns(items, aspect, [], toCols)
        : next);
}

const sameLayout = (a: CanvasItem['layout'], b: CanvasItem['layout']) =>
    a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** next 與 items 逐項只差在 layout 物件身分（數值都相同）時回傳原陣列 */
function unchangedOr(items: readonly CanvasItem[], next: CanvasItem[]): CanvasItem[] {
    return next.length === items.length && next.every((it, i) => sameLayout(it.layout, items[i].layout))
        ? items as CanvasItem[]
        : next;
}

/**
 * 重新產生版面的 action（新增一路時的共用聊天室版型、移除後重排）用：
 * 原本聊天室是收合的，新版面也維持收合。使用者明確套用版型則不走這裡，聊天室會展開。
 */
export function keepChatsCollapsed(prev: readonly CanvasItem[], next: CanvasItem[], aspect: number): CanvasItem[] {
    return chatsCollapsed(prev) ? collapseChats(next, aspect) : next;
}

/**
 * 依目前的串流／聊天室數重排整個畫布（串流填滿左側、聊天室在右側一欄寬 chatCols），
 * 用於手動新增視窗之後、聊天室調寬／收合／展開。
 * 既有視窗依畫面位置（上→下、左→右）排序、newIds 排在最後，所以原本在左上的仍在左上。
 * 聊天室目前是收合的就維持收合（新增的聊天室寬度不是 0，所以新增聊天室會讓它們展開）。
 * 只改 layout，i、contentId、sharedChat 都不動。
 */
export function relayoutItems(
    items: readonly CanvasItem[],
    aspect: number,
    newIds: readonly string[] = [],
    chatCols: number = DEFAULT_CHAT_COLS,
): CanvasItem[] {
    return layoutColumns(items, aspect, newIds, chatsCollapsed(items) ? 0 : chatCols);
}

/** 展開聊天室（寬 chatCols）；也用於調寬。不論目前是否收合（見 resizeChatColumn） */
export function expandChats(items: readonly CanvasItem[], aspect: number, chatCols: number): CanvasItem[] {
    return resizeChatColumn(items, aspect, chatCols);
}

function layoutColumns(items: readonly CanvasItem[], aspect: number, newIds: readonly string[], chatCols: number): CanvasItem[] {
    const isNew = (it: CanvasItem) => newIds.includes(it.i);
    const ordered = (type: CanvasItem['type']) => [
        ...items.filter(it => it.type === type && !isNew(it)).sort(byPosition),
        ...items.filter(it => it.type === type && isNew(it)),
    ];
    const streams = ordered('stream');
    const chats = ordered('chat');
    const rects = generateColumnLayout(streams.length, chats.length, aspect, chatCols);
    const layoutOf = new Map<string, CanvasItem['layout']>();
    streams.forEach((it, idx) => layoutOf.set(it.i, rects.streams[idx]));
    chats.forEach((it, idx) => layoutOf.set(it.i, rects.chats[idx]));
    return items.map(it => (layoutOf.has(it.i) ? { ...it, layout: { ...layoutOf.get(it.i)! } } : it));
}
