/**
 * 聊天室收合時貼在畫面右緣的展開標籤。
 * 收合的聊天室不在畫布上（寬 0，見 canvasItemOps 的收合表示法），這是唯一能把它叫回來的入口。
 * 放在右緣偏上：右緣中段常是邊緣停靠型動態島的位置，底部右下角有意見回饋鈕。
 * 從聊天室選單收合時焦點交到這裡；點這裡展開後焦點交回聊天室的選單按鈕（見 chatFocusIntent）。
 */
import { memo, useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStreamStore } from '../../store/useStreamStore';
import { requestChatFocus, consumeChatFocus } from './chatFocusIntent';

export const ChatCollapsedTab = memo(function ChatCollapsedTab() {
    const { t } = useTranslation('common');
    const buttonRef = useRef<HTMLButtonElement>(null);
    const handleExpand = useCallback(() => {
        // 先登記再展開：展開會讓這顆按鈕卸載、聊天室（含選單按鈕）在同一次 commit 掛載
        requestChatFocus('layout-menu');
        useStreamStore.getState().expandChats();
    }, []);

    useEffect(() => {
        if (consumeChatFocus('expand-tab')) buttonRef.current?.focus();
    }, []);

    return (
        <button
            ref={buttonRef}
            type="button"
            onClick={handleExpand}
            title={t('canvas.expand_chat')}
            aria-label={t('canvas.expand_chat')}
            data-tour="chat-expand"
            className="absolute right-0 top-[18%] z-40 flex flex-col items-center gap-1 rounded-l-lg border border-r-0 border-white/15 bg-black/80 px-1.5 py-2.5 text-white/75 shadow-lg backdrop-blur-md transition-colors hover:bg-purple-900/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
        >
            <ChevronLeft size={14} aria-hidden />
            <MessageSquare size={14} aria-hidden />
        </button>
    );
});
