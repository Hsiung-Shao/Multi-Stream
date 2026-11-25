/** 房間模式的畫布動作（讀寫 store）；排版與靜音規則在 utils/roomStage 的純函式 */
import { useStreamStore } from '../../store/useStreamStore';
import { useUIStore } from '../../store/useUIStore';
import { stageLayout, focusMuteUpdates } from '../../utils/roomStage';
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

/** 把某個視窗設為焦點：舞台模式放上舞台；平分模式與主畫面互換位置。聲音視設定跟著走 */
export function focusRoomItem(itemId: string): void {
    const { roomMode, audioFollowsFocus } = useUIStore.getState();
    const store = useStreamStore.getState();
    if (roomMode === 'stage') {
        const next = stageLayout(store.canvasItems, itemId, store.chatColumnWidth);
        if (next) useStreamStore.setState({ canvasItems: next });
    } else {
        store.setMainCanvasItem(itemId);
    }
    if (audioFollowsFocus) applyFocusAudio(itemId);
}

/** 依目前主畫面重排成舞台（新增／關閉視窗後用）；排不成時不動 */
export function applyRoomStage(): void {
    const { canvasItems, chatColumnWidth } = useStreamStore.getState();
    const mainId = selectMainStreamItemId(canvasItems) ?? canvasItems.find(it => it.type === 'stream')?.i;
    if (!mainId) return;
    const next = stageLayout(canvasItems, mainId, chatColumnWidth);
    // 版面數值沒變就不寫：canvasItems 換新陣列＝整張畫布重繪加一次 localStorage 寫入
    if (next && JSON.stringify(next.map(it => it.layout)) !== JSON.stringify(canvasItems.map(it => it.layout))) {
        useStreamStore.setState({ canvasItems: next });
    }
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
