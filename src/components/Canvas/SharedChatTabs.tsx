/**
 * SharedChatTabs —— 「N 串 + 1 共用聊天室」的聊天室標頭分頁：切換聊天室顯示哪一路。
 *
 * 只改聊天室 item 的 contentId（updateCanvasItem），聊天室視窗的 `i` 不變；
 * 串流播放器完全不受影響（聊天室 iframe 換頻道本來就會重載，那是預期的）。
 */
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useStreamStore } from '../../store/useStreamStore';
import { streamContentIdsByPosition } from '../../utils/canvasItemOps';
import { cn } from '../ui/utils';

const PLATFORM_DOT: Record<string, string> = {
    twitch: '#9146FF',
    youtube: '#FF0000',
};

interface SharedChatTabsProps {
    /** 聊天室視窗的 canvas item id */
    chatItemId: string;
    /** 聊天室目前顯示的串流 id */
    activeStreamId: number;
}

// 分頁在拖曳把手（工具列）裡：不擋 pointerdown 的話，點分頁時手一抖就會拖動整個視窗
const stopPointerDown = (e: React.PointerEvent) => e.stopPropagation();

export const SharedChatTabs = memo(function SharedChatTabs({ chatItemId, activeStreamId }: SharedChatTabsProps) {
    const { t } = useTranslation('common');
    const ids = useStreamStore(useShallow(s => streamContentIdsByPosition(s.canvasItems)));
    // 只取分頁需要的欄位，音量／靜音等變動不會讓分頁重繪
    const labels = useStreamStore(useShallow(s => ids.map(id => {
        const st = s.streams.find(x => x.id === id);
        return st ? (st.displayName || st.channelId || st.videoId) : '';
    })));
    const platforms = useStreamStore(useShallow(s => ids.map(id => s.streams.find(x => x.id === id)?.platform ?? '')));

    const select = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        const id = Number(e.currentTarget.dataset.streamId);
        if (id !== activeStreamId) useStreamStore.getState().updateCanvasItem(chatItemId, { contentId: id });
    }, [chatItemId, activeStreamId]);

    return (
        <div role="tablist" aria-label={t('canvas.shared_chat_tabs')} className="flex min-w-0 flex-1 gap-0.5 overflow-hidden">
            {ids.map((id, idx) => {
                const active = id === activeStreamId;
                return (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-stream-id={id}
                        title={labels[idx]}
                        onPointerDown={stopPointerDown}
                        onClick={select}
                        className={cn(
                            'nodrag flex min-w-0 max-w-[120px] flex-1 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors',
                            active
                                ? 'bg-white/15 text-white ring-1 ring-sky-400/70'
                                : 'text-white/55 hover:bg-white/10 hover:text-white',
                        )}
                    >
                        <span
                            aria-hidden
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ background: PLATFORM_DOT[platforms[idx]] ?? '#94a3b8' }}
                        />
                        <span className="truncate">{labels[idx]}</span>
                    </button>
                );
            })}
        </div>
    );
});
