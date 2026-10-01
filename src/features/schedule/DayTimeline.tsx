// 「接下來」：一次看一天的時間軸（EPG／timeline.oshi.tw 的讀法）。
// 上方 7 天切換列（每天附場次數），下方左側整點刻度、右側該小時的場次；今天會插一條「現在」線。

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../components/ui/utils';
import { groupByDay, groupByHour, localDayKey, nowDividerIndex, pickDefaultDay } from './filters';
import { formatClock } from './formatTime';
import { SlotRow } from './ScheduleCard';
import { streamKey, type ScheduleChannel, type ScheduleStream } from './types';

interface DayTimelineProps {
    streams: ScheduleStream[];
    channels: Record<string, ScheduleChannel>;
    now: number;
    selected: ReadonlySet<string>;
    onToggle: (s: ScheduleStream) => void;
    onSelectMany: (list: ScheduleStream[]) => void;
    onDayChange?: (dayKey: string) => void;
    /** 名字是否連到個人週表頁（個人頁本身關掉） */
    personLinks?: boolean;
}

function dayLabel(dayKey: string, locale: string): { weekday: string; date: string } {
    const [y, m, d] = dayKey.split('-').map(Number);
    const date = new Date(y, m - 1, d, 12);
    return {
        weekday: new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date),
        date: `${m}/${d}`,
    };
}

export function DayTimeline({ streams, channels, now, selected, onToggle, onSelectMany, onDayChange, personLinks = true }: DayTimelineProps) {
    const { t, i18n } = useTranslation('schedule');
    const locale = i18n.language || 'zh-TW';
    const days = useMemo(() => groupByDay(streams, now), [streams, now]);
    const today = localDayKey(new Date(now).toISOString());
    const tomorrow = days[1]?.dayKey;
    const [day, setDay] = useState<string | null>(() => pickDefaultDay(days));

    // 資料更新或跨日後，選中的日子不在 7 天內 → 回到預設
    useEffect(() => {
        if (!day || !days.some((d) => d.dayKey === day)) setDay(pickDefaultDay(days));
    }, [days, day]);

    const current = days.find((d) => d.dayKey === day) ?? days[0];
    const hours = useMemo(() => groupByHour(current?.streams ?? []), [current]);
    // 今天才畫「現在」線（-1＝不畫）；hours.length＝全部都在現在之前，線畫在最後
    const divider = current?.dayKey === today ? nowDividerIndex(hours, now) : -1;

    const nowLine = (
        <div className="my-2 flex items-center gap-3" aria-label={t('timeline.now')}>
            <span className="w-14 shrink-0 text-right text-xs font-bold tabular-nums text-[#ff4d6a] sm:w-16">{formatClock(new Date(now).toISOString(), locale)}</span>
            <span className="relative h-px flex-1 bg-[#ff4d6a]/70" aria-hidden="true">
                <span className="absolute -left-1 -top-1 size-2 rounded-full bg-[#ff4d6a]" />
            </span>
            <span className="shrink-0 text-xs font-bold text-[#ff4d6a]">{t('timeline.now')}</span>
        </div>
    );

    const selectDay = (key: string) => {
        setDay(key);
        onDayChange?.(key);
    };

    return (
        <div>
            <div role="tablist" aria-label={t('section.upcoming')} className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
                {days.map((d) => {
                    const { weekday, date } = dayLabel(d.dayKey, locale);
                    const active = d.dayKey === current?.dayKey;
                    const name = d.dayKey === today ? t('day.today') : d.dayKey === tomorrow ? t('day.tomorrow') : weekday;
                    return (
                        <button
                            key={d.dayKey}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => selectDay(d.dayKey)}
                            className={cn(
                                'flex min-w-[4.75rem] shrink-0 flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors duration-150',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                active ? 'border-foreground bg-foreground text-background' : 'border-border hover:border-foreground/40',
                            )}
                        >
                            <span className="text-[13px] font-semibold leading-tight">{name}</span>
                            <span className={cn('text-xs tabular-nums', active ? 'text-background/70' : 'text-muted-foreground')}>
                                {date} · {t('day.count', { count: d.streams.length })}
                            </span>
                        </button>
                    );
                })}
            </div>

            {hours.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">{t('day.none')}</p>
            ) : (
                <ol className="relative">
                    {hours.map((h, i) => {
                        const keys = h.streams.map(streamKey);
                        const allSelected = keys.every((k) => selected.has(k));
                        const past = divider >= 0 && i < divider;
                        // 寬限內跨午夜留下的昨天場次：整點標「昨天」，免得「23:00」被看成今晚
                        // （只看「早於這一天」：超過 7 天併進最後一天的場次不是昨天）
                        const otherDay = current ? localDayKey(h.hourIso) < current.dayKey : false;
                        return (
                            <li key={h.hourIso}>
                                {i === divider && nowLine}
                                <div className={cn('flex gap-3 border-t border-border/60 py-2', past && 'opacity-60')}>
                                    <div className="w-14 shrink-0 pt-2.5 text-right sm:w-16">
                                        {otherDay && <div className="mb-1 text-[11px] font-medium leading-none text-muted-foreground">{t('day.yesterday')}</div>}
                                        <div className="text-base font-bold tabular-nums leading-none text-foreground">{formatClock(h.hourIso, locale)}</div>
                                        {h.streams.length > 1 && !allSelected && (
                                            <button
                                                type="button"
                                                onClick={() => onSelectMany(h.streams)}
                                                className="mt-1.5 text-[11px] font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none"
                                            >
                                                {t('selection.selectHourShort', { count: h.streams.length })}
                                            </button>
                                        )}
                                    </div>
                                    <ul className="grid min-w-0 flex-1 grid-cols-1 gap-1 lg:grid-cols-2">
                                        {h.streams.map((s) => (
                                            <SlotRow
                                                key={streamKey(s)}
                                                stream={s}
                                                channel={channels[s.vtuber_id]}
                                                now={now}
                                                selected={selected.has(streamKey(s))}
                                                onToggle={onToggle}
                                                personLinks={personLinks}
                                            />
                                        ))}
                                    </ul>
                                </div>
                            </li>
                        );
                    })}
                    {divider === hours.length && <li>{nowLine}</li>}
                </ol>
            )}
        </div>
    );
}
