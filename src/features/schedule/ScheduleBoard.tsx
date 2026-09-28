// 週表的資料區塊：分頁、篩選、卡片、勾選與一鍵多開。
// 只在 snapshot 已載入時掛上（預渲染與首輪 hydration 都不會 render 這裡），
// 所以可以放心讀 localStorage（收藏、篩選）與 Date.now()。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Heart } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { useFavorites } from '../../hooks/useFavorites';
import { useStreamStore } from '../../store/useStreamStore';
import { useUIStore } from '../../store/useUIStore';
import { track } from '../../utils/analytics';
import { countByTab, filterStreams, listGroups, sortLive, toFavoriteKeys } from './filters';
import { CANVAS_MAX_STREAMS, openOnCanvas, toOpenTargets } from './openOnCanvas';
import { ScheduleCard } from './ScheduleCard';
import { ScheduleFilters } from './ScheduleFilters';
import { SelectionBar } from './SelectionBar';
import { WeekBoard } from './WeekBoard';
import {
    DEFAULT_FILTERS,
    streamKey,
    type ScheduleFilterState,
    type ScheduleSnapshot,
    type ScheduleStream,
    type ScheduleTab,
} from './types';

const FILTERS_STORAGE_KEY = 'schedule-filters-v1';
const TABS: ScheduleTab[] = ['live', 'upcoming', 'recent'];

function loadFilters(): ScheduleFilterState {
    try {
        const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
        if (!raw) return DEFAULT_FILTERS;
        const parsed = JSON.parse(raw) as Partial<ScheduleFilterState>;
        return { ...DEFAULT_FILTERS, ...parsed };
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

export function ScheduleBoard({ snapshot }: { snapshot: ScheduleSnapshot }) {
    const { t } = useTranslation('schedule');
    const { favorites } = useFavorites();
    const favoriteKeys = useMemo(() => toFavoriteKeys(favorites), [favorites]);
    const [filters, setFilters] = useState<ScheduleFilterState>(loadFilters);
    const [tab, setTab] = useState<ScheduleTab>('live');
    const [now, setNow] = useState(() => Date.now());
    const [selected, setSelected] = useState<Map<string, ScheduleStream>>(() => new Map());
    const [busy, setBusy] = useState(false);
    const canvasCount = useStreamStore((s) => s.streams.length);
    const room = Math.max(0, CANVAS_MAX_STREAMS - canvasCount);

    // 相對時間（「3 分鐘前」）每分鐘刷新；snapshot 更新時也對齊
    useEffect(() => {
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, [snapshot.generated_at]);

    // 篩選到的團體若已不在 snapshot（資料更新後消失），回到「全部團體」
    const groups = useMemo(() => listGroups(snapshot), [snapshot]);
    useEffect(() => {
        if (filters.group !== 'all' && !groups.includes(filters.group)) setFilters((f) => ({ ...f, group: 'all' }));
    }, [groups, filters.group]);

    const counts = useMemo(() => countByTab(snapshot, filters, favoriteKeys), [snapshot, filters, favoriteKeys]);
    const listFor = useCallback(
        (which: ScheduleTab) => {
            const list = filterStreams(snapshot, which, filters, favoriteKeys);
            return which === 'live' ? sortLive(list) : list;
        },
        [snapshot, filters, favoriteKeys],
    );

    const changeFilter = (key: keyof ScheduleFilterState, value: string) => {
        setFilters((prev) => {
            const next = { ...prev, [key]: value } as ScheduleFilterState;
            saveFilters(next);
            return next;
        });
        track.scheduleFilterChange(key, value);
    };

    const changeTab = (value: string) => {
        setTab(value as ScheduleTab);
        track.scheduleFilterChange('tab', value);
    };

    const toggle = useCallback((s: ScheduleStream) => {
        setSelected((prev) => {
            const next = new Map(prev);
            const k = streamKey(s);
            if (next.has(k)) next.delete(k);
            else next.set(k, s);
            return next;
        });
    }, []);

    const selectMany = useCallback((list: ScheduleStream[]) => {
        setSelected((prev) => {
            const next = new Map(prev);
            for (const s of list) next.set(streamKey(s), s);
            return next;
        });
    }, []);

    const selectedKeys = useMemo(() => new Set(selected.keys()), [selected]);

    const openSelected = async () => {
        const list = [...selected.values()];
        const targets = toOpenTargets(list, snapshot.channels);
        setBusy(true);
        try {
            const addStream = useStreamStore.getState().addStream;
            const res = await openOnCanvas(targets, useStreamStore.getState().streams.length, addStream);
            track.scheduleOpenMulti(list.length, res.added, tab, filters.scope);
            if (res.added === 0) toast.error(t('toast.none'));
            else if (res.failed > 0) toast.warning(t('toast.partial', { added: res.added, failed: res.failed }));
            else toast.success(t('toast.added', { count: res.added }));
            if (res.skipped > 0) toast.info(t('toast.skipped', { count: res.skipped }));
            if (res.added > 0) {
                setSelected(new Map());
                useUIStore.getState().setPage('canvas');
            }
        } finally {
            setBusy(false);
        }
    };

    const emptyState = (which: ScheduleTab) => {
        if (filters.scope === 'favorites' && counts[which] === 0 && TABS.every((x) => counts[x] === 0)) {
            return (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-14 text-center">
                    <Heart className="text-muted-foreground" aria-hidden="true" />
                    <p className="font-medium">{t('state.emptyFavorites')}</p>
                    <p className="max-w-md text-sm text-muted-foreground">{t('state.emptyFavoritesHint')}</p>
                </div>
            );
        }
        return <p className="rounded-xl border border-dashed border-border px-6 py-14 text-center text-sm text-muted-foreground">{t('state.empty')}</p>;
    };

    const grid = (which: ScheduleTab) => {
        const list = listFor(which);
        if (list.length === 0) return emptyState(which);
        const selectable = which !== 'recent';
        return (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {list.map((s) => (
                    <ScheduleCard
                        key={streamKey(s)}
                        stream={s}
                        channel={snapshot.channels[s.vtuber_id]}
                        tab={which}
                        now={now}
                        selectable={selectable}
                        selected={selectedKeys.has(streamKey(s))}
                        onToggle={toggle}
                    />
                ))}
            </div>
        );
    };

    const upcomingList = listFor('upcoming');

    return (
        <>
            <div className="mb-4">
                <ScheduleFilters value={filters} groups={groups} onChange={changeFilter} />
            </div>
            <Tabs value={tab} onValueChange={changeTab} className="gap-4">
                {/* 手機（375px）三個分頁加數字會超寬：窄螢幕撐滿寬度並縮內距 */}
                <TabsList className="h-10 w-full sm:w-fit">
                    {TABS.map((x) => (
                        <TabsTrigger key={x} value={x} className="px-2 sm:px-4">
                            {t(`tabs.${x}` as 'tabs.live')}
                            <span className="ml-1.5 rounded-full bg-background/60 px-1.5 text-xs tabular-nums text-muted-foreground">{counts[x]}</span>
                        </TabsTrigger>
                    ))}
                </TabsList>
                <TabsContent value="live">{grid('live')}</TabsContent>
                <TabsContent value="upcoming">
                    {upcomingList.length === 0 ? (
                        emptyState('upcoming')
                    ) : (
                        <WeekBoard
                            streams={upcomingList}
                            channels={snapshot.channels}
                            now={now}
                            selected={selectedKeys}
                            onToggle={toggle}
                            onSelectMany={selectMany}
                        />
                    )}
                </TabsContent>
                <TabsContent value="recent">{grid('recent')}</TabsContent>
            </Tabs>
            <SelectionBar count={selected.size} room={room} busy={busy} onOpen={openSelected} onClear={() => setSelected(new Map())} />
        </>
    );
}
