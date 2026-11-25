/** 房間模式聊天欄分頁：「合併」收畫布上所有 Twitch，YouTube（及其他平台）各一個原生聊天室分頁 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStreamOptions, PLATFORM_DOT } from '../Canvas/ChatStreamSelect';
import { useUIStore } from '../../store/useUIStore';
import { cn } from '../ui/utils';

const tabClass = (on: boolean) => cn(
    'flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors',
    on ? 'border-white/25 bg-white/15 text-white' : 'border-transparent text-white/60 hover:bg-white/10 hover:text-white',
);

export const RoomChatTabs = memo(function RoomChatTabs({ chatItemId, activeStreamId }: { chatItemId: string; activeStreamId: number }) {
    const { t } = useTranslation('common');
    const { ids, labels, platforms, select } = useChatStreamOptions(chatItemId, activeStreamId);
    const merged = useUIStore(s => s.roomChatMerged);
    const setMerged = useUIStore(s => s.setRoomChatMerged);
    const hasTwitch = platforms.includes('twitch');
    // 聊天室指向的是 Twitch 時一律算合併（例如看著的 YouTube 被移除、聊天室被改指到某路 Twitch）
    const showMerged = hasTwitch && (merged || platforms[ids.indexOf(activeStreamId)] === 'twitch');
    return (
        <div role="group" aria-label={t('canvas.shared_chat_tabs')} className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
            {hasTwitch && (
                <button type="button" aria-pressed={showMerged} onClick={() => setMerged(true)} className={tabClass(showMerged)}>
                    <span aria-hidden className="size-1.5 rounded-full" style={{ background: PLATFORM_DOT.twitch }} />
                    {t('room.chat_merged')}
                </button>
            )}
            {ids.map((id, idx) => platforms[idx] === 'twitch' ? null : (
                <button
                    key={id}
                    type="button"
                    aria-pressed={!showMerged && id === activeStreamId}
                    onClick={() => { setMerged(false); select(String(id)); }}
                    className={tabClass(!showMerged && id === activeStreamId)}
                >
                    <span aria-hidden className="size-1.5 rounded-full" style={{ background: PLATFORM_DOT[platforms[idx]] ?? '#94a3b8' }} />
                    <span className="max-w-[9rem] truncate">{labels[idx]}</span>
                </button>
            ))}
        </div>
    );
});
