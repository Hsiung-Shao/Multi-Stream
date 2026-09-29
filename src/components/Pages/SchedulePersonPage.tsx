// 個人週表頁（/schedule/<slug>）：一位實況主的直播中、接下來 7 天、最近 30 天。
// 資料在 client 端由 TanStack Query 以 anon 身分查 PostgREST（features/schedule/personSource.ts）；
// 不預渲染（內容依人不同），edge（functions/[[path]].js）先把 title／description／canonical／robots 注入 index.html 殼，
// 這裡的 <SEO> 在資料到了之後再斷言一次（同一套文案），並補 ProfilePage＋BroadcastEvent JSON-LD。
// 版面沿用公共週表的元件（LiveTile／DayTimeline／RecentRow），名字不再連到自己。

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronRight, ExternalLink, Heart, MonitorPlay, RefreshCw, SearchX } from 'lucide-react';
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
import type { SchedulePerson } from '../../features/schedule/personSource';
import { streamKey } from '../../features/schedule/types';
import { largerAvatar } from '../../features/schedule/streamLinks';
import { schedulePersonPath } from '../../config/schedulePerson';
import { PAGE_PATHS } from '../../config/routes';
import { SEO_SITE_URL } from '../../seo/defaults';
import { breadcrumb, graph, webPage } from '../../seo/jsonld';
import { toHtmlLang } from '../../i18n/i18n';

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

function PersonSeo({ person, slug }: { person: SchedulePerson; slug: string }) {
    const { t, i18n } = useTranslation('schedule');
    const inLanguage = toHtmlLang(i18n.language);
    const path = schedulePersonPath(slug);
    const url = `${SEO_SITE_URL}${path}`;
    const name = person.channel.name;
    const title = t('person.seo.title', { name });
    const description = t('person.seo.description', { name });
    const sameAs = channelLinks(person).map((l) => l.href);
    // 只列有確切時間的場次；BroadcastEvent 讓搜尋引擎知道哪一場正在直播／何時開始
    const events = [...person.live, ...person.upcoming].slice(0, 10).map((s) => ({
        '@type': 'BroadcastEvent',
        name: s.title || name,
        isLiveBroadcast: true,
        startDate: s.actual_start ?? s.scheduled_start,
        url: s.platform === 'youtube' ? `https://www.youtube.com/watch?v=${s.external_id}` : person.channel.twitch ? `https://www.twitch.tv/${person.channel.twitch}` : undefined,
        eventStatus: 'https://schema.org/EventScheduled',
        performer: { '@id': `${url}#person` },
    })).filter((e) => e.startDate);

    return (
        <SEO
            title={title}
            description={description}
            url={url}
            image={person.channel.avatar ? largerAvatar(person.channel.avatar) : undefined}
            noindex={!person.indexable}
            jsonLd={graph(
                webPage({ type: 'ProfilePage', path, name: title, description, inLanguage, extra: { mainEntity: { '@id': `${url}#person` } } }),
                {
                    '@type': 'Person',
                    '@id': `${url}#person`,
                    name,
                    ...(person.channel.avatar ? { image: person.channel.avatar } : {}),
                    ...(sameAs.length ? { sameAs } : {}),
                },
                ...events,
                breadcrumb([
                    { name: 'MultiStream Hub', path: '/' },
                    { name: t('title'), path: PAGE_PATHS.schedule },
                    { name, path },
                ]),
            )}
        />
    );
}

function PersonHeader({ person, onWatchLive, busy, favorite, onToggleFavorite }: { person: SchedulePerson; onWatchLive: () => void; busy: boolean; favorite: boolean; onToggleFavorite: () => void }) {
    const { t } = useTranslation('schedule');
    const ch = person.channel;
    const live = person.live.length > 0;
    return (
        <header className="flex flex-col gap-5 pb-8 pt-5 sm:flex-row sm:items-center">
            <div className="relative shrink-0 self-start">
                {ch.avatar ? (
                    <img
                        src={largerAvatar(ch.avatar)}
                        alt=""
                        referrerPolicy="no-referrer"
                        className={`size-20 rounded-full bg-muted object-cover sm:size-24 ${live ? 'ring-[3px] ring-[#e5173f] ring-offset-2 ring-offset-background' : 'ring-1 ring-border'}`}
                    />
                ) : (
                    <span className="block size-20 rounded-full bg-muted sm:size-24" aria-hidden="true" />
                )}
                {live && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-[#e5173f] px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">LIVE</span>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight [text-wrap:balance] sm:text-[2.125rem]">{ch.name}</h1>
                <p className="mt-1 text-[15px] text-muted-foreground">
                    {/* 企業勢子團：公司 · 子團 · 地區（公司與團名相同時只寫一次） */}
                    {[ch.agency && ch.agency !== ch.group ? ch.agency : null, ch.group, t(`nationality.${ch.nationality}`, { defaultValue: ch.nationality })].filter(Boolean).join(' · ')}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {live && (
                        <Button onClick={onWatchLive} disabled={busy} className="gap-1.5">
                            <MonitorPlay size={16} aria-hidden="true" />
                            {t('person.watchOnCanvas')}
                        </Button>
                    )}
                    {(ch.youtube || ch.twitch) && (
                        <Button variant={favorite ? 'secondary' : 'outline'} onClick={onToggleFavorite} aria-pressed={favorite} className="gap-1.5">
                            <Heart size={16} aria-hidden="true" className={favorite ? 'fill-[#e5173f] text-[#e5173f]' : undefined} />
                            {t(favorite ? 'favorite.saved' : 'favorite.save')}
                        </Button>
                    )}
                    {channelLinks(person).map((l) => (
                        <a
                            key={l.platform}
                            href={l.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <span className={`size-2 rounded-full ${l.platform === 'youtube' ? 'bg-[#ff3b3b]' : 'bg-[#a970ff]'}`} aria-hidden="true" />
                            {t(l.platform === 'youtube' ? 'person.openYouTube' : 'person.openTwitch')}
                            <ExternalLink size={13} className="opacity-60" aria-hidden="true" />
                        </a>
                    ))}
                </div>
            </div>
        </header>
    );
}

function PersonBody({ person }: { person: SchedulePerson }) {
    const { t } = useTranslation('schedule');
    const [now, setNow] = useState(() => Date.now());
    const [recentExpanded, setRecentExpanded] = useState(false);
    const channels = useMemo(() => ({ [person.id]: person.channel }), [person.id, person.channel]);
    const sel = useScheduleSelection(channels, 'person');
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
    const recentShown = recentExpanded ? person.recent : person.recent.slice(0, RECENT_PREVIEW);
    const nothing = person.live.length + person.upcoming.length + person.recent.length === 0;

    return (
        <ScheduleCardActionsContext.Provider value={cardActions}>
            <PersonHeader
                person={person}
                onWatchLive={watchLive}
                busy={sel.busy || busyKey !== null}
                favorite={fav.isFavorite(person.channel)}
                onToggleFavorite={() => void fav.toggle(person.channel)}
            />

            {nothing ? (
                <p className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">{t('person.inactive')}</p>
            ) : (
                <div className="space-y-12">
                    {person.live.length > 0 && (
                        <section aria-labelledby="person-live">
                            <SectionTitle id="person-live">
                                <span className="live-pulse size-2.5 rounded-full bg-[#e5173f]" aria-hidden="true" />
                                {t('person.live')}
                            </SectionTitle>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                        <SectionTitle id="person-upcoming" count={person.upcoming.length}>{t('person.upcoming')}</SectionTitle>
                        {person.upcoming.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('person.noneUpcoming')}</p>
                        ) : (
                            <DayTimeline
                                streams={person.upcoming}
                                channels={channels}
                                now={now}
                                selected={sel.selectedKeys}
                                onToggle={sel.toggle}
                                onSelectMany={sel.selectMany}
                                personLinks={false}
                            />
                        )}
                    </section>

                    <section aria-labelledby="person-recent">
                        <SectionTitle id="person-recent" count={person.recent.length}>{t('person.recent')}</SectionTitle>
                        {person.recent.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('person.noneRecent')}</p>
                        ) : (
                            <>
                                <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                                    {recentShown.map((s) => (
                                        <RecentRow key={streamKey(s)} stream={s} channel={person.channel} now={now} personLinks={false} />
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
                </div>
            )}

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

    return (
        <div className="relative min-h-screen bg-background text-foreground">
            <StaticPageHeader title={t('title')} analyticsCategory="SchedulePersonPage" />

            <main className="mx-auto max-w-[1080px] px-4 pb-36 sm:px-6">
                <nav aria-label="Breadcrumb" className="pt-5 text-[13px] text-muted-foreground">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li><RouteLink to="home" className="hover:text-foreground">MultiStream Hub</RouteLink></li>
                        <li aria-hidden="true" className="inline-flex opacity-50"><ChevronRight size={13} /></li>
                        <li><RouteLink to="schedule" className="hover:text-foreground">{t('title')}</RouteLink></li>
                        {person && (
                            <>
                                <li aria-hidden="true" className="inline-flex opacity-50"><ChevronRight size={13} /></li>
                                <li aria-current="page" className="max-w-[40ch] truncate font-medium text-foreground">{person.channel.name}</li>
                            </>
                        )}
                    </ol>
                </nav>

                {person ? (
                    <>
                        <PersonSeo person={person} slug={slug} />
                        <PersonBody person={person} />
                    </>
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

                <SiteFooter analyticsCategory="SchedulePersonPage" />
            </main>
        </div>
    );
}
