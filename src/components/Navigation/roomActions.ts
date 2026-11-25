/** 房間模式的畫布動作（讀寫 store）；排版與靜音規則在 utils/roomStage 的純函式 */
import { useStreamStore } from '../../store/useStreamStore';
import { useUIStore } from '../../store/useUIStore';
import { stageLayout, focusMuteUpdates, roomChatItems } from '../../utils/roomStage';
import type { CanvasItem } from '../../types/canvas';
import { relayoutItems, selectMainStreamItemId, streamContentIdsByPosition } from '../../utils/canvasItemOps';
import { getCanvasAspect } from '../../utils/layoutPresets';

/** 依 item 的串流套「聲音跟著焦點」（呼叫端決定開關） */
export function applyFocusAudio(itemId: string): void {
    // 全體靜音中不動：解除焦點靜音會讓它出聲，且之後 setAllMuted(false) 的還原值會錯亂
    if (useUIStore.getState().masterMuted) return;
    const { canvasItems, streams, updateStream } = useStreamStore.getState();
    const streamId = canvasItems.find(it => it.i === itemId)?.contentId;
    if (streamId == null) return;
    for (const u of focusMuteUpdates(streams, streamId)) updateStream(u.id, { isMuted: u.isMuted });
}

const contentOf = (items: readonly CanvasItem[], itemId: string | undefined) => items.find(it => it.i === itemId)?.contentId;

/** 聊天室收成一個；followId 有值時頻道換成那個視窗的串流。數量變了（收掉多的）就重排 */
function withRoomChat(items: CanvasItem[], followId: string | undefined, chatCols: number): CanvasItem[] {
    const next = roomChatItems(items, contentOf(items, followId));
    return next.length === items.length ? next : relayoutItems(next, getCanvasAspect(), [], chatCols);
}

/** 寫回 store；內容沒變就不寫（canvasItems 換新陣列＝整張畫布重繪加一次 localStorage 寫入） */
function commit(prev: CanvasItem[], next: CanvasItem[]): void {
    if (JSON.stringify(next) !== JSON.stringify(prev)) useStreamStore.setState({ canvasItems: next });
}

/** 聊天室跟到某個視窗的串流（焦點換人時用） */
export function followRoomChat(itemId: string): void {
    const { canvasItems, chatColumnWidth } = useStreamStore.getState();
    commit(canvasItems, withRoomChat(canvasItems, itemId, chatColumnWidth));
}

/** 把某個視窗設為焦點：舞台模式放上舞台（排不下舞台時與主畫面換位）；平分模式與主畫面互換位置。聊天室跟過去，聲音視設定跟著走 */
export function focusRoomItem(itemId: string): void {
    const { roomMode, audioFollowsFocus } = useUIStore.getState();
    const store = useStreamStore.getState();
    const staged = roomMode === 'stage'
        ? stageLayout(roomChatItems(store.canvasItems, contentOf(store.canvasItems, itemId)), itemId, store.chatColumnWidth)
        : null;
    if (staged) {
        commit(store.canvasItems, staged);
    } else {
        store.setMainCanvasItem(itemId);
        followRoomChat(itemId);
    }
    if (audioFollowsFocus) applyFocusAudio(itemId);
}

const mainItemId = (items: CanvasItem[]) => selectMainStreamItemId(items) ?? items.find(it => it.type === 'stream')?.i;
// 版面類觸發只收掉多的聊天室；只有真的要收時才順便跟上主畫面，否則保留使用者自己選的頻道
const followIfMerging = (items: CanvasItem[], mainId: string) => (items.filter(it => it.type === 'chat').length > 1 ? mainId : undefined);

/** 依目前主畫面重排成舞台（新增／關閉視窗後用）並把聊天室收成一個；排不成舞台時只整理聊天室 */
export function applyRoomStage(): void {
    const { canvasItems, chatColumnWidth } = useStreamStore.getState();
    const mainId = mainItemId(canvasItems);
    if (!mainId) return;
    const follow = followIfMerging(canvasItems, mainId);
    const base = roomChatItems(canvasItems, contentOf(canvasItems, follow));
    commit(canvasItems, stageLayout(base, mainId, chatColumnWidth) ?? withRoomChat(canvasItems, follow, chatColumnWidth));
}

/** 平分模式：只把聊天室收成一個 */
export function applyRoomChat(): void {
    const { canvasItems, chatColumnWidth } = useStreamStore.getState();
    const mainId = mainItemId(canvasItems);
    if (mainId) commit(canvasItems, withRoomChat(canvasItems, followIfMerging(canvasItems, mainId), chatColumnWidth));
}

/** 依目前模式整理版面（切到房間模式、版面變動後用） */
export function applyRoomLayout(): void {
    if (useUIStore.getState().roomMode === 'stage') applyRoomStage(); else applyRoomChat();
}

/** 舞台 ⇄ 平分 */
export function toggleRoomMode(): void {
    const ui = useUIStore.getState();
    if (ui.roomMode === 'stage') {
        ui.setRoomMode('grid');
        const { canvasItems, chatColumnWidth } = useStreamStore.getState();
        useStreamStore.setState({ canvasItems: relayoutItems(canvasItems, getCanvasAspect(), [], chatColumnWidth) });
    } else {
        ui.setRoomMode('stage');
        applyRoomStage();
    }
}

/** 快捷鍵 1–9：依畫面位置的第 index 路設為焦點 */
export function focusRoomIndex(index: number): void {
    const { canvasItems } = useStreamStore.getState();
    const id = streamContentIdsByPosition(canvasItems)[index];
    const item = canvasItems.find(it => it.type === 'stream' && it.contentId === id);
    if (item) focusRoomItem(item.i);
}

/** 移除舞台上那一路（房間模式沒有視窗工具列，從「更多」選單進來） */
export function removeStageItem(): void {
    const { canvasItems, removeCanvasItem } = useStreamStore.getState();
    const id = selectMainStreamItemId(canvasItems);
    if (id) removeCanvasItem(id);
}
