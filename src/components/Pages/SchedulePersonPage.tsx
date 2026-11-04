// 個人週表頁（/schedule/<slug>）：一位實況主的直播中、接下來 7 天、最近 90 天。
// 資料在 client 端由 TanStack Query 以 anon 身分查 PostgREST（features/schedule/personSource.ts）；
// 不預渲染（內容依人不同），edge（functions/[[path]].js）先把 title／description／canonical／robots 注入 index.html 殼，
// 這裡的 <SEO> 在資料到了之後再斷言一次（同一套文案），並補 ProfilePage＋BroadcastEvent JSON-LD。
// 版面沿用公共週表的元件（LiveTile／DayTimeline／RecentRow），名字不再連到自己。

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CalendarPlus, ChevronRight, Code2, ExternalLink, Facebook, Flag, Heart, Instagram, ListMusic, MonitorPlay, Music2, Play, RefreshCw, SearchX } from 'lucide-react';
import { StaticPageHeader } from '../StaticPageHeader';
import { RouteLink } from '../Navigation/RouteLink';
import { SiteFooter } from '../SiteFooter';
import { SEO } from '../SEO';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { usePersonSchedule } from '../../features/schedule/usePersonSchedule';
import { useScheduleSelection } from '../../features/schedule/useScheduleSelection';
import { LiveTile, RecentRow, ScheduleCardActionsContext, type ScheduleCardActions } from '../../features/schedule/ScheduleCard';
import { useWatchOnCanvas } from '../../features/schedule/useWatchOnCanvas';
import { useFavoriteChannel } from '../../features/schedule/useFavoriteChannel';
import { DayTimeline } from '../../features/schedule/DayTimeline';
import { SelectionBar } from '../../features/schedule/SelectionBar';
import { fetchPersonRelated, type PersonRelated, type SchedulePerson } from '../../features/schedule/personSource';
import { streamKey } from '../../features/schedule/types';
import { isPastScheduled } from '../../features/schedule/filters';
import { largerAvatar } from '../../features/schedule/streamLinks';
import { schedulePersonPage, schedulePersonPath } from '../../config/schedulePerson';
import { PAGE_PATHS } from '../../config/routes';
import { urlLangOf, withLang } from '../../../functions/lib/locale.js';
import { breadcrumb, graph, webPage } from '../../seo/jsonld';
import { SEO_SITE_URL } from '../../seo/defaults';
import { toHtmlLang } from '../../i18n/i18n';
import { ReportDialogProvider, useReportDialog } from '../../features/report/ReportDialogProvider';
import { ScheduleEntriesDialogProvider, useScheduleEntriesDialog } from '../../features/contribute/ScheduleEntriesDialogProvider';
import { useSongCatalog, type SongVideo } from '../../features/songs/songsSource';
import { buildVideoIndex, songsForVtuber } from '../../features/songs/lib/catalogIndex';
import { serializeSongShare } from '../../features/songs/lib/songShareLink';
import { formatTimecode } from '../../features/songs/lib/timecode';
import { EmbedScheduleDialog } from '../../features/schedule/EmbedScheduleDialog';
import { EMBED_BANNER_DISMISSED_KEY } from '../../features/schedule/embedUsage';

const RECENT_PREVIEW = 10;

function SectionTitle({ id, children, count }: { id: string; children: React.ReactNode; count?: number }) {
    return (
        <h2 id={id} className="mb-3 flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground">
            {children}
            {count != null && (
                <span className="rounded-full bg-foreground/[0.07] px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{count}</span>
            )}
        </h2>
    );
}

function channelLinks(person: SchedulePerson): { platform: 'youtube' | 'twitch'; href: string }[] {
    const out: { platform: 'youtube' | 'twitch'; href: string }[] = [];
    if (person.channel.youtube) out.push({ platform: 'youtube', href: `https://www.youtube.com/channel/${person.channel.youtube}` });
    if (person.channel.twitch) out.push({ platform: 'twitch', href: `https://www.twitch.tv/${person.channel.twitch}` });
    return out;
}

function XLogo({ size = 15 }: { size?: number }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
            <path d="M18.9 2H22l-7.5 8.6L23.3 22h-6.9l-5.4-7-6.2 7H1.7l8-9.2L1.3 2h7l4.9 6.4L18.9 2Zm-1.2 18h1.9L7.4 3.9H5.4L17.7 20Z" />
        </svg>
    );
}

/** 投稿表單收的社群連結（網址在資料庫已正規化、限定網域） */
function socialLinks(person: SchedulePerson): { key: 'x' | 'facebook' | 'instagram'; href: string; label: string }[] {
    const p = person.profile ?? {};
    const out: { key: 'x' | 'facebook' | 'instagram'; href: string; label: string }[] = [];
    if (p.x) out.push({ key: 'x', href: p.x, label: 'X' });
    if (p.facebook) out.push({ key: 'facebook', href: p.facebook, label: 'Facebook' });
    if (p.instagram) out.push({ key: 'instagram', href: p.instagram, label: 'Instagram' });
    return out;
}

function ReportPersonButton({ person }: { person: SchedulePerson }) {
    const { t } = useTranslation('schedule');
    const report = useReportDialog();
    if (!report) return null;
    return (
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => report.openReport({ kind: 'vtuber_info', vtuberId: person.id, name: person.channel.name })}>
            <Flag size={14} aria-hidden="true" />
            {t('report.button')}
        </Button>
    );
}

/** 「提供週表」：使用者手動填這位 VTuber 接下來的開台，後台審核後才上週表。variant=link 用在「接下來」的空狀態 */
function SubmitScheduleButton({ person, variant = 'button' }: { person: SchedulePerson; variant?: 'button' | 'link' }) {
    const { t } = useTranslation('schedule');
    const dialog = useScheduleEntriesDialog();
    if (!dialog) return null;
    const open = () => dialog.openScheduleEntries({ vtuberId: person.id, name: person.channel.name, hasTwitch: !!person.channel.twitch });
    if (variant === 'link') {
        return (
            <Button variant="link" size="sm" className="h-auto gap-1.5 px-0 text-sm" onClick={open}>
                <CalendarPlus size={14} aria-hidden="true" />
                {t('scheduleEntries.emptyCta')}
            </Button>
        );
    }
    return (
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={open}>
            <CalendarPlus size={14} aria-hidden="true" />
            {t('scheduleEntries.button')}
        </Button>
    );
}

/** 「嵌入到我的網站」：開產生器對話框（features/schedule/EmbedScheduleDialog） */
function EmbedScheduleButton({ slug, name, open, onOpenChange }: { slug: string; name: string; open: boolean; onOpenChange: (o: boolean) => void }) {
    const { t } = useTranslation('schedule');
    return (
        <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpenChange(true)}>
                <Code2 size={14} aria-hidden="true" />
                {t('embed.button')}
            </Button>
            {open && <EmbedScheduleDialog open={open} onOpenChange={onOpenChange} target={{ kind: 'person', slug, name }} />}
        </>
    );
}

function readDismissed(): boolean {
    try {
        return localStorage.getItem(EMBED_BANNER_DISMISSED_KEY) === '1';
    } catch {
        return false;
    }
}

/** 一次性提示：有場次的人邀請把週表放到自己的網站（不另外查統計，省一個請求）；關掉就記在 localStorage（PRESERVED_KEYS 有列） */
function EmbedPromoBanner({ show, onOpen }: { show: boolean; onOpen: () => void }) {
    const { t } = useTranslation('schedule');
    const [dismissed, setDismissed] = useState(readDismissed);
    if (!show || dismissed) return null;
    const dismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(EMBED_BANNER_DISMISSED_KEY, '1');
        } catch {
            /* 無痕或配額滿：這次關掉就好 */
        }
    };
    return (
        <div role="note" className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
            <Code2 size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
            {/* 手機：文字整行、按鈕換到下一行（否則文字被擠成窄欄） */}
            <span className="min-w-0 basis-full sm:flex-1 sm:basis-auto">{t('embed.banner.text')}</span>
            <Button variant="secondary" size="sm" onClick={onOpen}>{t('embed.banner.cta')}</Button>
            <Button variant="ghost" size="sm" onClick={dismiss} aria-label={t('embed.banner.dismiss')}>{t('embed.banner.dismiss')}</Button>
        </div>
    );
}

function PersonSeo({ person, slug }: { person: SchedulePerson; slug: string }) {
    const { t, i18n } = useTranslation('schedule');
    const inLanguage = toHtmlLang(i18n.language);
    const path = schedulePersonPath(slug);
    // 與 canonical 同語言版（/zh-TW/schedule/<slug>），Person／ProfilePage 的 @id 才不會和頁面網址矛盾
    // Person 實體不分語言（與站級實體同原則）： 固定英文網址；頁面節點（ProfilePage／Breadcrumb）才帶語言
    const entityUrl = `${SEO_SITE_URL}${path}`;
    const name = person.channel.name;
    const title = t('person.seo.title', { name });
    // 最前面放場次摘要，讓每一頁的 description 都不同、且不會被搜尋結果截掉（與 edge 的 functions/lib/schedule-person.js schedulePersonMeta 同一句）。
    // 數字和 edge 可能差一點（edge 以 count 算、排除被合併的列；這裡是載入後切分的結果），可以接受
    const description = `${t('person.seo.summary', { name, recent: person.recent.length, upcoming: person.upcoming.length })} ${t('person.seo.description', { name })}`;
    const sameAs = [...channelLinks(person).map((l) => l.href), ...socialLinks(person).map((l) => l.href)];
    // 只列有確切時間的場次；BroadcastEvent 讓搜尋引擎知道哪一場正在直播／何時開始
    // 時間未定場次的 scheduled_start 只是存放用的當天 00:00，輸出會變成不實的開始時間：沒有實際開台時間就不列
    const events = [...person.live, ...person.upcoming].filter((s) => s.actual_start || !s.time_tbd).slice(0, 10).map((s) => ({
        '@type': 'BroadcastEvent',
        name: s.title || name,
        isLiveBroadcast: true,
        startDate: s.actual_start ?? s.scheduled_start,
        url: s.platform === 'youtube' ? `https://www.youtube.com/watch?v=${s.external_id}` : person.channel.twitch ? `https://www.twitch.tv/${person.channel.twitch}` : undefined,
        eventStatus: 'https://schema.org/EventScheduled',
        performer: { '@id': `${entityUrl}#person` },
    })).filter((e) => e.startDate);

    return (
        <SEO
            title={title}
            description={description}
            path={path}
            image={person.channel.avatar ? largerAvatar(person.channel.avatar) : undefined}
            noindex={!person.indexable}
            jsonLd={graph(
                webPage({ type: 'ProfilePage', path, name: title, description, inLanguage, extra: { mainEntity: { '@id': `${entityUrl}#person` } } }),
                {
                    '@type': 'Person',
                    '@id': `${entityUrl}#person`,
                    name,
                    ...(person.channel.avatar ? { image: person.channel.avatar } : {}),
                    ...(sameAs.length ? { sameAs } : {}),
                },
                ...events,
                breadcrumb([
                    { name: 'MultiStream Hub', path: '/' },
                    { name: t('title'), path: PAGE_PATHS.schedule },
                    { name: t('person.breadcrumb.directory'), path: PAGE_PATHS.vtubers },
                    { name, path },
                ]),
            )}
        />
    );
}

function PersonHeader({ person, slug, onWatchLive, busy, favorite, onToggleFavorite, embedOpen, onEmbedOpenChange }: { person: SchedulePerson; slug: string; onWatchLive: () => void; busy: boolean; favorite: boolean; onToggleFavorite: () => void; embedOpen: boolean; onEmbedOpenChange: (o: boolean) => void }) {
    const { t } = useTranslation('schedule');
    const ch = person.channel;
    const live = person.live.length > 0;
    const iconBtn = 'inline-grid size-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
    // 設計稿「個人頁 A」：左欄資料卡——頭像、名字、所屬、簡介、主按鈕、收藏＋嵌入、社群、頻道、回報／投稿
    return (
        <header className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
            <div className="relative w-fit">
                {ch.avatar ? (
                    <img
                        src={largerAvatar(ch.avatar)}
                        alt=""
                        referrerPolicy="no-referrer"
                        className={`size-28 rounded-full bg-muted object-cover ${live ? 'ring-[3px] ring-[#e5173f] ring-offset-[3px] ring-offset-card' : 'ring-1 ring-border'}`}
                    />
                ) : (
                    <span className="block size-28 rounded-full bg-muted" aria-hidden="true" />
                )}
                {live && (
                    <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded bg-[#e5173f] px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">LIVE</span>
                )}
            </div>
            <div className="min-w-0">
                <h1 className="text-[1.625rem] font-extrabold leading-tight tracking-tight [text-wrap:balance]">{ch.name}</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    {/* 企業勢子團：公司 · 子團 · 地區（公司與團名相同時只寫一次） */}
                    {[ch.agency && ch.agency !== ch.group ? ch.agency : null, ch.group, t(`nationality.${ch.nationality}`, { defaultValue: ch.nationality })].filter(Boolean).join(' · ')}
                </p>
                {person.profile?.bio && <p className="mt-2 whitespace-pre-line break-words text-[13px] leading-relaxed text-foreground/90">{person.profile.bio}</p>}
                {ch.collabs && ch.collabs.length > 0 && (
                    <p className="mt-1 text-[13px] text-muted-foreground">{t('person.collabs', { agencies: ch.collabs.join(t('person.listSeparator')) })}</p>
                )}
            </div>
            <div className="flex flex-col gap-2">
                {live && (
                    <Button onClick={onWatchLive} disabled={busy} className="w-full gap-1.5">
                        <MonitorPlay size={16} aria-hidden="true" />
                        {t('person.watchOnCanvas')}
                    </Button>
                )}
                <div className="grid grid-cols-2 gap-2">
                    {(ch.youtube || ch.twitch) ? (
                        <Button variant={favorite ? 'secondary' : 'outline'} onClick={onToggleFavorite} aria-pressed={favorite} className="gap-1.5">
                            <Heart size={16} aria-hidden="true" className={favorite ? 'fill-[#e5173f] text-[#e5173f]' : undefined} />
                            {t(favorite ? 'favorite.saved' : 'favorite.save')}
                        </Button>
                    ) : <span aria-hidden="true" />}
                    <EmbedScheduleButton slug={slug} name={ch.name} open={embedOpen} onOpenChange={onEmbedOpenChange} />
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {channelLinks(person).map((l) => (
                    <a
                        key={l.platform}
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <span className={`size-2 rounded-full ${l.platform === 'youtube' ? 'bg-[#ff3b3b]' : 'bg-[#a970ff]'}`} aria-hidden="true" />
                        {t(l.platform === 'youtube' ? 'person.openYouTube' : 'person.openTwitch')}
                        <ExternalLink size={13} className="opacity-60" aria-hidden="true" />
                    </a>
                ))}
                {socialLinks(person).map((l) => (
                    <a key={l.key} href={l.href} target="_blank" rel="noopener noreferrer nofollow ugc" aria-label={l.label} title={l.label} className={iconBtn}>
                        {l.key === 'x' ? <XLogo /> : l.key === 'facebook' ? <Facebook size={15} aria-hidden="true" /> : <Instagram size={15} aria-hidden="true" />}
                    </a>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-1 border-t border-border pt-3">
                <ReportPersonButton person={person} />
                <SubmitScheduleButton person={person} />
            </div>
        </header>
    );
}

/** 左欄三格統計：本週場次、近 90 天、常見開台時段（台北；沒資料就不顯示那格） */
function PersonStats({ person, upcoming, live }: { person: SchedulePerson; upcoming: number; live: number }) {
    const { t } = useTranslation('schedule');
    const cells = [
        // 本週場次＝直播中＋未來 7 天排程
        { label: t('person.stats.week'), value: String(live + upcoming) },
        { label: t('person.stats.recent'), value: String(person.recent.length) },
        ...(typeof person.typicalHour === 'number' ? [{ label: t('person.stats.typicalHour'), value: `${String(person.typicalHour).padStart(2, '0')}:00` }] : []),
    ];
    return (
        <dl className={`grid gap-2 rounded-2xl border border-border bg-card px-4 py-4 text-center ${cells.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {cells.map((c) => (
                // DOM 先 dt 再 dd（螢幕閱讀器先念標籤）；視覺上數字在上
                <div key={c.label} className="flex flex-col-reverse">
                    <dt className="mt-0.5 text-[11px] text-muted-foreground">{c.label}</dt>
                    <dd className="text-[1.375rem] font-extrabold tabular-nums leading-tight">{c.value}</dd>
                </div>
            ))}
        </dl>
    );
}

/**
 * 這位實況主的歌回（已發布、有時間軸）：沒有就整段不渲染。「全部播放」整頁導到 /songs?list=…；
 * 「完整歌單」整頁導到 /songs?vtuber=<id>（歌回播放清單的 VTuber 個人頁）。
 */
function PersonSongs({ videos, vtuberId }: { videos: SongVideo[]; vtuberId: string }) {
    const { t, i18n } = useTranslation('schedule');
    const locale = i18n.language || 'zh-TW';
    // 整頁導向也要留在同一語言版（/zh-TW/songs），不然中文使用者會先落到英文版再被轉址
    const songsPath = withLang(urlLangOf(i18n.language), PAGE_PATHS.songs);
    if (videos.length === 0) return null;
    return (
        <section aria-labelledby="person-songs">
            <div className="flex flex-wrap items-start justify-between gap-x-3">
                <SectionTitle id="person-songs" count={videos.length}>{t('person.songs.title')}</SectionTitle>
                <a
                    href={`${songsPath}?vtuber=${encodeURIComponent(vtuberId)}`}
                    className="mb-3 inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <ListMusic size={13} aria-hidden="true" />
                    {t('person.songs.fullList')}
                </a>
            </div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {videos.map((video) => {
                    const plays = video.segments.reduce((sum, seg) => sum + seg.plays, 0);
                    const date = video.streamedAt ? new Date(video.streamedAt) : null;
                    const list = serializeSongShare(video.segments.map((seg) => seg.code));
                    return (
                        <li key={video.videoId} className="rounded-xl border border-border bg-card/50 p-3">
                            <div className="flex items-start gap-2.5">
                                <Music2 size={16} className="mt-0.5 shrink-0 text-violet-500" aria-hidden="true" />
                                <div className="min-w-0 flex-1">
                                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{video.title}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {[
                                            date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(locale) : null,
                                            t('person.songs.count', { count: video.segments.length }),
                                            plays > 0 ? t('person.songs.plays', { count: plays.toLocaleString(locale) }) : null,
                                        ].filter(Boolean).join(' · ')}
                                    </p>
                                </div>
                                {list && (
                                    <a
                                        href={`${songsPath}?list=${list}`}
                                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <Play size={12} aria-hidden="true" />
                                        {t('person.songs.playAll')}
                                    </a>
                                )}
                            </div>
                            <details className="group mt-2">
                                <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                                    {t('person.songs.showSongs')}
                                </summary>
                                <ol className="mt-1.5 space-y-0.5">
                                    {video.segments.map((seg) => (
                                        <li key={seg.code} className="flex items-baseline gap-2 text-[13px]">
                                            <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">{formatTimecode(seg.start)}</span>
                                            <span className="min-w-0 flex-1 truncate">{seg.title}{seg.artist ? <span className="text-muted-foreground"> / {seg.artist}</span> : null}</span>
                                            {seg.plays > 0 && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{t('person.songs.plays', { count: seg.plays.toLocaleString(locale) })}</span>}
                                        </li>
                                    ))}
                                </ol>
                            </details>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

/** 相關推薦裡的一個人：頭像小圖＋名字（同公司區塊在名字後加小字團名，團名與公司同名時不重複寫） */
function RelatedPersonLink({ slug, name, imgUrl, sub }: { slug: string; name: string; imgUrl: string | null; sub?: string }) {
    return (
        <li>
            <RouteLink
                to={schedulePersonPage(slug)}
                className="flex min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {imgUrl ? (
                    <img src={imgUrl} alt="" loading="lazy" referrerPolicy="no-referrer" width={32} height={32} className="size-8 shrink-0 rounded-full bg-muted object-cover" />
                ) : (
                    <span className="block size-8 shrink-0 rounded-full bg-muted" aria-hidden="true" />
                )}
                <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{name}</span>
                    {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
                </span>
            </RouteLink>
        </li>
    );
}

/** 同公司／同團、同時段常開台兩個區塊；related 為空、或某一組沒有人時不渲染該區塊 */
function PersonRelatedSections({ related }: { related: PersonRelated | null | undefined }) {
    const { t } = useTranslation('schedule');
    if (!related) return null;
    const gridCls = 'grid grid-cols-1 gap-1';
    return (
        <>
            {related.siblings.length > 0 && (
                <section aria-labelledby="person-related-agency">
                    <SectionTitle id="person-related-agency">{t('person.related.agency', { name: related.agency?.name ?? '' })}</SectionTitle>
                    <ul className={gridCls}>
                        {related.siblings.map((p) => (
                            <RelatedPersonLink key={p.slug} slug={p.slug} name={p.name} imgUrl={p.img_url} sub={p.group && p.group !== related.agency?.name ? p.group : undefined} />
                        ))}
                    </ul>
                </section>
            )}
            {related.neighbors.length > 0 && (
                <section aria-labelledby="person-related-neighbors">
                    <SectionTitle id="person-related-neighbors">{t('person.related.neighbors')}</SectionTitle>
                    <ul className={gridCls}>
                        {related.neighbors.map((p) => <RelatedPersonLink key={p.slug} slug={p.slug} name={p.name} imgUrl={p.img_url} />)}
                    </ul>
                </section>
            )}
        </>
    );
}

function PersonBody({ person, slug, related }: { person: SchedulePerson; slug: string; related: PersonRelated | null | undefined }) {
    const { t } = useTranslation('schedule');
    const [now, setNow] = useState(() => Date.now());
    const [recentExpanded, setRecentExpanded] = useState(false);
    const [embedOpen, setEmbedOpen] = useState(false);
    const channels = useMemo(() => ({ [person.id]: person.channel }), [person.id, person.channel]);
    // 歌回目錄（edge 快取 10 分鐘）：本人的歌回清單＋場次列的歌單徽章；person 資料到了這裡才掛上
    const songCatalog = useSongCatalog();
    const songVideos = useMemo(() => (songCatalog.data ? songsForVtuber(songCatalog.data.videos, person.id) : []), [songCatalog.data, person.id]);
    const songsByVideo = useMemo(() => (songCatalog.data ? buildVideoIndex(songCatalog.data.videos) : undefined), [songCatalog.data]);
    const sel = useScheduleSelection(channels, 'person');
    // 預定時間已過的場次會從「接下來」消失：也從勾選拿掉；已開台的照留
    const { prune } = sel;
    useEffect(() => {
        const liveKeys = new Set(person.live.map(streamKey));
        prune((s) => liveKeys.has(streamKey(s)) || !isPastScheduled(s, now));
    }, [now, person.live, prune]);
    const { watch, busyKey } = useWatchOnCanvas('person');
    const fav = useFavoriteChannel();
    const cardActions = useMemo<ScheduleCardActions>(
        () => ({ watch: (s, ch) => void watch(s, ch), busyKey, isFavorite: fav.isFavorite, toggleFavorite: (ch) => void fav.toggle(ch) }),
        [watch, busyKey, fav.isFavorite, fav.toggle],
    );

    useEffect(() => {
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, [person]);

    // 直播中一鍵在畫布觀看：一場就走「點卡片」同一條路（已在畫布上直接切過去）；同時多平台開台則一次加入
    const watchLive = () => {
        if (person.live.length === 1) void watch(person.live[0], person.channel);
        else void sel.open(person.live);
    };
    // 停留在頁面上時，預定時間一過就從「接下來」移除（資料是載入當下切分的）
    const upcoming = useMemo(() => person.upcoming.filter((s) => !isPastScheduled(s, now)), [person.upcoming, now]);
    const recentShown = recentExpanded ? person.recent : person.recent.slice(0, RECENT_PREVIEW);
    const nothing = person.live.length + upcoming.length + person.recent.length === 0;

    return (
        <ScheduleCardActionsContext.Provider value={cardActions}>
            <EmbedPromoBanner show={person.live.length > 0 || person.upcoming.length > 0} onOpen={() => setEmbedOpen(true)} />
            {/* 設計稿「個人頁 A」：lg 以上兩欄 grid（左 340px 資料卡＋其下統計與推薦、右內容跨兩列）；
                lg 以下單欄依 DOM 順序：資料卡 → 場次 → 統計與推薦（手機先看場次）。統計與推薦只渲染一份，靠 grid 位置搬，不複製節點（id 不能重複） */}
            <div className="grid grid-cols-1 gap-7 pt-5 lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start">
            <aside className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1">
            <PersonHeader
                slug={slug}
                person={person}
                embedOpen={embedOpen}
                onEmbedOpenChange={setEmbedOpen}
                onWatchLive={watchLive}
                busy={sel.busy || busyKey !== null}
                favorite={fav.isFavorite(person.channel)}
                onToggleFavorite={() => void fav.toggle(person.channel)}
            />
            </aside>
            <div className="min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2">

            {nothing ? (
                <div className="space-y-12">
                    <p className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">{t('person.inactive')}</p>
                </div>
            ) : (
                <div className="space-y-12">
                    {person.live.length > 0 && (
                        <section aria-labelledby="person-live">
                            <SectionTitle id="person-live">
                                <span className="live-pulse size-2.5 rounded-full bg-[#e5173f]" aria-hidden="true" />
                                {t('person.live')}
                            </SectionTitle>
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                {person.live.map((s) => (
                                    <LiveTile
                                        key={streamKey(s)}
                                        stream={s}
                                        channel={person.channel}
                                        now={now}
                                        selected={sel.selectedKeys.has(streamKey(s))}
                                        onToggle={sel.toggle}
                                        personLinks={false}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    <section aria-labelledby="person-upcoming">
                        <SectionTitle id="person-upcoming" count={upcoming.length}>{t('person.upcoming')}</SectionTitle>
                        {upcoming.length === 0 ? (
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">{t('person.noneUpcoming')}</p>
                                <SubmitScheduleButton person={person} variant="link" />
                            </div>
                        ) : (
                            <DayTimeline
                                streams={upcoming}
                                channels={channels}
                                now={now}
                                selected={sel.selectedKeys}
                                onToggle={sel.toggle}
                                onSelectMany={sel.selectMany}
                                personLinks={false}
                                songsByVideo={songsByVideo}
                            />
                        )}
                    </section>

                    <section aria-labelledby="person-recent">
                        <SectionTitle id="person-recent" count={person.recent.length}>{t('person.recent')}</SectionTitle>
                        {person.recent.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('person.noneRecent')}</p>
                        ) : (
                            <>
                                <ul className="grid grid-cols-1 gap-x-4 2xl:grid-cols-2">
                                    {recentShown.map((s) => (
                                        <RecentRow
                                            key={streamKey(s)}
                                            stream={s}
                                            channel={person.channel}
                                            now={now}
                                            personLinks={false}
                                            songs={s.platform === 'youtube' ? songsByVideo?.get(s.external_id) ?? null : null}
                                        />
                                    ))}
                                </ul>
                                {person.recent.length > RECENT_PREVIEW && (
                                    <button
                                        type="button"
                                        onClick={() => setRecentExpanded((v) => !v)}
                                        aria-expanded={recentExpanded}
                                        className="mt-2 rounded-full px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        {recentExpanded ? t('section.showLess') : t('person.showAllRecent', { count: person.recent.length })}
                                    </button>
                                )}
                            </>
                        )}
                    </section>

                    <PersonSongs videos={songVideos} vtuberId={person.id} />
                </div>
            )}
            </div>
            <div className="mt-3 flex flex-col gap-4 lg:col-start-1 lg:row-start-2 lg:mt-0">
                {!nothing && <PersonStats person={person} upcoming={upcoming.length} live={person.live.length} />}
                <div className="space-y-6"><PersonRelatedSections related={related} /></div>
            </div>
            </div>

            <SelectionBar count={sel.selected.size} room={sel.room} busy={sel.busy} onOpen={() => sel.open()} onClear={sel.clear} />
        </ScheduleCardActionsContext.Provider>
    );
}

function LoadingState({ label }: { label: string }) {
    return (
        <div aria-busy="true" aria-label={label} className="pt-5">
            <div className="flex items-center gap-5">
                <Skeleton className="size-20 rounded-full sm:size-24" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-8 w-56" />
                    <Skeleton className="h-4 w-32" />
                </div>
            </div>
            <Skeleton className="mb-3 mt-10 h-6 w-32" />
            <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
            </div>
        </div>
    );
}

export function SchedulePersonPage({ slug }: { slug: string }) {
    const { t } = useTranslation('schedule');
    const query = usePersonSchedule(slug);
    const person = query.data;
    // 相關推薦另外查：主內容先畫，兩個區塊等它到了再出現；只有可索引的頁面才查（內鏈是給爬蟲與讀者的，空頁不需要）
    const relatedQuery = useQuery({
        queryKey: ['schedule-person-related', slug],
        queryFn: ({ signal }) => fetchPersonRelated(slug, { signal }),
        staleTime: 30 * 60_000,
        refetchInterval: false,
        enabled: !!person?.indexable,
    });

    return (
        <div className="relative min-h-screen bg-background text-foreground">
            <StaticPageHeader title={t('title')} analyticsCategory="SchedulePersonPage" />

            <main className="mx-auto max-w-[1080px] px-4 pb-36 sm:px-6">
                <nav aria-label="Breadcrumb" className="pt-5 text-[13px] text-muted-foreground">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li><RouteLink to="home" className="hover:text-foreground">MultiStream Hub</RouteLink></li>
                        <li aria-hidden="true" className="inline-flex opacity-50"><ChevronRight size={13} /></li>
                        <li><RouteLink to="schedule" className="hover:text-foreground">{t('title')}</RouteLink></li>
                        <li aria-hidden="true" className="inline-flex opacity-50"><ChevronRight size={13} /></li>
                        <li><RouteLink to="vtubers" className="hover:text-foreground">{t('person.breadcrumb.directory')}</RouteLink></li>
                        {person && (
                            <>
                                <li aria-hidden="true" className="inline-flex opacity-50"><ChevronRight size={13} /></li>
                                <li aria-current="page" className="max-w-[40ch] truncate font-medium text-foreground">{person.channel.name}</li>
                            </>
                        )}
                    </ol>
                </nav>

                {/* 預留一屏高：骨架比內容矮，資料到了會把頁尾往下推；先把頁尾放到首屏外（同 SchedulePage）。找不到／錯誤狀態內容短，不預留 */}
                <div className={person === null || (query.isError && !person) ? undefined : 'min-h-svh'}>
                {person ? (
                    <ReportDialogProvider>
                        <ScheduleEntriesDialogProvider>
                            <PersonSeo person={person} slug={slug} />
                            <PersonBody person={person} slug={slug} related={relatedQuery.data} />
                        </ScheduleEntriesDialogProvider>
                    </ReportDialogProvider>
                ) : person === null ? (
                    <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
                        <SEO noindex title={`${t('person.notFound.title')} - MultiStream Hub`} />
                        <SearchX size={32} className="text-muted-foreground" aria-hidden="true" />
                        <h1 className="text-2xl font-bold">{t('person.notFound.title')}</h1>
                        <p className="max-w-md text-sm text-muted-foreground">{t('person.notFound.body')}</p>
                        <RouteLink
                            to="schedule"
                            className="mt-2 inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                        >
                            {t('person.backToSchedule')}
                        </RouteLink>
                    </div>
                ) : query.isError ? (
                    <div role="alert" className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
                        <AlertTriangle className="text-amber-500" aria-hidden="true" />
                        <p className="font-semibold">{t('state.error')}</p>
                        <Button variant="outline" onClick={() => query.refetch()}>
                            <RefreshCw size={14} aria-hidden="true" />
                            {t('state.retry')}
                        </Button>
                    </div>
                ) : (
                    <LoadingState label={t('state.loading')} />
                )}
                </div>

                <SiteFooter analyticsCategory="SchedulePersonPage" />
            </main>
        </div>
    );
}
