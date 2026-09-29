// 週表的三種場次呈現（對應 PRODUCT.md「現在最大聲、即將次之、剛結束最安靜」）：
//   - LiveTile：直播中，16:9 縮圖＋觀看數（Twitch 追隨中頁面的密度）
//   - SlotRow：時間軸上的一場，頭像＋時間＋名字＋標題（timeline.oshi.tw 的掃讀方式）
//   - RecentRow：剛結束，一行頭像＋名字＋相對時間，不能勾選
// 勾選框永遠看得到（觸控裝置沒有 hover），但只在選取時用主色。

import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '../../components/ui/utils';
import { formatClock, formatRelative } from './formatTime';
import { thumbnailUrl, watchUrl } from './streamLinks';
import type { ScheduleChannel, ScheduleStream } from './types';

interface SelectableProps {
    stream: ScheduleStream;
    channel: ScheduleChannel | undefined;
    now: number;
    selected: boolean;
    onToggle: (stream: ScheduleStream) => void;
}

const PLATFORM_DOT: Record<string, string> = {
    youtube: 'bg-[#ff3b3b]',
    twitch: 'bg-[#a970ff]',
};

function Avatar({ channel, size, platform }: { channel: ScheduleChannel | undefined; size: 'sm' | 'md'; platform: string }) {
    const box = size === 'sm' ? 'size-7' : 'size-10';
    return (
        <span className={cn('relative shrink-0', box)}>
            {channel?.avatar ? (
                <img src={channel.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" className={cn('rounded-full bg-muted object-cover', box)} />
            ) : (
                <span className={cn('block rounded-full bg-muted', box)} aria-hidden="true" />
            )}
            {/* 平台小圓點：顏色之外，旁邊的文字標籤也寫了平台（不只靠顏色） */}
            <span className={cn('absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-background', PLATFORM_DOT[platform])} aria-hidden="true" />
        </span>
    );
}

/** 原生 checkbox 外觀的選取鈕：大點擊區、鍵盤可操作 */
function SelectToggle({ selected, label, onToggle, className, overlay = false }: { selected: boolean; label: string; onToggle: () => void; className?: string; overlay?: boolean }) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label={label}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggle();
            }}
            className={cn(
                'grid size-6 shrink-0 place-items-center rounded-md border transition-[background-color,border-color,transform] duration-150 ease-out active:scale-90',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : overlay
                      ? 'border-white/85 bg-black/30 text-transparent hover:bg-black/50'
                      : 'border-foreground/25 bg-background/80 text-transparent hover:border-foreground/60',
                className,
            )}
        >
            <Check size={14} strokeWidth={3} aria-hidden="true" />
        </button>
    );
}

export function LiveTile({ stream, channel, now, selected, onToggle }: SelectableProps) {
    const { t, i18n } = useTranslation('schedule');
    const locale = i18n.language || 'zh-TW';
    const name = channel?.name ?? stream.vtuber_id;
    const href = watchUrl(stream, channel);
    const thumb = thumbnailUrl(stream, channel);
    const platformLabel = t(stream.platform === 'youtube' ? 'platform.youtube' : 'platform.twitch');

    return (
        <article className={cn('group relative min-w-0', selected && 'is-selected')}>
            <a
                href={href ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                    'relative block aspect-video overflow-hidden rounded-lg bg-muted outline-offset-2 transition-shadow duration-200',
                    selected ? 'ring-2 ring-primary' : 'ring-1 ring-foreground/10 group-hover:ring-foreground/30',
                )}
                aria-label={t('card.openOriginal', { platform: platformLabel })}
            >
                {thumb && (
                    <img
                        src={thumb}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                )}
                <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded bg-[#e5173f] px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
                    <span className="size-1.5 rounded-full bg-white" aria-hidden="true" />
                    LIVE
                </span>
                {stream.viewer_count != null && (
                    <span className="absolute bottom-2 left-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                        {t('card.viewers', { count: stream.viewer_count })}
                    </span>
                )}
            </a>
            <SelectToggle selected={selected} label={t('card.select', { name })} onToggle={() => onToggle(stream)} overlay className="absolute right-2 top-2" />
            <div className="mt-2 flex gap-2.5">
                <Avatar channel={channel} size="md" platform={stream.platform} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{name}</div>
                    <div className="truncate text-[13px] text-muted-foreground" title={stream.title}>{stream.title || t('card.untitled')}</div>
                    <div className="truncate text-xs text-muted-foreground">
                        {platformLabel}
                        {stream.category ? ` · ${stream.category}` : ''}
                        {stream.actual_start ? ` · ${t('card.startedAt', { time: formatRelative(stream.actual_start, now, locale) })}` : ''}
                    </div>
                </div>
            </div>
        </article>
    );
}

export function SlotRow({ stream, channel, now, selected, onToggle }: SelectableProps) {
    const { t, i18n } = useTranslation('schedule');
    const locale = i18n.language || 'zh-TW';
    const name = channel?.name ?? stream.vtuber_id;
    const href = watchUrl(stream, channel);
    const platformLabel = t(stream.platform === 'youtube' ? 'platform.youtube' : 'platform.twitch');
    const overdue = !!stream.scheduled_start && Date.parse(stream.scheduled_start) < now;

    return (
        <li
            className={cn(
                'group relative flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors duration-150',
                selected ? 'bg-primary/12 ring-1 ring-primary/60' : 'hover:bg-foreground/[0.04]',
            )}
        >
            <SelectToggle selected={selected} label={t('card.select', { name })} onToggle={() => onToggle(stream)} />
            <a href={href ?? undefined} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-3 rounded-md outline-offset-2">
                <Avatar channel={channel} size="md" platform={stream.platform} />
                <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatClock(stream.scheduled_start, locale)}</span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">{name}</span>
                        {channel?.group && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{channel.group}</span>}
                    </span>
                    <span className="block truncate text-[13px] text-muted-foreground" title={stream.title}>{stream.title || t('card.untitled')}</span>
                </span>
                {/* 平台已由頭像上的小圓點＋螢幕閱讀器標籤表達；右側只在過了預定時間時提醒 */}
                <span className="sr-only">{platformLabel}</span>
                {overdue && <span className="hidden shrink-0 text-xs font-medium text-amber-500 md:inline">{t('timeline.overdue')}</span>}
            </a>
        </li>
    );
}

export function RecentRow({ stream, channel, now }: Omit<SelectableProps, 'selected' | 'onToggle'>) {
    const { t, i18n } = useTranslation('schedule');
    const locale = i18n.language || 'zh-TW';
    const name = channel?.name ?? stream.vtuber_id;
    const href = watchUrl(stream, channel);
    return (
        <li className="min-w-0">
            <a
                href={href ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-foreground/[0.04]"
                title={stream.title}
            >
                <Avatar channel={channel} size="sm" platform={stream.platform} />
                <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-foreground">{name}</span>
                    <span className="text-muted-foreground"> · {stream.title || t('card.untitled')}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatRelative(stream.actual_end, now, locale)}</span>
            </a>
        </li>
    );
}
