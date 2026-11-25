/** 房間模式聊天室標頭：一排頻道標籤，點了切換聊天室顯示哪一路（選項與切換同 ChatStreamSelect） */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStreamOptions, PLATFORM_DOT } from '../Canvas/ChatStreamSelect';
import { cn } from '../ui/utils';

export const RoomChatTabs = memo(function RoomChatTabs({ chatItemId, activeStreamId }: { chatItemId: string; activeStreamId: number }) {
    const { t } = useTranslation('common');
    const { ids, labels, platforms, select } = useChatStreamOptions(chatItemId, activeStreamId);
    return (
        <div role="group" aria-label={t('canvas.shared_chat_tabs')} className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
            {ids.map((id, idx) => (
                <button
                    key={id}
                    type="button"
                    aria-pressed={id === activeStreamId}
                    onClick={() => select(String(id))}
                    className={cn(
                        'flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors',
                        id === activeStreamId ? 'border-white/25 bg-white/15 text-white' : 'border-transparent text-white/60 hover:bg-white/10 hover:text-white',
                    )}
                >
                    <span aria-hidden className="size-1.5 rounded-full" style={{ background: PLATFORM_DOT[platforms[idx]] ?? '#94a3b8' }} />
                    <span className="max-w-[9rem] truncate">{labels[idx]}</span>
                </button>
            ))}
        </div>
    );
});
