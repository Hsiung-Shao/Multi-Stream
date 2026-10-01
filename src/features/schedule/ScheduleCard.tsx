// 週表的三種場次呈現（對應 PRODUCT.md「現在最大聲、即將次之、剛結束最安靜」）：
//   - LiveTile：直播中，16:9 縮圖＋觀看數（Twitch 追隨中頁面的密度）
//   - SlotRow：時間軸上的一場，頭像＋時間＋名字＋標題（timeline.oshi.tw 的掃讀方式）
//   - RecentRow：剛結束，一行頭像＋名字＋相對時間，不能勾選
// 勾選框永遠看得到（觸控裝置沒有 hover），但只在選取時用主色。
//
// 點擊（2026-09-29 使用者裁定）：整張卡／整列＝在我們的畫布觀看（ScheduleCardActions.watch），不再跳原平台；
// 原平台改成一個小圖示連結。名字連到個人週表頁、勾選框、愛心（收藏）、原平台圖示都用 relative z-10 浮在
// 整列按鈕（stretched button：::after 蓋滿整列）之上，避免互動元素巢狀。個人頁本身傳 personLinks={false}。

import { createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ExternalLink, Flag, Heart, Loader2 } from 'lucide-react';
import { cn } from '../../components/ui/utils';
import { RouteLink } from '../../components/Navigation/RouteLink';
import { schedulePersonPage } from '../../config/schedulePerson';
import { formatClock, formatRelative } from './formatTime';
import { streamKey, type ScheduleChannel, type ScheduleStream } from './types';
import { thumbnailUrl, watchUrl } from './streamLinks';
import { useReportDialog } from '../report/ReportDialogProvider';

/** 卡片上的動作：由 ScheduleBoard／個人頁提供（useWatchOnCanvas＋useFavoriteChannel） */
export interface ScheduleCardActions {
    watch: (stream: ScheduleStream, channel: ScheduleChannel | undefined) => void;
    /** 正在加入畫布的那一場（streamKey），顯示讀取中並擋連點 */
    busyKey: string | null;
    isFavorite: (channel: ScheduleChannel | undefined) => boolean;
    toggleFavorite: (channel: ScheduleChannel | undefined) => void;
    /** 「所屬」目前選的公司（沒選特定公司為 null）：合作藝人在這家的篩選下標「合作」 */
    focusAgency?: string | null;
}

export const ScheduleCardActionsContext = createContext<ScheduleCardActions | null>(null);

function useCardActions(): ScheduleCardActions | null {
    return useContext(ScheduleCardActionsContext);
}

interface SelectableProps {
    stream: ScheduleStream;
    channel: ScheduleChannel | undefined;
    now: number;
    selected: boolean;
    onToggle: (stream: ScheduleStream) => void;
    /** 名字是否連到個人週表頁（個人頁本身關掉） */
    personLinks?: boolean;
}

/** stretched button：按鈕的 ::after 蓋滿整列（列本身要 relative），focus ring 畫在 ::after 上 */
function stretchClasses(rounded: 'rounded-xl' | 'rounded-lg'): string {
    return cn(
        'after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring',
        rounded === 'rounded-xl' ? 'after:rounded-xl' : 'after:rounded-lg',
    );
}

/** 沒有標題（常見於 Twitch 週表段）時退回遊戲分類 */
function displayTitle(stream: ScheduleStream, untitled: string): string {
    return stream.title || stream.category || untitled;
}

/** 名字：有 slug 且允許時連到個人週表頁 */
function PersonName({ channel, name, personLinks, className }: { channel: ScheduleChannel | undefined; name: string; personLinks: boolean; className?: string }) {
    if (personLinks && channel?.slug) {
        return (
            <RouteLink
                to={schedulePersonPage(channel.slug)}
                className={cn('relative z-10 rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
            >
                {name}
            </RouteLink>
        );
    }
    return <span className={className}>{name}</span>;
}

/** 「週表預告」與「也在 Twitch」等小標籤：文字表達，不只靠顏色 */
function StreamBadges({ stream }: { stream: ScheduleStream }) {
    const { t } = useTranslation('schedule');
    const fromSchedule = stream.source === 'twitch_schedule';
    // 同平台的併入（Twitch 週表預告已變成 Twitch 直播）不是「另一個平台」，不顯示；
    // 同一個平台併入兩筆（Twitch 直播＋Twitch 週表）只顯示一個標籤
    const also = [...new Map((stream.also ?? []).filter((a) => a.platform !== stream.platform).map((a) => [a.platform, a])).values()];
    if (!fromSchedule && also.length === 0) return null;
    return (
        <>
            {fromSchedule && (
                <span title={t('card.fromScheduleHint')} className="relative z-10 shrink-0 rounded border border-border px-1.5 text-[11px] font-medium leading-[18px] text-muted-foreground">
                    {t('card.fromSchedule')}
                </span>
            )}
            {also.map((a) => (
                <span
                    key={`${a.platform}:${a.external_id}`}
                    className={cn(
                        'shrink-0 rounded px-1.5 text-[11px] font-medium leading-[18px]',
                        a.platform === 'twitch' ? 'bg-[#a970ff]/15 text-[#6d28d9] dark:text-[#c4a5ff]' : 'bg-[#ff3b3b]/12 text-[#b91c1c] dark:text-[#ff8a8a]',
                    )}
                >
                    {t('card.alsoOn', { platform: t(a.platform === 'youtube' ? 'platform.youtube' : 'platform.twitch') })}
                </span>
            ))}
        </>
    );
}

/**
 * 卡片上的團體標示（Twitch 與 YouTube 共用同一位實況主的團體）：
 * 正在篩選的公司是這位實況主的合作公司 →「公司・合作」；否則正式所屬的團名；沒有所屬但有合作 →「第一家合作公司・合作」。
 */
function useGroupLabel(channel: ScheduleChannel | undefined): { text: string; title: string } | null {
    const { t } = useTranslation('schedule');
    const focus = useCardActions()?.focusAgency ?? null;
    if (!channel) return null;
    const collabs = channel.collabs ?? [];
    const collabText = (agency: string) => t('card.collab', { agency });
    const title = [channel.group, ...collabs.map(collabText)].filter(Boolean).join('、');
    if (focus && collabs.includes(focus)) return { text: collabText(focus), title };
    if (channel.group) return { text: channel.group, title };
    if (collabs.length) return { text: collabText(collabs[0]), title };
    return null;
}

function GroupTag({ channel, className }: { channel: ScheduleChannel | undefined; className?: string }) {
    const label = useGroupLabel(channel);
    if (!label) return null;
    return <span className={cn('min-w-0 truncate text-xs text-muted-foreground', className)} title={label.title}>{label.text}</span>;
}

/** 手機列：團名放在標題前面 */
function GroupPrefix({ channel }: { channel: ScheduleChannel | undefined }) {
    const label = useGroupLabel(channel);
    return label ? <span className="sm:hidden">{label.text} · </span> : null;
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

/** 收藏切換（頻道）；aria-pressed 表示是否已收藏 */
function FavoriteButton({ channel, size = 'md', className }: { channel: ScheduleChannel | undefined; size?: 'sm' | 'md'; className?: string }) {
    const { t } = useTranslation('schedule');
    const actions = useCardActions();
    if (!actions || !channel || (!channel.youtube && !channel.twitch)) return null;
    const on = actions.isFavorite(channel);
    const label = t(on ? 'favorite.remove' : 'favorite.add', { name: channel.name });
    return (
        <button
            type="button"
            aria-pressed={on}
            aria-label={label}
            title={label}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                actions.toggleFavorite(channel);
            }}
            className={cn(
                'relative z-10 grid shrink-0 place-items-center rounded-full transition-[color,background-color,transform] duration-150 ease-out active:scale-90',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                size === 'sm' ? 'size-8' : 'size-9',
                on ? 'text-[#e5173f] hover:bg-[#e5173f]/10' : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground',
                className,
            )}
        >
            <Heart size={size === 'sm' ? 15 : 17} fill={on ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
    );
}

/** 在原平台開啟的小圖示（外部連結） */
function OriginalLink({ href, platformLabel, className }: { href: string | null; platformLabel: string; className?: string }) {
    const { t } = useTranslation('schedule');
    if (!href) return null;
    const label = t('card.openOriginal', { platform: platformLabel });
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            title={label}
            onClick={(e) => e.stopPropagation()}
            className={cn(
                'relative z-10 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-150',
                'hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                className,
            )}
        >
            <ExternalLink size={14} aria-hidden="true" />
        </a>
    );
}

/** 回報這場直播（時間不對、已取消、重複）；頁面沒有 ReportDialogProvider 時不顯示 */
function ReportStreamButton({ stream, name, className }: { stream: ScheduleStream; name: string; className?: string }) {
    const { t } = useTranslation('schedule');
    const report = useReportDialog();
    if (!report) return null;
    // 一頁有很多張卡：螢幕閱讀器要聽得出是哪一場
    const label = t('report.streamButtonFor', { name });
    return (
        <button
            type="button"
            aria-label={label}
            title={t('report.streamButton')}
            onClick={(e) => {
                e.stopPropagation();
                report.openReport({ kind: 'stream', vtuberId: stream.vtuber_id, platform: stream.platform, externalId: stream.external_id, title: stream.title });
            }}
            className={cn(
                'relative z-10 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors duration-150',
                'hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                className,
            )}
        >
            <Flag size={13} aria-hidden="true" />
        </button>
    );
}

export function LiveTile({ stream, channel, now, selected, onToggle, personLinks = true }: SelectableProps) {
    const { t, i18n } = useTranslation('schedule');
    const actions = useCardActions();
    const locale = i18n.language || 'zh-TW';
    const name = channel?.name ?? stream.vtuber_id;
    const href = watchUrl(stream, channel);
    const thumb = thumbnailUrl(stream, channel);
    const platformLabel = t(stream.platform === 'youtube' ? 'platform.youtube' : 'platform.twitch');
    const busy = actions?.busyKey === streamKey(stream);

    const thumbInner = (
        <>
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
            {busy && (
                <span className="absolute inset-0 grid place-items-center bg-black/40" aria-hidden="true">
                    <Loader2 size={22} className="animate-spin text-white" />
                </span>
            )}
        </>
    );
    const thumbClass = cn(
        'relative block aspect-video w-full overflow-hidden rounded-lg bg-muted outline-offset-2 transition-shadow duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'ring-2 ring-primary' : 'ring-1 ring-foreground/10 group-hover:ring-foreground/30',
    );

    return (
        <article className={cn('group relative min-w-0', selected && 'is-selected')}>
            {actions ? (
                <button type="button" onClick={() => actions.watch(stream, channel)} aria-busy={busy} aria-label={t('card.watch', { name })} className={thumbClass}>
                    {thumbInner}
                </button>
            ) : (
                <a href={href ?? undefined} target="_blank" rel="noopener noreferrer" className={thumbClass} aria-label={t('card.openOriginal', { platform: platformLabel })}>
                    {thumbInner}
                </a>
            )}
            <SelectToggle selected={selected} label={t('card.select', { name })} onToggle={() => onToggle(stream)} overlay className="absolute right-2 top-2" />
            <div className="mt-2 flex gap-2.5">
                <Avatar channel={channel} size="md" platform={stream.platform} />
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                        <PersonName channel={channel} name={name} personLinks={personLinks} className="truncate text-sm font-semibold text-foreground" />
                        {personLinks && <GroupTag channel={channel} className="max-w-[50%] shrink-[2]" />}
                        <StreamBadges stream={stream} />
                    </div>
                    <div className="truncate text-[13px] text-muted-foreground" title={stream.title}>{displayTitle(stream, t('card.untitled'))}</div>
                    <div className="truncate text-xs text-muted-foreground">
                        {platformLabel}
                        {stream.category ? ` · ${stream.category}` : ''}
                        {stream.actual_start ? ` · ${t('card.startedAt', { time: formatRelative(stream.actual_start, now, locale) })}` : ''}
                    </div>
                </div>
                {actions && (
                    <div className="-mr-1 flex shrink-0 flex-col items-center">
                        <FavoriteButton channel={channel} />
                        <OriginalLink href={href} platformLabel={platformLabel} />
                        <ReportStreamButton stream={stream} name={name} />
                    </div>
                )}
            </div>
        </article>
    );
}

/** 整列的主要動作：有 actions 時是「在畫布觀看」按鈕，沒有時退回原平台連結 */
function RowMain({ stream, channel, className, rounded, children }: { stream: ScheduleStream; channel: ScheduleChannel | undefined; className: string; rounded: 'rounded-xl' | 'rounded-lg'; children: React.ReactNode }) {
    const { t } = useTranslation('schedule');
    const actions = useCardActions();
    const href = watchUrl(stream, channel);
    const name = channel?.name ?? stream.vtuber_id;
    if (actions) {
        const busy = actions.busyKey === streamKey(stream);
        return (
            <button
                type="button"
                onClick={() => actions.watch(stream, channel)}
                aria-busy={busy}
                title={stream.title}
                className={cn('min-w-0 text-left', className, stretchClasses(rounded))}
            >
                {children}
                <span className="sr-only"> · {t('card.watch', { name })}</span>
            </button>
        );
    }
    return (
        <a href={href ?? undefined} target="_blank" rel="noopener noreferrer" title={stream.title} className={cn(className, href ? stretchClasses(rounded) : 'outline-none')}>
            {children}
        </a>
    );
}

export function SlotRow({ stream, channel, now, selected, onToggle, personLinks = true }: SelectableProps) {
    const { t, i18n } = useTranslation('schedule');
    const actions = useCardActions();
    const locale = i18n.language || 'zh-TW';
    const name = channel?.name ?? stream.vtuber_id;
    const href = watchUrl(stream, channel);
    const platformLabel = t(stream.platform === 'youtube' ? 'platform.youtube' : 'platform.twitch');
    const overdue = !!stream.scheduled_start && Date.parse(stream.scheduled_start) < now;
    const busy = actions?.busyKey === streamKey(stream);

    return (
        <li
            className={cn(
                'group relative flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors duration-150',
                selected ? 'bg-primary/12 ring-1 ring-primary/60' : 'hover:bg-foreground/[0.04]',
            )}
        >
            <SelectToggle selected={selected} label={t('card.select', { name })} onToggle={() => onToggle(stream)} className="relative z-10" />
            <Avatar channel={channel} size="md" platform={stream.platform} />
            <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatClock(stream.scheduled_start, locale)}</span>
            <span className="min-w-0 flex-1">
                {personLinks ? (
                    <>
                        <span className="flex min-w-0 items-center gap-1.5">
                            <PersonName channel={channel} name={name} personLinks className="truncate text-sm font-semibold text-foreground" />
                            <GroupTag channel={channel} className="hidden sm:inline" />
                            {/* 手機列寬有限：標籤收起，名字優先 */}
                            <span className="hidden sm:contents"><StreamBadges stream={stream} /></span>
                        </span>
                        <RowMain stream={stream} channel={channel} rounded="rounded-xl" className="block w-full truncate text-[13px] text-muted-foreground">
                            {/* 手機名字列放不下團名：改放在標題前面 */}
                            <GroupPrefix channel={channel} />
                            {displayTitle(stream, t('card.untitled'))}
                        </RowMain>
                    </>
                ) : (
                    // 個人頁：每列都是同一個人，名字不重複；標題當主行、平台與分類當副行
                    <>
                        <span className="flex min-w-0 items-center gap-1.5">
                            <RowMain stream={stream} channel={channel} rounded="rounded-xl" className="truncate text-sm font-semibold text-foreground">
                                {displayTitle(stream, t('card.untitled'))}
                            </RowMain>
                            <StreamBadges stream={stream} />
                        </span>
                        <span className="block truncate text-[13px] text-muted-foreground">
                            {platformLabel}
                            {stream.category && stream.title ? ` · ${stream.category}` : ''}
                        </span>
                    </>
                )}
            </span>
            {busy && <Loader2 size={16} className="shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />}
            {overdue && <span className="hidden shrink-0 text-xs font-medium text-amber-500 md:inline">{t('timeline.overdue')}</span>}
            {actions && (
                <span className="flex shrink-0 items-center">
                    {personLinks && <FavoriteButton channel={channel} size="sm" />}
                    {/* 手機列寬有限，原平台圖示收起（直播中卡片與個人頁頭部仍有） */}
                    <OriginalLink href={href} platformLabel={platformLabel} className="hidden sm:grid" />
                    <ReportStreamButton stream={stream} name={name} className="hidden sm:grid" />
                </span>
            )}
        </li>
    );
}

export function RecentRow({ stream, channel, now, personLinks = true }: Omit<SelectableProps, 'selected' | 'onToggle'>) {
    const { t, i18n } = useTranslation('schedule');
    const actions = useCardActions();
    const locale = i18n.language || 'zh-TW';
    const name = channel?.name ?? stream.vtuber_id;
    const href = watchUrl(stream, channel);
    const platformLabel = t(stream.platform === 'youtube' ? 'platform.youtube' : 'platform.twitch');
    return (
        <li className="relative flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1 text-sm transition-colors duration-150 hover:bg-foreground/[0.04]">
            <Avatar channel={channel} size="sm" platform={stream.platform} />
            <span className="flex min-w-0 flex-1 items-baseline gap-1">
                {personLinks && (
                    <>
                        <PersonName channel={channel} name={name} personLinks className="max-w-[45%] shrink-0 truncate font-medium text-foreground" />
                        <GroupTag channel={channel} className="max-w-[30%] shrink-0" />
                        <span className="shrink-0 text-muted-foreground" aria-hidden="true">·</span>
                    </>
                )}
                <RowMain stream={stream} channel={channel} rounded="rounded-lg" className="min-w-0 flex-1 truncate text-muted-foreground">
                    {displayTitle(stream, t('card.untitled'))}
                </RowMain>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatRelative(stream.actual_end, now, locale)}</span>
            {actions && (
                <span className="flex shrink-0 items-center">
                    {personLinks && <FavoriteButton channel={channel} size="sm" />}
                    {/* 手機列寬有限，原平台圖示收起（直播中卡片與個人頁頭部仍有） */}
                    <OriginalLink href={href} platformLabel={platformLabel} className="hidden sm:grid" />
                </span>
            )}
        </li>
    );
}
