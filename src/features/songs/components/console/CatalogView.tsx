/**
 * 中欄列表畫面：歌曲目錄（排序、搜尋、歌回卡片、顯示更多）。
 * 搜尋字、排序與顯示筆數由頁面保存：進單場詳細再返回時不會被清掉。
 * 不傳 search＝嵌入模式（VTuber 個人頁的「歌回」分頁）：不輸出「歌曲目錄」標題、搜尋框與提醒，只有排序、類型篩選與卡片。
 * 類型篩選「全部／歌回／單曲」（依 SongVideo.kind）狀態放在元件內、不進網址；兩種模式共用。
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { cn } from '../../../../components/ui/utils';
import type { SongSegment, SongVideo, SongVideoKind } from '../../songsSource';
import type { Playlist } from '../../store/usePlaylistStore';
import type { CatalogSort } from '../../lib/catalogView';
import { VideoCard } from './VideoCard';
import { CatalogPending } from './CatalogPending';

const CATALOG_SORTS: CatalogSort[] = ['latest', 'popular'];
type KindFilter = 'all' | SongVideoKind;
const KIND_FILTERS: KindFilter[] = ['all', 'stream', 'single'];

export interface CatalogStatus {
    /** 目錄已載入（含空目錄） */
    loaded: boolean;
    totalCount: number;
    isError: boolean;
    isFetching: boolean;
    refetch: () => void;
}

export interface CatalogSearch {
    query: string;
    onQueryChange: (q: string) => void;
    deferredQuery: string;
}

export function CatalogView({
    status, videos, visible, onShowMore, search, sort, onSortChange, playlists, locale, onPlaySong, onPlayAll, onQueue, onOpen,
}: {
    status: CatalogStatus;
    /** 已排序、搜尋、篩選後的歌回 */
    videos: SongVideo[];
    visible: number;
    onShowMore: () => void;
    /** 搜尋框；不傳＝嵌入模式 */
    search?: CatalogSearch;
    sort: CatalogSort;
    onSortChange: (sort: CatalogSort) => void;
    playlists: Playlist[];
    locale: string;
    onPlaySong: (video: SongVideo, segment: SongSegment) => void;
    onPlayAll: (video: SongVideo) => void;
    onQueue: (segment: SongSegment) => void;
    onOpen: (video: SongVideo) => void;
}) {
    const { t } = useTranslation('songs');
    const [kind, setKind] = useState<KindFilter>('all');
    const shown = kind === 'all' ? videos : videos.filter((v) => v.kind === kind);
    const emptyBox = 'rounded-xl border border-dashed border-input px-4 py-12 text-center text-sm text-muted-foreground';

    const sortGroup = (
        <div role="group" aria-label={t('catalog.sort.label')} className="inline-flex w-fit rounded-full bg-muted p-0.5">
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
    );

    const kindGroup = (
        <div role="group" aria-label={t('catalog.kind.label')} className="inline-flex w-fit rounded-full bg-muted p-0.5">
            {KIND_FILTERS.map((key) => (
                <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={cn('h-8 rounded-full px-3.5', kind === key ? 'bg-foreground text-background hover:bg-foreground/90 hover:text-background' : 'text-foreground/80')}
                    aria-pressed={kind === key}
                    onClick={() => setKind(key)}
                >
                    {t(`catalog.kind.${key}`)}
                </Button>
            ))}
        </div>
    );

    const content = status.loaded ? (
        status.totalCount === 0 ? (
            <p className={emptyBox}>{t('catalog.empty')}</p>
        ) : videos.length === 0 ? (
            <p className={emptyBox}>{t('catalog.noResults', { query: search?.deferredQuery.trim() ?? '' })}</p>
        ) : shown.length === 0 ? (
            <p className={emptyBox}>{t('catalog.kind.none')}</p>
        ) : (
            <>
                <ul className="flex flex-col gap-3">
                    {shown.slice(0, visible).map((video) => (
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
                {shown.length > visible && (
                    <div className="flex justify-center">
                        <Button variant="outline" className="rounded-full bg-transparent" onClick={onShowMore}>{t('catalog.showMore')}</Button>
                    </div>
                )}
            </>
        )
    ) : (
        <CatalogPending isError={status.isError} retrying={status.isFetching} onRetry={status.refetch} />
    );

    if (!search) {
        return (
            <div className="@container flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                    {sortGroup}
                    {kindGroup}
                </div>
                {content}
            </div>
        );
    }

    return (
        <section aria-labelledby="songs-catalog-h" className="@container flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
                <h2 id="songs-catalog-h" tabIndex={-1} className="text-[22px] font-black focus:outline-none">{t('catalog.title')}</h2>
                {sortGroup}
                {kindGroup}
                <div className="relative w-full @lg:ml-auto @lg:w-[340px]">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                        type="search"
                        value={search.query}
                        onChange={(e) => search.onQueryChange(e.target.value)}
                        placeholder={t('catalog.search')}
                        aria-label={t('catalog.search')}
                        className="h-10 rounded-full border-0 bg-muted pl-10 text-[13px]"
                    />
                </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{t('video.chatNote')}</p>
            {content}
        </section>
    );
}
