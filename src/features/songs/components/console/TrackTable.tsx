/**
 * 單場曲目表：# ｜歌名＋原唱｜開始｜長度｜操作。目前播放那首的 <tr> 帶 aria-current="true" 並以薄荷色標示。
 * 逐首按鈕名稱帶歌名（「播放：歌名」），全頁名稱剛好是「播放」的按鈕只有底部播放列那一顆。
 * v1.3：歌名旁顯示版本備註；這首歌全站版本數 ≥2 時，原唱下方有「N 個版本」可進單曲頁（from＝這場的 VTuber）。
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ListPlus, Music2, Play } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../components/ui/utils';
import type { SongSegment, SongVideo } from '../../songsSource';
import type { SongIndex } from '../../lib/songIndex';
import { vtuberKey } from '../../lib/catalogView';
import type { Playlist } from '../../store/usePlaylistStore';
import { formatTimecode } from '../../lib/timecode';
import { AddToPlaylistMenu } from './AddToPlaylistMenu';
import { VersionNoteTag } from './VersionNoteTag';

export const TrackTable = memo(function TrackTable({ video, currentCode, playlists, songIndex, onPlaySong, onQueue, onOpenSong }: {
    video: SongVideo;
    currentCode: string | null;
    playlists: Playlist[];
    /** 舊格式目錄為 null：不顯示「N 個版本」 */
    songIndex: SongIndex | null;
    onPlaySong: (video: SongVideo, segment: SongSegment) => void;
    onQueue: (segment: SongSegment) => void;
    onOpenSong: (songId: number, from: string | null) => void;
}) {
    const { t } = useTranslation('songs');
    const from = video.vtuber ? vtuberKey(video.vtuber) : null;
    const th = 'h-9 border-b border-border px-2 text-left text-xs font-normal text-muted-foreground';
    return (
        <table className="w-full table-fixed border-separate border-spacing-0">
            <caption className="sr-only">{t('video.tracklist')}</caption>
            <colgroup>
                <col className="w-10" />
                <col />
                <col className="w-[90px] max-sm:w-0" />
                <col className="w-[70px]" />
                <col className="w-[120px]" />
            </colgroup>
            <thead>
                <tr>
                    <th scope="col" className={th}>#</th>
                    <th scope="col" className={th}>{t('editor.col.title')}</th>
                    <th scope="col" className={cn(th, 'max-sm:hidden')}>{t('editor.col.start')}</th>
                    <th scope="col" className={th}>{t('track.length')}</th>
                    <th scope="col" className={th}><span className="sr-only left-0 top-0">{t('editor.col.actions')}</span></th>
                </tr>
            </thead>
            <tbody>
                {video.segments.map((seg, i) => {
                    const isCurrent = seg.code === currentCode;
                    const songId = seg.songId;
                    const versionCount = songId !== null ? (songIndex?.versions.get(songId)?.length ?? 0) : 0;
                    const td = cn('h-[52px] px-2 align-middle', isCurrent && 'bg-muted first:rounded-l-lg last:rounded-r-lg');
                    return (
                        <tr key={seg.code} aria-current={isCurrent ? 'true' : undefined}>
                            <td className={cn(td, 'font-mono text-[13px]', isCurrent ? 'text-primary' : 'text-muted-foreground')}>
                                {isCurrent ? <Music2 className="size-3.5" aria-hidden="true" /> : i + 1}
                            </td>
                            <td className={td}>
                                <span className="flex min-w-0 items-center gap-1.5">
                                    <span className={cn('truncate text-sm', isCurrent ? 'font-bold text-primary' : 'font-medium')}>{seg.title}</span>
                                    {seg.versionNote && <VersionNoteTag note={seg.versionNote} />}
                                </span>
                                {seg.artist && <span className="block truncate text-xs text-muted-foreground">{seg.artist}</span>}
                                {songId !== null && versionCount >= 2 && (
                                    <button
                                        type="button"
                                        onClick={() => onOpenSong(songId, from)}
                                        className="rounded-sm text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        {t('song.versionCount', { count: versionCount })}
                                    </button>
                                )}
                            </td>
                            <td className={cn(td, 'font-mono text-xs text-muted-foreground max-sm:hidden')}>{formatTimecode(seg.start)}</td>
                            <td className={cn(td, 'font-mono text-xs text-muted-foreground')}>{formatTimecode(seg.end - seg.start)}</td>
                            <td className={cn(td, 'px-0')}>
                                <div className="flex items-center justify-end gap-0.5">
                                    <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" onClick={() => onPlaySong(video, seg)} aria-label={`${t('catalog.play')}：${seg.title}`} title={t('catalog.play')}>
                                        <Play className="size-3.5" aria-hidden="true" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" onClick={() => onQueue(seg)} aria-label={`${t('catalog.addToQueue')}：${seg.title}`} title={t('catalog.addToQueue')}>
                                        <ListPlus className="size-3.5" aria-hidden="true" />
                                    </Button>
                                    <AddToPlaylistMenu codes={[seg.code]} playlists={playlists} className="rounded-full" />
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
});
