import { useTranslation } from 'react-i18next';
import { ListPlus, Music2, X } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { ScrollArea } from '../../../../components/ui/scroll-area';
import { cn } from '../../../../components/ui/utils';
import type { SongCatalog } from '../../songsSource';
import type { SegmentPlayer } from '../../hooks/useSegmentPlayer';

/** 佇列（右欄「接下來」）：fill＝填滿父層剩餘高度並自己捲動（桌機右欄）；否則跟著外層一起捲（手機分頁） */
export function QueuePanel({ player, catalog, onSaveQueue, fill = false }: {
    player: SegmentPlayer;
    catalog: SongCatalog | undefined;
    onSaveQueue: () => void;
    fill?: boolean;
}) {
    const { t } = useTranslation('songs');
    const { queue } = player;
    if (queue.items.length === 0) {
        return <p className="px-1 py-6 text-center text-sm text-muted-foreground">{t('queue.empty')}</p>;
    }
    const header = (
        <div className="flex items-center gap-2 px-1">
            <span className="text-[13px] text-muted-foreground">{t('queue.count', { count: queue.items.length })}</span>
            <Button variant="ghost" size="sm" className="ml-auto h-8" onClick={onSaveQueue}>
                <ListPlus className="size-3.5" aria-hidden="true" />
                {t('queue.saveAs')}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={player.clear}>
                {t('queue.clear')}
            </Button>
        </div>
    );
    const list = (
        <ol className="flex flex-col gap-0.5 pr-3">
            {queue.order.map((idx, pos) => {
                const item = queue.items[idx];
                if (!item) return null;
                const entry = catalog?.byCode.get(item.code);
                const isCurrent = pos === queue.cursor;
                const unplayable = queue.unplayable.includes(item.videoId);
                return (
                    <li key={item.code} className={cn('group flex items-center gap-1 rounded-lg', isCurrent && 'bg-primary/10')}>
                        <button
                            type="button"
                            onClick={() => player.jump(pos)}
                            aria-current={isCurrent ? 'true' : undefined}
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <span className="w-5 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
                                {isCurrent && player.isPlaying ? <Music2 className="ml-auto size-3.5 text-primary" aria-hidden="true" /> : pos + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className={cn('block truncate text-sm', isCurrent && 'font-semibold', unplayable && 'text-muted-foreground line-through')}>
                                    {entry?.segment.title ?? item.code}
                                </span>
                                <span className="block truncate text-[12px] text-muted-foreground">
                                    {unplayable ? t('queue.unplayable') : [entry?.segment.artist, entry?.video.vtuber?.name].filter(Boolean).join(' · ')}
                                </span>
                            </span>
                        </button>
                        {!isCurrent && (
                            <Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground" onClick={() => player.remove(pos)} aria-label={t('queue.remove')} title={t('queue.remove')}>
                                <X className="size-3.5" aria-hidden="true" />
                            </Button>
                        )}
                    </li>
                );
            })}
        </ol>
    );
    return (
        <div className={cn('flex flex-col gap-2', fill && 'min-h-0 flex-1')}>
            {header}
            {fill ? <ScrollArea className="min-h-0 flex-1 [&>div>div]:!block">{list}</ScrollArea> : list}
        </div>
    );
}
