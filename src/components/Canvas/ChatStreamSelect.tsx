/**
 * ChatStreamSelect —— 聊天室視窗標頭的下拉選單：切換這個聊天室顯示哪一路。
 *
 * 選項＝畫布上正在看的串流（依位置：上→下、左→右），另外保留目前這一路
 * （聊天室顯示的串流不一定在畫布上，例如版型路數比串流少時被收起的那一路）。
 * 只改聊天室 item 的 contentId（updateCanvasItem），聊天室視窗的 `i` 不變；
 * 串流播放器完全不受影響（聊天室 iframe 換頻道本來就會重載，那是預期的）。
 */
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useStreamStore } from '../../store/useStreamStore';
import { streamContentIdsByPosition } from '../../utils/canvasItemOps';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const PLATFORM_DOT: Record<string, string> = {
    twitch: '#9146FF',
    youtube: '#FF0000',
};

interface ChatStreamSelectProps {
    /** 聊天室視窗的 canvas item id */
    chatItemId: string;
    /** 聊天室目前顯示的串流 id */
    activeStreamId: number;
}

// 選單在拖曳把手（工具列）裡：不擋 pointerdown 的話，打開選單時會順手拖動整個視窗
const stopPointerDown = (e: React.PointerEvent) => e.stopPropagation();

export const ChatStreamSelect = memo(function ChatStreamSelect({ chatItemId, activeStreamId }: ChatStreamSelectProps) {
    const { t } = useTranslation('common');
    const onCanvas = useStreamStore(useShallow(s => streamContentIdsByPosition(s.canvasItems)));
    const ids = onCanvas.includes(activeStreamId) ? onCanvas : [activeStreamId, ...onCanvas];
    // 只取選單需要的欄位，音量／靜音等變動不會讓選單重繪
    const labels = useStreamStore(useShallow(s => ids.map(id => {
        const st = s.streams.find(x => x.id === id);
        return st ? (st.displayName || st.channelId || st.videoId) : String(id);
    })));
    const platforms = useStreamStore(useShallow(s => ids.map(id => s.streams.find(x => x.id === id)?.platform ?? '')));

    const select = useCallback((value: string) => {
        const id = Number(value);
        if (id !== activeStreamId) useStreamStore.getState().updateCanvasItem(chatItemId, { contentId: id });
    }, [chatItemId, activeStreamId]);

    return (
        <Select value={String(activeStreamId)} onValueChange={select}>
            <SelectTrigger
                size="sm"
                aria-label={t('canvas.shared_chat_tabs')}
                title={t('canvas.shared_chat_tabs')}
                onPointerDown={stopPointerDown}
                className="nodrag h-6 min-w-0 flex-1 gap-1 border-white/10 bg-white/10 px-2 py-0 text-[11px] text-white hover:bg-white/15 dark:bg-white/10"
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[120] border-white/10 bg-slate-900 text-white">
                {ids.map((id, idx) => (
                    <SelectItem key={id} value={String(id)} className="text-xs focus:bg-white/10 focus:text-white">
                        <span
                            aria-hidden
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ background: PLATFORM_DOT[platforms[idx]] ?? '#94a3b8' }}
                        />
                        <span className="truncate">{labels[idx]}</span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
});
