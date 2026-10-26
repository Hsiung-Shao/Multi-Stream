/**
 * 中欄單曲頁：標準歌名、「N 個版本・M 位 VTuber」、全部播放，版本依 VTuber 分組（from 那位排第一，規則見 versionsOfSong）。
 * 每個版本：來源歌回（點了進單場）、開台日期、版本備註、長度、播放次數，以及播放這個版本、加入佇列、加入歌單。
 * 整首的佇列＝所有版本（flattenVersions）；「播放這個版本」從該版本開始播。
 */
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ListPlus, Music2, Play } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../components/ui/utils';
import type { SongEntry, SongSegment, SongVideo } from '../../songsSource';
import type { Playlist } from '../../store/usePlaylistStore';
import { flattenVersions, versionsOfSong, type SongIndex } from '../../lib/songIndex';
import { formatTimecode } from '../../lib/timecode';
import { AddToPlaylistMenu } from './AddToPlaylistMenu';
import { CatalogPending } from './CatalogPending';
import type { CatalogStatus } from './CatalogView';
import { VersionNoteTag } from './VersionNoteTag';
import { formatYmd } from './dateText';

export const SongView = memo(function SongView({
    songId, from, songIndex, status, playlists, locale, currentCode, onBack, onGoList, onPlayEntries, onQueue, onOpenVideo,
}: {
    songId: number;
    from: string | null;
    /** 舊格式目錄為 null：一律找不到 */
    songIndex: SongIndex | null;
    status: CatalogStatus;
    playlists: Playlist[];
    locale: string;
    currentCode: string | null;
    onBack: () => void;
    onGoList: () => void;
    onPlayEntries: (entries: SongEntry[], startCode?: string) => void;
    onQueue: (segment: SongSegment) => void;
    onOpenVideo: (video: SongVideo) => void;
}) {
    const { t } = useTranslation('songs');
    const groups = useMemo(() => (songIndex ? versionsOfSong(songIndex, songId, from) : []), [songIndex, songId, from]);
    const flat = useMemo(() => flattenVersions(groups), [groups]);
    const song = songIndex?.songs.get(songId);

    if (!status.loaded) {
        return <CatalogPending isError={status.isError} retrying={status.isFetching} onRetry={status.refetch} />;
    }
    if (!song || flat.length === 0) {
        return (
            <div className="flex flex-col items-start gap-4">
                <p className="self-stretch rounded-xl border border-dashed border-input px-4 py-12 text-center text-sm text-muted-foreground">{t('song.notFound')}</p>
                <Button variant="outline" onClick={onGoList}>{t('video.back')}</Button>
            </div>
        );
    }

    const vtuberCount = groups.filter((g) => g.key !== null).length;

    return (
        <article aria-labelledby="songs-song-h" className="flex flex-col gap-5">
            <Button variant="ghost" size="sm" className="-ml-2 h-8 self-start text-foreground/80" onClick={onBack}>
                <ChevronLeft className="size-4" aria-hidden="true" />
                {t('song.back')}
            </Button>
            <header className="flex items-end gap-4 sm:gap-6">
                <span className="flex size-24 shrink-0 items-center justify-center rounded-[10px] bg-muted sm:size-[168px]" aria-hidden="true">
                    <Music2 className="size-10 text-primary sm:size-16" />
                </span>
                <div className="flex min-w-0 flex-col gap-2">
                    <span className="text-xs font-bold text-muted-foreground">{t('song.kicker')}</span>
                    <h2 id="songs-song-h" tabIndex={-1} className="text-xl font-black leading-tight focus:outline-none sm:text-[32px] sm:leading-[1.25]">{song.title}</h2>
                    <p className="text-[13px] text-foreground/80">
                        {song.artist && <><span className="font-bold text-foreground">{song.artist}</span>・</>}
                        {t('song.summary', { versions: flat.length, vtubers: vtuberCount })}
                    </p>
                </div>
            </header>
            <Button className="h-10 self-start rounded-full px-5" onClick={() => onPlayEntries(flat)}>
                <Play className="size-4 fill-current" aria-hidden="true" />
                {t('catalog.playAll')}
            </Button>

            {groups.map((group, gi) => {
                const headingId = `songs-song-g-${gi}`;
                return (
                    <section key={group.key ?? '__none'} aria-labelledby={headingId} className="flex flex-col gap-1.5">
                        <h3 id={headingId} className="text-sm font-bold">{group.vtuber?.name ?? t('catalog.unknownVtuber')}</h3>
                        <ol className="flex flex-col">
                            {group.versions.map((entry) => {
                                const seg = entry.segment;
                                const isCurrent = seg.code === currentCode;
                                const date = formatYmd(entry.video.streamedAt);
                                return (
                                    <li
                                        key={seg.code}
                                        aria-current={isCurrent ? 'true' : undefined}
                                        className={cn('flex items-center gap-1 rounded-lg border-t border-border/60 px-2 py-2 first:border-t-0', isCurrent && 'bg-muted')}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <button
                                                type="button"
                                                onClick={() => onOpenVideo(entry.video)}
                                                className={cn('block max-w-full truncate rounded-sm text-left text-sm font-medium hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', isCurrent && 'text-primary')}
                                            >
                                                {entry.video.title}
                                            </button>
                                            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
                                                {date && <span>{date}</span>}
                                                {seg.versionNote && <VersionNoteTag note={seg.versionNote} />}
                                                <span>{formatTimecode(seg.end - seg.start)}</span>
                                                {seg.plays > 0 && <span>{t('catalog.plays', { count: seg.plays.toLocaleString(locale) })}</span>}
                                            </p>
                                        </div>
                                        <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" onClick={() => onPlayEntries(flat, seg.code)} aria-label={t('song.playVersion')} title={t('song.playVersion')}>
                                            <Play className="size-3.5" aria-hidden="true" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" onClick={() => onQueue(seg)} aria-label={t('catalog.addToQueue')} title={t('catalog.addToQueue')}>
                                            <ListPlus className="size-3.5" aria-hidden="true" />
                                        </Button>
                                        <AddToPlaylistMenu codes={[seg.code]} playlists={playlists} className="rounded-full" />
                                    </li>
                                );
                            })}
                        </ol>
                    </section>
                );
            })}
        </article>
    );
});
