/**
 * 中欄 VTuber 個人頁：頭像、名稱、「N 首歌・M 場歌回」，分成「歌單」「歌回」兩個分頁（切換用 replace，不新增歷史）。
 *
 * - 歌單：這位唱過的每首歌一列（songsOfVtuber），可依「最新」「最常唱」排序；播放、加入佇列都用這位最新的版本，
 *   「播放：歌名」從這首開始接著播整份歌單（每首各取最新版本）。
 * - 歌回：既有目錄卡片的嵌入模式，只列這位的歌回。
 * - 舊格式目錄（沒有歌曲字典）沒有歌單，只顯示歌回、不輸出分頁列。
 * - 這組 Tabs 和手機版「瀏覽／正在播放」是兩組獨立的 Radix Tabs，播放器不在任何一組裡。
 */
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ListPlus, Music2, Play } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../components/ui/tabs';
import { cn } from '../../../../components/ui/utils';
import type { SongEntry, SongSegment, SongVideo } from '../../songsSource';
import type { Playlist } from '../../store/usePlaylistStore';
import type { CatalogSort, VtuberSummary } from '../../lib/catalogView';
import { songsOfVtuber, type SongIndex, type SongListSort } from '../../lib/songIndex';
import type { VtuberTab } from '../../lib/songsView';
import { AddToPlaylistMenu } from './AddToPlaylistMenu';
import { CatalogView, type CatalogStatus } from './CatalogView';
import { CatalogPending } from './CatalogPending';
import { formatYmd } from './dateText';

const SONG_SORTS: SongListSort[] = ['latest', 'count'];

export const VtuberView = memo(function VtuberView({
    vtuberKey, tab, summary, songIndex, status, videos, visible, onShowMore, sort, onSortChange, playlists, locale, currentCode,
    onTabChange, onGoList, onPlayEntries, onQueue, onOpenSong, onPlaySong, onPlayAll, onOpenVideo,
}: {
    vtuberKey: string;
    tab: VtuberTab;
    /** 左欄清單裡的這位；目錄載入後仍為 undefined＝找不到 */
    summary: VtuberSummary | undefined;
    /** 舊格式目錄為 null：沒有歌單分頁 */
    songIndex: SongIndex | null;
    status: CatalogStatus;
    /** 這位的歌回（已依目錄排序） */
    videos: SongVideo[];
    visible: number;
    onShowMore: () => void;
    sort: CatalogSort;
    onSortChange: (sort: CatalogSort) => void;
    playlists: Playlist[];
    locale: string;
    currentCode: string | null;
    onTabChange: (tab: VtuberTab) => void;
    onGoList: () => void;
    onPlayEntries: (entries: SongEntry[], startCode?: string) => void;
    onQueue: (segment: SongSegment) => void;
    onOpenSong: (songId: number, from: string | null) => void;
    onPlaySong: (video: SongVideo, segment: SongSegment) => void;
    onPlayAll: (video: SongVideo) => void;
    onOpenVideo: (video: SongVideo) => void;
}) {
    const { t } = useTranslation('songs');
    const [songSort, setSongSort] = useState<SongListSort>('latest');
    const rows = useMemo(
        () => (songIndex ? songsOfVtuber(songIndex, vtuberKey, songSort) : []),
        [songIndex, vtuberKey, songSort],
    );
    const latestEntries = useMemo(() => rows.map((r) => r.versions[0]).filter((e): e is SongEntry => !!e), [rows]);

    if (!status.loaded) {
        return <CatalogPending isError={status.isError} retrying={status.isFetching} onRetry={status.refetch} />;
    }
    if (!summary) {
        return (
            <div className="flex flex-col items-start gap-4">
                <p className="rounded-xl border border-dashed border-input px-4 py-12 text-center text-sm text-muted-foreground self-stretch">{t('vtuber.notFound')}</p>
                <Button variant="outline" onClick={onGoList}>{t('video.back')}</Button>
            </div>
        );
    }

    const hasSongs = songIndex !== null;
    const songCount = hasSongs ? rows.length : summary.songCount;

    const videosContent = (
        <CatalogView
            status={status}
            videos={videos}
            visible={visible}
            onShowMore={onShowMore}
            sort={sort}
            onSortChange={onSortChange}
            playlists={playlists}
            locale={locale}
            onPlaySong={onPlaySong}
            onPlayAll={onPlayAll}
            onQueue={onQueue}
            onOpen={onOpenVideo}
        />
    );

    const songsContent = (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
                <div role="group" aria-label={t('catalog.sort.label')} className="inline-flex w-fit rounded-full bg-muted p-0.5">
                    {SONG_SORTS.map((key) => (
                        <Button
                            key={key}
                            type="button"
                            size="sm"
                            variant="ghost"
                            className={cn('h-8 rounded-full px-3.5', songSort === key ? 'bg-foreground text-background hover:bg-foreground/90 hover:text-background' : 'text-foreground/80')}
                            aria-pressed={songSort === key}
                            onClick={() => setSongSort(key)}
                        >
                            {key === 'latest' ? t('catalog.sort.latest') : t('vtuber.sort.count')}
                        </Button>
                    ))}
                </div>
                <Button size="sm" className="ml-auto h-8" onClick={() => onPlayEntries(latestEntries)} disabled={latestEntries.length === 0}>
                    <Play className="size-3.5" aria-hidden="true" />
                    {t('catalog.playAll')}
                </Button>
            </div>
            <ol className="flex flex-col">
                {rows.map((row) => {
                    const latest = row.versions[0];
                    if (!latest) return null;
                    const isCurrent = row.versions.some((e) => e.segment.code === currentCode);
                    const lastSung = formatYmd(row.latestAt);
                    return (
                        <li
                            key={row.song.id}
                            aria-current={isCurrent ? 'true' : undefined}
                            className={cn('flex items-center gap-1 rounded-lg border-t border-border/60 px-2 py-2 first:border-t-0', isCurrent && 'bg-muted')}
                        >
                            <div className="min-w-0 flex-1">
                                <button
                                    type="button"
                                    onClick={() => onOpenSong(row.song.id, vtuberKey)}
                                    className={cn('block max-w-full truncate rounded-sm text-left text-sm font-medium hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', isCurrent && 'text-primary')}
                                >
                                    {row.song.title}
                                </button>
                                <p className="truncate text-xs text-muted-foreground">
                                    {[
                                        row.song.artist,
                                        t('song.versionCount', { count: row.versions.length }),
                                        lastSung ? t('vtuber.lastSung', { date: lastSung }) : null,
                                    ].filter(Boolean).join('・')}
                                </p>
                            </div>
                            <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" onClick={() => onPlayEntries(latestEntries, latest.segment.code)} aria-label={`${t('catalog.play')}：${row.song.title}`} title={t('catalog.play')}>
                                <Play className="size-3.5" aria-hidden="true" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" onClick={() => onQueue(latest.segment)} aria-label={`${t('catalog.addToQueue')}：${row.song.title}`} title={t('catalog.addToQueue')}>
                                <ListPlus className="size-3.5" aria-hidden="true" />
                            </Button>
                            <AddToPlaylistMenu codes={[latest.segment.code]} playlists={playlists} className="rounded-full" />
                        </li>
                    );
                })}
            </ol>
        </div>
    );

    return (
        <article aria-labelledby="songs-vtuber-h" className="flex flex-col gap-5">
            <header className="flex items-end gap-4 sm:gap-6">
                {summary.img ? (
                    <img src={summary.img} alt="" width={168} height={168} className="size-24 shrink-0 rounded-full object-cover sm:size-[168px]" />
                ) : (
                    <span className="flex size-24 shrink-0 items-center justify-center rounded-full bg-muted text-4xl font-black text-primary sm:size-[168px] sm:text-[64px]" aria-hidden="true">
                        {Array.from(summary.name)[0] ?? <Music2 className="size-10 text-muted-foreground" />}
                    </span>
                )}
                <div className="flex min-w-0 flex-col gap-2">
                    <span className="text-xs font-bold text-muted-foreground">{t('nav.vtubers')}</span>
                    <h2 id="songs-vtuber-h" tabIndex={-1} className="text-xl font-black leading-tight focus:outline-none sm:text-[32px] sm:leading-[1.25]">{summary.name}</h2>
                    <p className="text-[13px] text-foreground/80">{t('vtuber.summary', { songs: songCount, videos: summary.videoCount })}</p>
                </div>
            </header>

            {hasSongs ? (
                <Tabs value={tab} onValueChange={(v: string) => onTabChange(v === 'videos' ? 'videos' : 'songs')} className="gap-4">
                    <TabsList aria-label={t('vtuber.tabs')} className="h-10 w-fit rounded-full p-1">
                        <TabsTrigger value="songs" className="rounded-full px-4">{t('vtuber.tab.songs')}</TabsTrigger>
                        <TabsTrigger value="videos" className="rounded-full px-4">{t('vtuber.tab.videos')}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="songs">{songsContent}</TabsContent>
                    <TabsContent value="videos">{videosContent}</TabsContent>
                </Tabs>
            ) : (
                videosContent
            )}
        </article>
    );
});
