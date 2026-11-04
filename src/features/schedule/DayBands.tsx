// 「接下來」簡潔模式：一天分成幾個時段，每段一排 72px 頭像小格（頭像＋名字＋時間、平台圓點、勾選外框）。
// 超過一排的收成「+N」按鈕；收藏的人排該段最前面，常看的人不會被收進去。詳細模式仍是 DayTimeline 的小時列。
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../components/ui/utils';
import { groupByBand, type Band } from './bands';
import { formatClock } from './formatTime';
import { streamKey, type ScheduleChannel, type ScheduleStream } from './types';

export const DEFAULT_ROW_LIMIT = 14;

interface DayBandsProps {
    streams: ScheduleStream[];
    channels: Record<string, ScheduleChannel>;
    now: number;
    selected: ReadonlySet<string>;
    onToggle: (s: ScheduleStream) => void;
    /** 收藏的 vtuber_id：排該時段最前面 */
    favorites?: ReadonlySet<string>;
    /** 每段先顯示幾場（預設一排 14） */
    rowLimit?: number;
}

function BandSection({ band, items, channels, selected, onToggle, favorites, rowLimit, locale }: { band: Band; items: ScheduleStream[]; channels: Record<string, ScheduleChannel>; selected: ReadonlySet<string>; onToggle: (s: ScheduleStream) => void; favorites?: ReadonlySet<string>; rowLimit: number; locale: string }) {
    const { t } = useTranslation('schedule');
    const [expanded, setExpanded] = useState(false);
    const ordered = useMemo(() => {
        if (!favorites || favorites.size === 0) return items;
        // stable：收藏的先、其餘照原本時間順序
        return [...items.filter((s) => favorites.has(s.vtuber_id)), ...items.filter((s) => !favorites.has(s.vtuber_id))];
    }, [items, favorites]);
    const shown = expanded ? ordered : ordered.slice(0, rowLimit);
    const hidden = ordered.length - shown.length;
    return (
        <section className="border-t border-border/60 py-3 first:border-t-0">
            <h3 className={cn('mb-2 text-[13px] font-bold', band === 'now' ? 'text-[#ff4d6a]' : 'text-foreground')}>{t(`bands.${band}`)}</h3>
            <ul className="flex flex-wrap gap-x-1.5 gap-y-1">
                {shown.map((s) => {
                    const ch = channels[s.vtuber_id];
                    const name = ch?.name ?? s.vtuber_id;
                    const startIso = s.scheduled_start ?? s.actual_start ?? '';
                    const time = s.time_tbd ? t('card.timeTbd') : startIso ? formatClock(startIso, locale) : '';
                    const checked = selected.has(streamKey(s));
                    const live = s.status === 'live';
                    return (
                        <li key={streamKey(s)}>
                            <label
                                title={`${name} · ${time}`}
                                className={cn(
                                    'flex w-[72px] cursor-pointer flex-col items-center gap-1 rounded-lg px-0.5 py-1.5 transition-colors hover:bg-foreground/[0.05]',
                                    checked && 'bg-primary/10',
                                )}
                            >
                                <span className="relative block size-11">
                                    {ch?.avatar ? (
                                        <img src={ch.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" className={cn('size-11 rounded-full bg-muted object-cover', checked && 'ring-2 ring-primary ring-offset-2 ring-offset-background', live && !checked && 'ring-2 ring-[#e5173f] ring-offset-2 ring-offset-background')} />
                                    ) : (
                                        <span className={cn('block size-11 rounded-full bg-muted', checked && 'ring-2 ring-primary ring-offset-2 ring-offset-background')} aria-hidden="true" />
                                    )}
                                    <span className={cn('absolute -bottom-px -right-px size-3 rounded-full border-2 border-background', s.platform === 'youtube' ? 'bg-[#ff3b3b]' : 'bg-[#a970ff]')} aria-hidden="true" />
                                    <input type="checkbox" checked={checked} onChange={() => onToggle(s)} aria-label={t('bands.pick', { name })} className="absolute inset-0 size-full cursor-pointer opacity-0" />
                                </span>
                                <span className="w-full truncate text-center text-[11px] font-semibold leading-tight text-foreground">{name}</span>
                                <span className="-mt-0.5 text-[10px] tabular-nums text-muted-foreground">{time}</span>
                            </label>
                        </li>
                    );
                })}
                {hidden > 0 && (
                    <li>
                        <button
                            type="button"
                            onClick={() => setExpanded(true)}
                            aria-label={t('bands.expand', { count: hidden })}
                            className="flex h-[84px] w-[72px] flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border text-[13px] font-bold text-foreground/80 transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            +{hidden}
                            <span className="text-[10px] font-medium text-muted-foreground">{t('bands.expandShort')}</span>
                        </button>
                    </li>
                )}
            </ul>
        </section>
    );
}

export function DayBands({ streams, channels, now, selected, onToggle, favorites, rowLimit = DEFAULT_ROW_LIMIT }: DayBandsProps) {
    const { i18n } = useTranslation('schedule');
    const locale = i18n.language || 'zh-TW';
    const groups = useMemo(() => groupByBand(streams, now), [streams, now]);
    return (
        <div className="rounded-2xl border border-border bg-card px-4 py-1">
            {groups.map((g) => (
                <BandSection key={g.band} band={g.band} items={g.items} channels={channels} selected={selected} onToggle={onToggle} favorites={favorites} rowLimit={rowLimit} locale={locale} />
            ))}
        </div>
    );
}
