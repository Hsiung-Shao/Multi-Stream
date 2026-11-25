/** 房間模式：版面與聲音的自動同步（RoomShell 掛載） */
import { useEffect, useRef } from 'react';
import { useStreamStore } from '../../store/useStreamStore';
import { useUIStore } from '../../store/useUIStore';
import { mainStreamItemIdOf, chatsCollapsed } from '../../utils/canvasItemOps';
import { applyRoomLayout, applyFocusAudio, followRoomChat } from './roomActions';

export function useRoomSync(): void {
    const roomMode = useUIStore(s => s.roomMode);
    const audioFollowsFocus = useUIStore(s => s.audioFollowsFocus);
    // 只數有內容的串流：保留空視窗模式下關掉舞台那路，空槽不算，才會改由有內容的那路上舞台
    const liveCount = useStreamStore(s => s.canvasItems.reduce((n, it) => n + (it.type === 'stream' && it.contentId != null ? 1 : 0), 0));
    // 視窗總數（含空槽與聊天室）：新增／關閉聊天室或空槽時，其他動作會把版面排成平分，要排回舞台
    const windowCount = useStreamStore(s => s.canvasItems.length);
    const chatWidth = useStreamStore(s => s.chatColumnWidth);
    const masterMuted = useUIStore(s => s.masterMuted);
    const collapsed = useStreamStore(s => chatsCollapsed(s.canvasItems));
    const mainId = useStreamStore(s => mainStreamItemIdOf(s.canvasItems));

    // 路數、聊天室寬度或收合狀態變了：舞台模式重排成舞台；兩種模式都把聊天室收成一個。
    // 掛載時不排：重新整理不該蓋掉使用者調過的版面（切換到房間模式時由切換的地方排）
    const mounted = useRef(false);
    useEffect(() => {
        if (!mounted.current) {
            mounted.current = true;
            // 例外：房間模式只有一個聊天室，舊版面留下的多個聊天室掛載時就收掉
            if (useStreamStore.getState().canvasItems.filter(it => it.type === 'chat').length > 1) applyRoomLayout();
            return;
        }
        applyRoomLayout();
    }, [roomMode, liveCount, windowCount, chatWidth, collapsed]);

    // 主畫面換人、剛打開「聲音跟著焦點」、或剛解除全體靜音時才調整聲音；掛載時不動使用者的靜音。
    // 解除全體靜音那次：setAllMuted(false) 會還原成靜音前的狀態，焦點若在期間換過人要補上
    const prev = useRef({ mainId, audioFollowsFocus, masterMuted });
    useEffect(() => {
        const p = prev.current;
        const changed = mainId !== p.mainId || (audioFollowsFocus && !p.audioFollowsFocus) || (!masterMuted && p.masterMuted);
        prev.current = { mainId, audioFollowsFocus, masterMuted };
        // 主畫面不論怎麼換人（關掉舞台那路、換位），聊天室都跟過去
        if (mainId && mainId !== p.mainId) followRoomChat(mainId);
        if (changed && audioFollowsFocus && mainId) applyFocusAudio(mainId);
    }, [mainId, audioFollowsFocus, masterMuted]);
}
