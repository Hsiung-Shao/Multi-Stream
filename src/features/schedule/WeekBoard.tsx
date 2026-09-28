// 「即將開台」的 7 日看板：桌機 7 欄（每欄一天），窄螢幕自動變成依日分段的清單。
// 每天內再依「整點」分組，組標題提供「選取這個時段」。

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../components/ui/utils';
import { groupByDay, localDayKey } from './filters';
import { formatClock, formatDayHeading } from './formatTime';
import { ScheduleCard } from './ScheduleCard';
import { streamKey, type ScheduleChannel, type ScheduleStream } from './types';

interface WeekBoardProps {
    streams: ScheduleStream[];
    channels: Record<string, ScheduleChannel>;
    now: number;
    selected: ReadonlySet<string>;
    onToggle: (s: ScheduleStream) => void;
    onSelectMany: (list: ScheduleStream[]) => void;
}

function hourGroups(streams: ScheduleStream[]): { hourIso: string; items: ScheduleStream[] }[] {
    const out: { hourIso: string; items: ScheduleStream[] }[] = [];
    for (const s of streams) {
        const d = new Date(s.scheduled_start ?? 0);
        d.setMinutes(0, 0, 0); // 本地時區的整點
        const hourIso = d.toISOString();
        const last = out[out.length - 1];
        if (last && last.hourIso === hourIso) last.items.push(s);
        else out.push({ hourIso, items: [s] });
    }
    return out;
}

export function WeekBoard({ streams, channels, now, selected, onToggle, onSelectMany }: WeekBoardProps) {
    const { t, i18n } = useTranslation('schedule');
    const locale = i18n.language || 'zh-TW';
    const days = useMemo(() => groupByDay(streams, now), [streams, now]);
    const today = localDayKey(new Date(now).toISOString());

    return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {days.map((day) => (
                <section key={day.dayKey} aria-label={formatDayHeading(day.dayKey, locale)} className="flex min-w-0 flex-col rounded-xl border border-border bg-muted/30">
                    <header className={cn('flex items-baseline justify-between gap-2 border-b border-border px-3 py-2', day.dayKey === today && 'text-primary')}>
                        <h3 className="text-sm font-semibold">
                            {day.dayKey === today ? `${t('board.today')} · ` : ''}
                            {formatDayHeading(day.dayKey, locale)}
                        </h3>
                        <span className="text-xs tabular-nums text-muted-foreground">{day.streams.length}</span>
                    </header>
                    {day.streams.length === 0 ? (
                        <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('board.none')}</p>
                    ) : (
                        <div className="flex flex-col gap-3 p-2">
                            {hourGroups(day.streams).map((g) => {
                                const allSelected = g.items.every((s) => selected.has(streamKey(s)));
                                return (
                                    <div key={g.hourIso}>
                                        <div className="mb-1 flex items-center justify-between px-1">
                                            <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{formatClock(g.hourIso, locale)}</span>
                                            {g.items.length > 1 && !allSelected && (
                                                <button
                                                    type="button"
                                                    onClick={() => onSelectMany(g.items)}
                                                    className="text-[11px] font-medium text-primary hover:underline"
                                                >
                                                    {t('selection.selectHour')}
                                                </button>
                                            )}
                                        </div>
                                        <ul className="flex flex-col gap-1.5">
                                            {g.items.map((s) => (
                                                <ScheduleCard
                                                    key={streamKey(s)}
                                                    stream={s}
                                                    channel={channels[s.vtuber_id]}
                                                    tab="upcoming"
                                                    now={now}
                                                    selectable
                                                    selected={selected.has(streamKey(s))}
                                                    onToggle={onToggle}
                                                    variant="compact"
                                                />
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            ))}
        </div>
    );
}
