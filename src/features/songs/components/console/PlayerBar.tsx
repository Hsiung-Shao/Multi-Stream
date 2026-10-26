/**
 * 底部播放列：全頁唯一的播放／暫停、上一首、下一首、循環、隨機、播放進度與音量。
 * 桌機 88px 三段（目前歌曲｜控制＋進度｜音量）；手機約 72px（進度條一行＋歌名與五顆控制鈕，音量交給系統音量鍵）。
 * 右欄與中欄都不放第二份播放鍵或進度條，避免兩份狀態不同步。
 */
import { useTranslation } from 'react-i18next';
import { Music2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../components/ui/utils';
import type { SongCatalog } from '../../songsSource';
import type { SegmentPlayer } from '../../hooks/useSegmentPlayer';
import type { Playlist } from '../../store/usePlaylistStore';
import type { RepeatMode } from '../../lib/queue';
import { SeekBar } from './SeekBar';
import { VolumeControl } from './VolumeControl';
import { AddToPlaylistMenu } from './AddToPlaylistMenu';

const REPEAT_NEXT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };

export function PlayerBar({ player, catalog, playlists, narrow }: {
    player: SegmentPlayer;
    catalog: SongCatalog | undefined;
    playlists: Playlist[];
    narrow: boolean;
}) {
    const { t } = useTranslation('songs');
    const { queue, current } = player;
    const entry = current ? catalog?.byCode.get(current.code) : undefined;
    const hasQueue = queue.items.length > 0;
    const repeatLabel = t(`controls.repeat.${queue.repeat}`);
    const playLabel = player.isPlaying ? t('controls.pause') : t('controls.play');
    const vtuber = entry?.video.vtuber ?? null;

    const playButton = (
        <Button
            size="icon"
            className="size-10 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90"
            onClick={player.togglePlay}
            disabled={!hasQueue || queue.allFailed}
            aria-label={playLabel}
            title={playLabel}
        >
            {player.isPlaying ? <Pause className="size-[18px] fill-current" aria-hidden="true" /> : <Play className="size-[18px] fill-current" aria-hidden="true" />}
        </Button>
    );
    const prevButton = (
        <Button variant="ghost" size="icon" className="size-9 shrink-0 rounded-full" onClick={player.prev} disabled={!hasQueue} aria-label={t('controls.prev')} title={t('controls.prev')}>
            <SkipBack className="size-[19px]" aria-hidden="true" />
        </Button>
    );
    const nextButton = (
        <Button variant="ghost" size="icon" className="size-9 shrink-0 rounded-full" onClick={player.next} disabled={!hasQueue} aria-label={t('controls.next')} title={t('controls.next')}>
            <SkipForward className="size-[19px]" aria-hidden="true" />
        </Button>
    );
    const shuffleButton = (
        <Button
            variant="ghost"
            size="icon"
            className={cn('size-9 rounded-full', queue.shuffle ? 'text-primary' : 'text-muted-foreground')}
            onClick={() => player.setShuffle(!queue.shuffle)}
            aria-pressed={queue.shuffle}
            aria-label={t('controls.shuffle')}
            title={t('controls.shuffle')}
        >
            <Shuffle className="size-[17px]" aria-hidden="true" />
        </Button>
    );
    const repeatButton = (
        <Button
            variant="ghost"
            size="icon"
            className={cn('size-9 rounded-full', queue.repeat !== 'off' ? 'text-primary' : 'text-muted-foreground')}
            onClick={() => player.setRepeat(REPEAT_NEXT[queue.repeat])}
            aria-label={repeatLabel}
            title={repeatLabel}
        >
            {queue.repeat === 'one' ? <Repeat1 className="size-[17px]" aria-hidden="true" /> : <Repeat className="size-[17px]" aria-hidden="true" />}
        </Button>
    );
    const nowText = (
        <span className="flex min-w-0 flex-col">
            {entry ? (
                <>
                    <span className="truncate text-sm font-bold">{entry.segment.title}</span>
                    <span className="truncate text-xs text-muted-foreground">
                        {[entry.segment.artist, vtuber?.name].filter(Boolean).join('・')}
                    </span>
                </>
            ) : (
                <span className="truncate text-sm text-muted-foreground">{t('now.none')}</span>
            )}
        </span>
    );

    return (
        <section
            aria-label={t('bar.label')}
            className={cn(
                'shrink-0 bg-background pb-[env(safe-area-inset-bottom)]',
                narrow
                    ? 'flex flex-col gap-1 border-t border-border px-3 pt-1.5'
                    : 'grid h-[88px] grid-cols-[minmax(0,340px)_minmax(0,1fr)_minmax(0,340px)] items-center gap-6 px-3 xl:px-5',
            )}
        >
            {narrow ? (
                <>
                    <SeekBar player={player} />
                    <div className="flex h-12 items-center gap-1">
                        <div className="min-w-0 flex-1">{nowText}</div>
                        {shuffleButton}
                        {prevButton}
                        {playButton}
                        {nextButton}
                        {repeatButton}
                    </div>
                </>
            ) : (
                <>
                    <div className="flex min-w-0 items-center gap-3">
                        {vtuber?.img ? (
                            <img src={vtuber.img} alt="" width={56} height={56} loading="lazy" className="size-14 shrink-0 rounded-lg object-cover" />
                        ) : (
                            <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted text-xl font-black text-primary" aria-hidden="true">
                                {vtuber ? Array.from(vtuber.name)[0] : <Music2 className="size-5 text-muted-foreground" />}
                            </span>
                        )}
                        {nowText}
                        {entry && <AddToPlaylistMenu codes={[entry.segment.code]} playlists={playlists} className="rounded-full border border-input" />}
                    </div>
                    <div className="flex min-w-0 flex-col items-center gap-1.5">
                        <div className="flex items-center gap-3.5">
                            {shuffleButton}
                            {prevButton}
                            {playButton}
                            {nextButton}
                            {repeatButton}
                        </div>
                        <SeekBar player={player} className="w-full max-w-[560px]" />
                    </div>
                    <div className="flex items-center justify-end">
                        <VolumeControl player={player} />
                    </div>
                </>
            )}
        </section>
    );
}
