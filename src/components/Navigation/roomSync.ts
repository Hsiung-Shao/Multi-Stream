/** 房間模式：版面與聲音的自動同步（RoomShell 掛載） */
import { useEffect, useRef } from 'react';
import { useStreamStore } from '../../store/useStreamStore';
import { useUIStore } from '../../store/useUIStore';
import { mainStreamItemIdOf, chatsCollapsed } from '../../utils/canvasItemOps';
import { applyRoomStage, applyFocusAudio } from './roomActions';

export function useRoomSync(): void {
    const roomMode = useUIStore(s => s.roomMode);
    const audioFollowsFocus = useUIStore(s => s.audioFollowsFocus);
    // 只數有內容的串流：保留空視窗模式下關掉舞台那路，空槽不算，才會改由有內容的那路上舞台
    const liveCount = useStreamStore(s => s.canvasItems.reduce((n, it) => n + (it.type === 'stream' && it.contentId != null ? 1 : 0), 0));
    const chatWidth = useStreamStore(s => s.chatColumnWidth);
    const collapsed = useStreamStore(s => chatsCollapsed(s.canvasItems));
    const mainId = useStreamStore(s => mainStreamItemIdOf(s.canvasItems));

    // 舞台模式下路數、聊天室寬度或收合狀態變了就重排成舞台。
    // 掛載時不排：重新整理不該蓋掉使用者調過的版面（切換到房間模式時由切換的地方排）
    const mounted = useRef(false);
    useEffect(() => {
        if (!mounted.current) { mounted.current = true; return; }
        if (roomMode === 'stage') applyRoomStage();
    }, [roomMode, liveCount, chatWidth, collapsed]);

    // 主畫面換人、或剛打開「聲音跟著焦點」時才調整聲音；掛載時不動使用者的靜音
    const prev = useRef({ mainId, audioFollowsFocus });
    useEffect(() => {
        const changed = mainId !== prev.current.mainId || (audioFollowsFocus && !prev.current.audioFollowsFocus);
        prev.current = { mainId, audioFollowsFocus };
        if (changed && audioFollowsFocus && mainId) applyFocusAudio(mainId);
    }, [mainId, audioFollowsFocus]);
}
