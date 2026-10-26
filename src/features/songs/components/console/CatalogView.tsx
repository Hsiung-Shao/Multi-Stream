/**
 * 中欄列表畫面：歌曲目錄（排序、搜尋、VTuber 篩選、歌回卡片、顯示更多）。
 * 搜尋字、排序與顯示筆數由頁面保存：進單場詳細再返回時不會被清掉。
 */
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, Search, X } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { cn } from '../../../../components/ui/utils';
import type { SongSegment, SongVideo } from '../../songsSource';
import type { Playlist } from '../../store/usePlaylistStore';
import type { CatalogSort } from '../../lib/catalogView';
import { VideoCard } from './VideoCard';

const CATALOG_SORTS: CatalogSort[] = ['latest', 'popular'];

export interface CatalogStatus {
    /** 目錄已載入（含空目錄） */
    loaded: boolean;
    totalCount: number;
    isError: boolean;
    isFetching: boolean;
    refetch: () => void;
}

export function CatalogView({
    status, videos, visible, onShowMore, query, onQueryChange, deferredQuery, sort, onSortChange,
    filterName, onClearFilter, playlists, locale, onPlaySong, onPlayAll, onQueue, onOpen,
}: {
    status: CatalogStatus;
    /** 已排序、搜尋、篩選後的歌回 */
    videos: SongVideo[];
    visible: number;
    onShowMore: () => void;
    query: string;
    onQueryChange: (q: string) => void;
    deferredQuery: string;
    sort: CatalogSort;
    onSortChange: (sort: CatalogSort) => void;
    /** 目前篩選的 VTuber 名稱；null＝沒有篩選 */
    filterName: string | null;
    onClearFilter: () => void;
    playlists: Playlist[];
    locale: string;
    onPlaySong: (video: SongVideo, segment: SongSegment) => void;
    onPlayAll: (video: SongVideo) => void;
    onQueue: (segment: SongSegment) => void;
    onOpen: (video: SongVideo) => void;
}) {
    const { t } = useTranslation('songs');
    const emptyBox = 'rounded-xl border border-dashed border-input px-4 py-12 text-center text-sm text-muted-foreground';

    return (
        <section aria-labelledby="songs-catalog-h" className="@container flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
                <h2 id="songs-catalog-h" tabIndex={-1} className="text-[22px] font-black focus:outline-none">{t('catalog.title')}</h2>
                <div role="group" aria-label={t('catalog.sort.label')} className="inline-flex rounded-full bg-muted p-0.5">
                    {CATALOG_SORTS.map((key) => (
                        <Button
                            key={key}
                            type="button"
                            size="sm"
                            variant="ghost"
                            className={cn('h-8 rounded-full px-3.5', sort === key ? 'bg-foreground text-background hover:bg-foreground/90 hover:text-background' : 'text-foreground/80')}
                            aria-pressed={sort === key}
                            onClick={() => onSortChange(key)}
                        >
                            {t(`catalog.sort.${key}`)}
                        </Button>
                    ))}
                </div>
                <div className="relative w-full @lg:ml-auto @lg:w-[340px]">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                        type="search"
                        value={query}
                        onChange={(e) => onQueryChange(e.target.value)}
                        placeholder={t('catalog.search')}
                        aria-label={t('catalog.search')}
                        className="h-10 rounded-full border-0 bg-muted pl-10 text-[13px]"
                    />
                </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{t('video.chatNote')}</p>

            {filterName !== null && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-popover px-3 py-2 text-[13px]">
                    <span className="min-w-0 flex-1">{t('catalog.filteredBy', { name: filterName })}</span>
                    <Button variant="ghost" size="sm" className="h-8" onClick={onClearFilter}>
                        <X className="size-3.5" aria-hidden="true" />
                        {t('catalog.clearFilter')}
                    </Button>
                </div>
            )}

            {status.loaded ? (
                status.totalCount === 0 ? (
                    <p className={emptyBox}>{t('catalog.empty')}</p>
                ) : videos.length === 0 ? (
                    <p className={emptyBox}>{t('catalog.noResults', { query: deferredQuery.trim() })}</p>
                ) : (
                    <>
                        <ul className="flex flex-col gap-3">
                            {videos.slice(0, visible).map((video) => (
                                <VideoCard
                                    key={video.videoId}
                                    video={video}
                                    playlists={playlists}
                                    locale={locale}
                                    onPlaySong={onPlaySong}
                                    onPlayAll={onPlayAll}
                                    onQueue={onQueue}
                                    onOpen={onOpen}
                                />
                            ))}
                        </ul>
                        {videos.length > visible && (
                            <div className="flex justify-center">
                                <Button variant="outline" className="rounded-full bg-transparent" onClick={onShowMore}>{t('catalog.showMore')}</Button>
                            </div>
                        )}
                    </>
                )
            ) : status.isError ? (
                <div className="flex flex-wrap items-center gap-4 rounded-xl bg-popover p-6">
                    <p role="alert" className="flex-1 font-bold">{t('catalog.loadError')}</p>
                    <Button variant="outline" onClick={status.refetch} disabled={status.isFetching}>
                        <RefreshCw className={cn('size-3.5', status.isFetching && 'animate-spin')} aria-hidden="true" />
                        {t('catalog.retry')}
                    </Button>
                </div>
            ) : (
                <p role="status" className="flex min-h-[160px] items-center justify-center gap-2 rounded-xl bg-popover text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {t('catalog.loading')}
                </p>
            )}
        </section>
    );
}
