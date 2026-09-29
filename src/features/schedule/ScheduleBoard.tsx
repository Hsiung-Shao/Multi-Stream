// 週表的資料區塊：篩選列、直播中、接下來（時間軸）、剛結束，以及勾選一鍵多開。
// 只在 snapshot 已載入時掛上（預渲染與首輪 hydration 都不會 render 這裡），
// 所以可以放心讀 localStorage（收藏、篩選）與 Date.now()。
// 版面依 PRODUCT.md：時間是主軸、現在最大聲、剛結束最安靜；拿掉分頁，一頁由上而下讀完。
// 卡片點擊＝在畫布觀看、愛心＝收藏（ScheduleCardActionsContext）；工具列搜尋在週表內即時篩選，
// 名字符合的實況主列成捷徑，週表上找不到時改用全站搜尋（StreamSearchBox）。

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Heart, SearchX } from 'lucide-react';
import { RouteLink } from '../../components/Navigation/RouteLink';
import { StreamSearchBox } from '../../components/StreamSearchBox';
import { schedulePersonPage } from '../../config/schedulePerson';
import { track } from '../../utils/analytics';
import { cn } from '../../components/ui/utils';
import { countByTab, filterStreams, listGroups, listMatchingChannels, sortLive } from './filters';
import { useScheduleSelection } from './useScheduleSelection';
import { useWatchOnCanvas } from './useWatchOnCanvas';
import { useFavoriteChannel } from './useFavoriteChannel';
import { LiveTile, RecentRow, ScheduleCardActionsContext, type ScheduleCardActions } from './ScheduleCard';
import { ScheduleToolbar } from './ScheduleToolbar';
import { AgencyRoster } from './AgencyRoster';
import { DayTimeline } from './DayTimeline';
import { SelectionBar } from './SelectionBar';
import { DEFAULT_FILTERS, GROUP_ANY_AGENCY, GROUP_NO_AGENCY, streamKey, type ScheduleFilterState, type ScheduleSnapshot } from './types';

const FILTERS_STORAGE_KEY = 'schedule-filters-v1';
/** 直播中預設先顯示幾位（約兩列），其餘收合 */
const LIVE_PREVIEW = 10;
const RECENT_PREVIEW = 12;

function loadFilters(): ScheduleFilterState {
    try {
        const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
        if (!raw) return DEFAULT_FILTERS;
        return { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<ScheduleFilterState>) };
    } catch {
        return DEFAULT_FILTERS;
    }
}

function saveFilters(f: ScheduleFilterState): void {
    try {
        localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(f));
    } catch {
        // 私密模式或配額滿：篩選只是便利功能，失敗不影響
    }
}

function SectionHeading({ id, title, count, live, children }: { id: string; title: string; count: number; live?: boolean; children?: React.ReactNode }) {
    return (
        <div className="mb-3 flex items-center gap-3">
            <h2 id={id} className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground">
                {live && <span className="live-pulse size-2.5 rounded-full bg-[#e5173f]" aria-hidden="true" />}
                {title}
                <span className="rounded-full bg-foreground/[0.07] px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{count}</span>
            </h2>
            {children && <div className="ml-auto">{children}</div>}
        </div>
    );
}

function ExpandButton({ expanded, total, onClick }: { expanded: boolean; total: number; onClick: () => void }) {
    const { t } = useTranslation('schedule');
    return (
        <button
            type="button"
            onClick={onClick}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            {expanded ? t('section.showLess') : t('section.showAll', { count: total })}
            <ChevronDown size={14} aria-hidden="true" className={cn('transition-transform duration-200', expanded && 'rotate-180')} />
        </button>
    );
}

export function ScheduleBoard({ snapshot }: { snapshot: ScheduleSnapshot }) {
    const { t } = useTranslation('schedule');
    const fav = useFavoriteChannel();
    const favoriteKeys = fav.favoriteKeys;
    const { watch, busyKey } = useWatchOnCanvas('board');
    const [filters, setFilters] = useState<ScheduleFilterState>(loadFilters);
    // 搜尋：搜尋框自己 debounce，這裡只收到停頓後的值（見 ScheduleToolbar.SearchField）
    const [deferredQuery, setQuery] = useState('');
    const searching = deferredQuery.trim().length > 0;
    const [now, setNow] = useState(() => Date.now());
    const [liveExpanded, setLiveExpanded] = useState(false);
    const [recentExpanded, setRecentExpanded] = useState(false);

    // 相對時間（「3 分鐘前」）與「現在」線每分鐘刷新；snapshot 更新時也對齊
    useEffect(() => {
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, [snapshot.generated_at]);

    const groups = useMemo(() => listGroups(snapshot), [snapshot]);
    useEffect(() => {
        // 企業勢名稱不在這份 snapshot 裡、或 snapshot 完全沒有所屬資料（舊版 snapshot）時回到「全部」，避免整片空白
        const special = filters.group === GROUP_ANY_AGENCY || filters.group === GROUP_NO_AGENCY;
        const valid = filters.group === 'all' || (groups.length > 0 && (special || groups.includes(filters.group)));
        if (!valid) setFilters((f) => ({ ...f, group: 'all' }));
    }, [groups, filters.group]);

    const counts = useMemo(() => countByTab(snapshot, filters, favoriteKeys, deferredQuery), [snapshot, filters, favoriteKeys, deferredQuery]);
    const live = useMemo(() => sortLive(filterStreams(snapshot, 'live', filters, favoriteKeys, deferredQuery)), [snapshot, filters, favoriteKeys, deferredQuery]);
    const upcoming = useMemo(() => filterStreams(snapshot, 'upcoming', filters, favoriteKeys, deferredQuery), [snapshot, filters, favoriteKeys, deferredQuery]);
    const recent = useMemo(() => filterStreams(snapshot, 'recent', filters, favoriteKeys, deferredQuery), [snapshot, filters, favoriteKeys, deferredQuery]);
    // 捷徑只列有個人頁的人（沒有 slug 的點了沒地方去）
    const matchedPeople = useMemo(() => listMatchingChannels(snapshot, deferredQuery).filter((p) => p.channel.slug), [snapshot, deferredQuery]);
    const noResults = searching && counts.live + counts.upcoming + counts.recent === 0;
    // 「所屬」選了某家企業勢（不是全部／企業勢全部／非企業勢）且沒在搜尋時，顯示這家的成員名冊
    const rosterAgency = !searching && filters.group !== 'all' && filters.group !== GROUP_ANY_AGENCY && filters.group !== GROUP_NO_AGENCY ? filters.group : null;
    const liveIds = useMemo(() => new Set(snapshot.live.map((s) => s.vtuber_id)), [snapshot]);

    const cardActions = useMemo<ScheduleCardActions>(
        () => ({ watch: (s, ch) => void watch(s, ch), busyKey, isFavorite: fav.isFavorite, toggleFavorite: (ch) => void fav.toggle(ch) }),
        [watch, busyKey, fav.isFavorite, fav.toggle],
    );

    const changeFilter = (key: keyof ScheduleFilterState, value: string) => {
        setFilters((prev) => {
            const next = { ...prev, [key]: value } as ScheduleFilterState;
            saveFilters(next);
            return next;
        });
        track.scheduleFilterChange(key, value);
    };

    const sel = useScheduleSelection(snapshot.channels, filters.scope);

    const nothingInFavorites = !searching && filters.scope === 'favorites' && counts.live + counts.upcoming + counts.recent === 0;
    const liveShown = liveExpanded ? live : live.slice(0, LIVE_PREVIEW);
    const recentShown = recentExpanded ? recent : recent.slice(0, RECENT_PREVIEW);

    return (
        <ScheduleCardActionsContext.Provider value={cardActions}>
            <ScheduleToolbar value={filters} groups={groups} onChange={changeFilter} onQueryChange={setQuery} searching={searching} />

            {rosterAgency && <AgencyRoster key={rosterAgency} agency={rosterAgency} liveIds={liveIds} />}

            {searching && matchedPeople.length > 0 && (
                <nav aria-label={t('search.people')} className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">{t('search.people')}</span>
                    {matchedPeople.map(({ id, channel }) =>
                        channel.slug ? (
                            <RouteLink
                                key={id}
                                to={schedulePersonPage(channel.slug)}
                                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 text-[13px] font-medium transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {channel.avatar ? (
                                    <img src={channel.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-7 rounded-full bg-muted object-cover" />
                                ) : (
                                    <span className="size-7 rounded-full bg-muted" aria-hidden="true" />
                                )}
                                {channel.name}
                            </RouteLink>
                        ) : null,
                    )}
                </nav>
            )}

            {noResults ? (
                <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
                    <SearchX className="text-muted-foreground" aria-hidden="true" />
                    <p className="font-semibold">{t('search.noneTitle', { query: deferredQuery.trim() })}</p>
                    <p className="max-w-md text-sm text-muted-foreground">{t('search.noneHint')}</p>
                    {(filters.scope === 'favorites' || filters.platform !== 'all') && (
                        <button
                            type="button"
                            onClick={() => {
                                changeFilter('scope', 'all');
                                changeFilter('platform', 'all');
                            }}
                            className="rounded-full border border-border px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {t('search.widen')}
                        </button>
                    )}
                    {/* 全站搜尋框跟著頂部搜尋字（頂部是主要輸入）；週表一有結果就收起 */}
                    <StreamSearchBox size="md" navigateToCanvas initialQuery={deferredQuery.trim()} initialPlatform="youtube" className="mt-2 text-left" />
                </div>
            ) : nothingInFavorites ? (
                <div className="mt-8 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
                    <Heart className="text-muted-foreground" aria-hidden="true" />
                    <p className="font-semibold">{t('state.emptyFavorites')}</p>
                    <p className="max-w-md text-sm text-muted-foreground">{t('state.emptyFavoritesHint')}</p>
                </div>
            ) : (
                <div className="mt-6 space-y-12">
                    <section aria-labelledby="sch-live">
                        <SectionHeading id="sch-live" title={t('section.live')} count={live.length} live={live.length > 0}>
                            {live.length > LIVE_PREVIEW && (
                                <ExpandButton expanded={liveExpanded} total={live.length} onClick={() => setLiveExpanded((v) => !v)} />
                            )}
                        </SectionHeading>
                        {live.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('state.noneLive')}</p>
                        ) : (
                            // 手機兩欄（單欄大圖一屏只看得到一位）；桌機依寬度自動排
                            <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-x-4 sm:gap-y-5">
                                {liveShown.map((s) => (
                                    <LiveTile
                                        key={streamKey(s)}
                                        stream={s}
                                        channel={snapshot.channels[s.vtuber_id]}
                                        now={now}
                                        selected={sel.selectedKeys.has(streamKey(s))}
                                        onToggle={sel.toggle}
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    <section aria-labelledby="sch-upcoming">
                        <SectionHeading id="sch-upcoming" title={t('section.upcoming')} count={upcoming.length} />
                        {upcoming.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('state.noneUpcoming')}</p>
                        ) : (
                            <DayTimeline
                                streams={upcoming}
                                channels={snapshot.channels}
                                now={now}
                                selected={sel.selectedKeys}
                                onToggle={sel.toggle}
                                onSelectMany={sel.selectMany}
                                onDayChange={(d) => track.scheduleFilterChange('day', d)}
                            />
                        )}
                    </section>

                    {recent.length > 0 && (
                        <section aria-labelledby="sch-recent">
                            <SectionHeading id="sch-recent" title={t('section.recent')} count={recent.length}>
                                {recent.length > RECENT_PREVIEW && (
                                    <ExpandButton expanded={recentExpanded} total={recent.length} onClick={() => setRecentExpanded((v) => !v)} />
                                )}
                            </SectionHeading>
                            <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                                {recentShown.map((s) => (
                                    <RecentRow key={streamKey(s)} stream={s} channel={snapshot.channels[s.vtuber_id]} now={now} />
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            )}

            <SelectionBar count={sel.selected.size} room={sel.room} busy={sel.busy} onOpen={() => sel.open()} onClear={sel.clear} />
        </ScheduleCardActionsContext.Provider>
    );
}
