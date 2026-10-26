/**
 * 右欄「正在播放」：第 N / M 首、YouTube 播放器、歌名、整場時間軸、接下來（佇列）。
 *
 * - 播放器是 YouTube 官方嵌入播放器，至少 200×200、不可被任何元素覆蓋、播放中必須可見：
 *   右欄固定顯示不能收起；「點此播放」與錯誤提示都放在播放器下方，播放器外框裡只有掛載點本身。
 * - 播放器掛載點整個生命週期只有一個 DOM 節點：PlayerFrame 在任何寬度都是 aside 的第二個子節點，
 *   窄螢幕只是不渲染後面的詳細區塊（改放在中欄「正在播放」分頁），不會讓 React 重新掛載它。
 * - 播放、暫停與進度條只在底部播放列（PlayerBar），這裡不放第二份。
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../components/ui/utils';
import type { SongCatalog } from '../../songsSource';
import type { SegmentPlayer } from '../../hooks/useSegmentPlayer';
import { queuePosition } from '../../lib/queue';
import { MiniTimeline } from './MiniTimeline';
import { QueuePanel } from './QueuePanel';

/** 16:9 播放器外框：桌機寬 368（右欄 400 扣內距）；手機高 max(202px, min(56.25vw, 50dvh))。
    最小高 202 是扣掉 1px 邊框後 iframe 仍有 200（YouTube 嵌入政策 200×200） */
const PlayerFrame = memo(function PlayerFrame({ containerRef }: { containerRef: SegmentPlayer['containerRef'] }) {
    return (
        <div className="relative w-full shrink-0 overflow-hidden bg-black max-lg:h-[max(202px,min(56.25vw,50dvh))] lg:aspect-video lg:min-h-[202px] lg:rounded-[10px]">
            <div ref={containerRef} className="absolute inset-0" data-testid="songs-player" />
        </div>
    );
});

export function NowPlayingPanel({ player, catalog, narrow, onSaveQueue }: {
    player: SegmentPlayer;
    catalog: SongCatalog | undefined;
    narrow: boolean;
    onSaveQueue: () => void;
}) {
    const { t } = useTranslation('songs');
    const { queue } = player;
    const pos = queuePosition(queue);
    const hasQueue = queue.items.length > 0;

    let notice: string | null = null;
    if (player.playerStatus === 'error') notice = t('player.loadError');
    else if (queue.allFailed) notice = t('player.allFailed');
    else if (player.skipping) notice = t('player.skipping');
    else if (queue.status === 'stopped' && hasQueue) notice = t('player.ended');

    return (
        <aside
            aria-labelledby="songs-now-h"
            className="flex min-h-0 min-w-0 flex-col max-lg:order-first max-lg:shrink-0 lg:gap-3.5 lg:overflow-hidden lg:rounded-xl lg:bg-card lg:p-4"
        >
            <div className={cn('flex items-center', narrow && 'sr-only left-0 top-0')}>
                <h2 id="songs-now-h" className="flex-1 text-sm font-bold">{t('now.label')}</h2>
                {pos && <span className="text-xs tabular-nums text-muted-foreground">{t('now.position', { n: pos.n, m: pos.m })}</span>}
            </div>
            <PlayerFrame containerRef={player.containerRef} />
            {(player.needsGesture || notice) && (
                <div className="flex flex-col gap-2 max-lg:px-3 max-lg:pt-2">
                    {player.needsGesture && (
                        <Button className="w-full" onClick={player.resume}>
                            <Play className="size-4" aria-hidden="true" />
                            {t('player.tapToPlay')}
                        </Button>
                    )}
                    {notice && <p role="status" className="rounded-lg bg-popover px-3 py-2 text-sm">{notice}</p>}
                </div>
            )}
            {!narrow && <NowPlayingDetails player={player} catalog={catalog} onSaveQueue={onSaveQueue} fill />}
        </aside>
    );
}

/** 歌名、整場時間軸與接下來：桌機在右欄（佇列填滿剩餘高度、自己捲動），手機在中欄「正在播放」分頁（跟著分頁一起捲） */
export function NowPlayingDetails({ player, catalog, onSaveQueue, fill = false }: {
    player: SegmentPlayer;
    catalog: SongCatalog | undefined;
    onSaveQueue: () => void;
    fill?: boolean;
}) {
    const { t } = useTranslation('songs');
    const { queue, current } = player;
    const entry = current ? catalog?.byCode.get(current.code) : undefined;
    const pos = queuePosition(queue);
    const hasQueue = queue.items.length > 0;

    return (
        <div className={cn('flex min-w-0 flex-col gap-3.5', fill ? 'min-h-0 flex-1' : 'px-4 py-4')}>
            {!fill && pos && <p className="text-xs tabular-nums text-muted-foreground">{t('now.position', { n: pos.n, m: pos.m })}</p>}
            <div className="min-w-0" aria-live="polite">
                {entry ? (
                    <>
                        <p className="truncate text-[22px] font-black leading-tight">{entry.segment.title}</p>
                        <p className="truncate text-[13px] text-muted-foreground">
                            {[entry.segment.artist ? t('now.originalArtist', { artist: entry.segment.artist }) : null, entry.video.vtuber?.name ?? null]
                                .filter(Boolean)
                                .join('・')}
                        </p>
                    </>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {hasQueue ? t('now.none') : player.playerStatus === 'loading' ? t('player.loading') : t('player.empty')}
                    </p>
                )}
            </div>
            {entry && <MiniTimeline video={entry.video} currentCode={entry.segment.code} />}
            <section aria-labelledby="songs-next-h" className={cn('flex min-w-0 flex-col gap-1.5', fill && 'min-h-0 flex-1')}>
                <h3 id="songs-next-h" className="text-xs font-bold text-[#C9CEDE]">{t('now.upNext')}</h3>
                <QueuePanel player={player} catalog={catalog} onSaveQueue={onSaveQueue} fill={fill} />
            </section>
        </div>
    );
}
