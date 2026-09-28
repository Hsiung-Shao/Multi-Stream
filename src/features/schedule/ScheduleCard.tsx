// 週表的場次卡片。兩種尺寸：
//   - full：直播中／剛結束的格狀清單（大縮圖）
//   - compact：即將開台 7 日看板的欄內項目（小縮圖，一行時間＋名字＋標題）
// 勾選框只在 selectable 時出現（剛結束的場次不能加入畫布）。

import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { Checkbox } from '../../components/ui/checkbox';
import { cn } from '../../components/ui/utils';
import { formatClock, formatDayTime, formatRelative } from './formatTime';
import { thumbnailUrl, watchUrl } from './streamLinks';
import type { ScheduleChannel, ScheduleStream, ScheduleTab } from './types';

interface ScheduleCardProps {
    stream: ScheduleStream;
    channel: ScheduleChannel | undefined;
    tab: ScheduleTab;
    now: number;
    selectable: boolean;
    selected: boolean;
    onToggle: (stream: ScheduleStream) => void;
    variant?: 'full' | 'compact';
}

const PLATFORM_STYLE: Record<string, string> = {
    youtube: 'bg-red-600/90 text-white',
    twitch: 'bg-purple-600/90 text-white',
};

export function ScheduleCard({ stream, channel, tab, now, selectable, selected, onToggle, variant = 'full' }: ScheduleCardProps) {
    const { t, i18n } = useTranslation('schedule');
    const locale = i18n.language || 'zh-TW';
    const name = channel?.name ?? stream.vtuber_id;
    const href = watchUrl(stream, channel);
    const thumb = thumbnailUrl(stream, channel);
    const title = stream.title || t('card.untitled');
    const platformLabel = t(stream.platform === 'youtube' ? 'platform.youtube' : 'platform.twitch');

    const timeText =
        tab === 'live'
            ? t('card.startedAt', { time: formatRelative(stream.actual_start, now, locale) })
            : tab === 'upcoming'
              ? t('card.scheduledAt', { time: variant === 'compact' ? formatClock(stream.scheduled_start, locale) : formatDayTime(stream.scheduled_start, locale) })
              : t('card.endedAt', { time: formatRelative(stream.actual_end, now, locale) });

    const checkbox = selectable ? (
        <Checkbox
            checked={selected}
            onCheckedChange={() => onToggle(stream)}
            aria-label={t('card.select', { name })}
            className="size-5 bg-background/90 shadow-md"
        />
    ) : null;

    if (variant === 'compact') {
        return (
            <li
                className={cn(
                    'group relative flex gap-2 rounded-lg border border-border bg-card/60 p-2 transition-colors',
                    selected && 'border-primary bg-primary/10',
                )}
            >
                {checkbox && <div className="pt-0.5">{checkbox}</div>}
                <a
                    href={href ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 flex-1 gap-2"
                    title={`${name} — ${title}`}
                >
                    {channel?.avatar ? (
                        <img src={channel.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-8 shrink-0 rounded-full bg-muted object-cover" />
                    ) : (
                        <div className="size-8 shrink-0 rounded-full bg-muted" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-semibold tabular-nums text-foreground">{formatClock(stream.scheduled_start, locale)}</span>
                            <span className={cn('rounded px-1 text-[10px] font-semibold leading-4', PLATFORM_STYLE[stream.platform])}>{platformLabel}</span>
                        </div>
                        <div className="truncate text-sm font-medium text-foreground">{name}</div>
                        <div className="truncate text-xs text-muted-foreground">{title}</div>
                    </div>
                </a>
            </li>
        );
    }

    return (
        <article
            className={cn(
                'group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card/60 transition-colors hover:border-foreground/20',
                selected && 'border-primary ring-2 ring-primary/40',
            )}
        >
            <a href={href ?? undefined} target="_blank" rel="noopener noreferrer" aria-label={t('card.openOriginal', { platform: platformLabel })} className="relative block aspect-video bg-muted">
                {thumb && <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />}
                {tab === 'live' && (
                    <span className="absolute right-2 top-2 rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">LIVE</span>
                )}
                <span className={cn('absolute bottom-2 left-2 rounded px-1.5 py-0.5 text-[11px] font-semibold', PLATFORM_STYLE[stream.platform])}>{platformLabel}</span>
                {tab === 'live' && stream.viewer_count != null && (
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
                        <Users size={11} aria-hidden="true" />
                        {t('card.viewers', { count: stream.viewer_count })}
                    </span>
                )}
            </a>
            {checkbox && <div className="absolute left-2 top-2">{checkbox}</div>}
            <div className="flex gap-3 p-3">
                {channel?.avatar ? (
                    <img src={channel.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-9 shrink-0 rounded-full bg-muted object-cover" />
                ) : (
                    <div className="size-9 shrink-0 rounded-full bg-muted" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{title}</h3>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                        {name}
                        {channel?.group ? ` · ${channel.group}` : ''}
                        {stream.category ? ` · ${stream.category}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{timeText}</p>
                </div>
            </div>
        </article>
    );
}
