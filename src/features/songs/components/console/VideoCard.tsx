import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, ListPlus, Music2, Pencil, Play } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import type { SongSegment, SongVideo } from '../../songsSource';
import type { Playlist } from '../../store/usePlaylistStore';
import { formatTimecode } from '../../lib/timecode';
import { videoPlays } from '../../lib/catalogView';
import { PAGE_PATHS } from '../../../../config/routes';
import { AddToPlaylistMenu } from './AddToPlaylistMenu';

/** 目錄卡片：標題是按鈕，點了進單場詳細畫面（曲目表）；handler 由頁面以 useCallback 穩定傳入（memo） */
export const VideoCard = memo(function VideoCard({ video, playlists, locale, onPlaySong, onPlayAll, onQueue, onOpen }: {
    video: SongVideo;
    playlists: Playlist[];
    locale: string;
    onPlaySong: (video: SongVideo, segment: SongSegment) => void;
    onPlayAll: (video: SongVideo) => void;
    onQueue: (segment: SongSegment) => void;
    onOpen: (video: SongVideo) => void;
}) {
    const { t } = useTranslation('songs');
    const date = video.streamedAt ? new Date(video.streamedAt) : null;
    const totalPlays = videoPlays(video);
    return (
        <li className="rounded-xl bg-popover p-3 sm:p-4">
            <div className="flex items-start gap-3">
                {video.vtuber?.img ? (
                    <img src={video.vtuber.img} alt="" width={40} height={40} loading="lazy" className="size-10 shrink-0 rounded-full object-cover" />
                ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden="true"><Music2 className="size-4 text-muted-foreground" /></span>
                )}
                <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-[15px] font-bold leading-snug">
                        <button
                            type="button"
                            onClick={() => onOpen(video)}
                            className="rounded-sm text-left hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {video.title}
                        </button>
                    </h3>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                        {[video.vtuber?.name ?? t('catalog.unknownVtuber'), date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(locale) : null]
                            .filter(Boolean)
                            .join(' · ')}
                        {' · '}
                        {t('catalog.songCount', { count: video.segments.length })}
                        {totalPlays > 0 && <>{' · '}{t('catalog.totalPlays', { count: totalPlays.toLocaleString(locale) })}</>}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" className="h-8" onClick={() => onPlayAll(video)} disabled={video.segments.length === 0} aria-label={t('catalog.playAll')}>
                        <Play className="size-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">{t('catalog.playAll')}</span>
                    </Button>
                    <a
                        href={`https://www.youtube.com/watch?v=${video.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('catalog.openOnYoutube')}
                        title={t('catalog.openOnYoutube')}
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                    {/* 整頁導覽：投稿頁 mount 後才讀 ?v=（站內切頁會被路由同步把 query 清掉） */}
                    <a
                        href={`${PAGE_PATHS.songsSubmit}?v=${video.videoId}`}
                        aria-label={t('catalog.fixTimeline')}
                        title={t('catalog.fixTimeline')}
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <Pencil className="size-3.5" aria-hidden="true" />
                    </a>
                </div>
            </div>
            <ol className="mt-2 flex flex-col">
                {video.segments.map((seg) => (
                    <li key={seg.code} className="flex items-center gap-1 border-t border-border/60 py-1 first:border-t-0">
                        <span className="w-14 shrink-0 text-[12px] tabular-nums text-muted-foreground">{formatTimecode(seg.start)}</span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{seg.title}</span>
                            {seg.artist && <span className="block truncate text-[12px] text-muted-foreground">{seg.artist}</span>}
                        </span>
                        {/* 固定寬度欄：0 次留白，版面不因有無次數而跳動 */}
                        <span
                            className="w-12 shrink-0 text-right text-[11.5px] tabular-nums text-muted-foreground"
                            title={seg.plays > 0 ? t('catalog.plays', { count: seg.plays.toLocaleString(locale) }) : undefined}
                        >
                            {seg.plays > 0 ? <><span aria-hidden="true">▶ </span>{seg.plays.toLocaleString(locale)}<span className="sr-only left-0 top-0">{t('catalog.playsUnit')}</span></> : null}
                        </span>
                        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => onPlaySong(video, seg)} aria-label={`${t('catalog.play')}：${seg.title}`} title={t('catalog.play')}>
                            <Play className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => onQueue(seg)} aria-label={`${t('catalog.addToQueue')}：${seg.title}`} title={t('catalog.addToQueue')}>
                            <ListPlus className="size-3.5" aria-hidden="true" />
                        </Button>
                        <AddToPlaylistMenu codes={[seg.code]} playlists={playlists} />
                    </li>
                ))}
            </ol>
        </li>
    );
});
