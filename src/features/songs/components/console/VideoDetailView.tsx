/**
 * 中欄單場詳細畫面：返回、168px 頭像、標題與統計、動作鈕（播放這場歌回、加到歌單、分享、修正時間軸、YouTube）、
 * 直播聊天提醒條、曲目表。「整場」顯示歌曲總長（實際聽得到的長度），影片跨度放在 title 提示。
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ExternalLink, Info, Loader2, Music2, Pencil, Play, RefreshCw, Share2 } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../components/ui/utils';
import type { SongSegment, SongVideo } from '../../songsSource';
import type { Playlist } from '../../store/usePlaylistStore';
import { videoPlays } from '../../lib/catalogView';
import { songsDuration, videoSpan } from '../../lib/videoTimeline';
import { formatTimecode } from '../../lib/timecode';
import { PAGE_PATHS } from '../../../../config/routes';
import { AddToPlaylistMenu } from './AddToPlaylistMenu';
import { TrackTable } from './TrackTable';
import { shareSongCodes } from './shareLink';

const pillClass = 'inline-flex h-[34px] items-center gap-1.5 rounded-full border border-input px-3.5 text-[13px] text-foreground/80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export const VideoDetailView = memo(function VideoDetailView({
    video, loading, loadError, retrying, onRetry, currentCode, playlists, locale, onBack, onPlayAll, onPlaySong, onQueue,
}: {
    /** undefined＝目錄還在載入、載入失敗或找不到這場 */
    video: SongVideo | undefined;
    loading: boolean;
    /** 目錄載入失敗：顯示與列表相同的錯誤與重試，不說「找不到」 */
    loadError: boolean;
    retrying: boolean;
    onRetry: () => void;
    currentCode: string | null;
    playlists: Playlist[];
    locale: string;
    onBack: () => void;
    onPlayAll: (video: SongVideo) => void;
    onPlaySong: (video: SongVideo, segment: SongSegment) => void;
    onQueue: (segment: SongSegment) => void;
}) {
    const { t } = useTranslation('songs');

    const back = (
        <Button variant="ghost" size="sm" className="-ml-2 h-8 self-start text-foreground/80" onClick={onBack}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            {t('video.back')}
        </Button>
    );

    if (!video) {
        return (
            <article className="flex flex-col gap-4">
                {back}
                {loadError ? (
                    <div className="flex flex-wrap items-center gap-4 rounded-xl bg-popover p-6">
                        <p role="alert" className="flex-1 font-bold">{t('catalog.loadError')}</p>
                        <Button variant="outline" onClick={onRetry} disabled={retrying}>
                            <RefreshCw className={cn('size-3.5', retrying && 'animate-spin')} aria-hidden="true" />
                            {t('catalog.retry')}
                        </Button>
                    </div>
                ) : loading ? (
                    <p role="status" className="flex min-h-[160px] items-center justify-center gap-2 rounded-xl bg-popover text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        {t('catalog.loading')}
                    </p>
                ) : (
                    <p className="rounded-xl border border-dashed border-input px-4 py-12 text-center text-sm text-muted-foreground">{t('video.notFound')}</p>
                )}
            </article>
        );
    }

    const date = video.streamedAt ? new Date(video.streamedAt) : null;
    const totalPlays = videoPlays(video);
    const codes = video.segments.map((s) => s.code);
    const duration = formatTimecode(songsDuration(video.segments));
    const vtuber = video.vtuber;

    return (
        <article aria-labelledby="songs-video-h" className="flex flex-col gap-4">
            {back}
            <header className="flex items-end gap-4 sm:gap-6">
                {vtuber?.img ? (
                    <img src={vtuber.img} alt="" width={168} height={168} className="size-24 shrink-0 rounded-[10px] object-cover sm:size-[168px]" />
                ) : (
                    <span className="flex size-24 shrink-0 items-center justify-center rounded-[10px] bg-muted text-4xl font-black text-primary sm:size-[168px] sm:text-[64px]" aria-hidden="true">
                        {vtuber ? Array.from(vtuber.name)[0] : <Music2 className="size-10 text-muted-foreground" />}
                    </span>
                )}
                <div className="flex min-w-0 flex-col gap-2">
                    <span className="text-xs font-bold text-muted-foreground">{t('nav.songs')}</span>
                    <h2 id="songs-video-h" tabIndex={-1} className="text-xl font-black leading-tight focus:outline-none sm:text-[32px] sm:leading-[1.25]">{video.title}</h2>
                    <p className="text-[13px] text-foreground/80">
                        <span className="font-bold text-foreground">{vtuber?.name ?? t('catalog.unknownVtuber')}</span>
                        {date && !Number.isNaN(date.getTime()) && <>・{date.toLocaleDateString(locale)}</>}
                        ・{t('catalog.songCount', { count: video.segments.length })}
                        ・<span title={t('video.spanHint', { songs: duration, span: formatTimecode(videoSpan(video.segments)) })}>{t('video.duration', { time: duration })}</span>
                        {totalPlays > 0 && <>・{t('catalog.totalPlays', { count: totalPlays.toLocaleString(locale) })}</>}
                    </p>
                </div>
            </header>

            <div className="flex flex-wrap items-center gap-3.5">
                <Button
                    size="icon"
                    className="size-14 rounded-full"
                    onClick={() => onPlayAll(video)}
                    disabled={video.segments.length === 0}
                    aria-label={t('video.playAll')}
                    title={t('video.playAll')}
                >
                    <Play className="size-[22px] fill-current" aria-hidden="true" />
                </Button>
                <AddToPlaylistMenu codes={codes} playlists={playlists} pill />
                <button type="button" className={pillClass} onClick={() => void shareSongCodes(codes, t)} disabled={codes.length === 0}>
                    <Share2 className="size-3.5" aria-hidden="true" />
                    {t('playlists.share')}
                </button>
                {/* 整頁導覽：投稿頁 mount 後才讀 ?v=（站內切頁會被路由同步把 query 清掉） */}
                <a href={`${PAGE_PATHS.songsSubmit}?v=${video.videoId}`} className={pillClass}>
                    <Pencil className="size-3.5" aria-hidden="true" />
                    {t('catalog.fixTimeline')}
                </a>
                <a
                    href={`https://www.youtube.com/watch?v=${video.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('catalog.openOnYoutube')}
                    title={t('catalog.openOnYoutube')}
                    className="inline-flex size-[34px] items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    <ExternalLink className="size-4" aria-hidden="true" />
                </a>
            </div>

            <div role="note" className="flex items-center gap-2.5 rounded-[10px] bg-popover px-3.5 py-2.5 text-xs leading-relaxed text-foreground/80">
                <Info className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{t('video.chatNote')}</span>
            </div>

            <TrackTable video={video} currentCode={currentCode} playlists={playlists} onPlaySong={onPlaySong} onQueue={onQueue} />
        </article>
    );
});
