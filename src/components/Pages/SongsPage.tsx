// 歌曲播放清單（/songs）：VTuber 歌回片段連續播放、本地歌單、分享連結。
//
// - 播放器是 YouTube 官方嵌入播放器（useSegmentPlayer），必須可見、不可被任何元素覆蓋：「點此播放」與錯誤提示都放在播放器下方。
// - 目錄來自 /api/songs/catalog（edge 快取 10 分鐘），搜尋在 client 端過濾 VTuber、歌回標題、歌名、原唱。
// - 歌單存在 localStorage（usePlaylistStore）；預渲染時 render 本體不碰 window／localStorage，
//   歌單與播放器都在 mount 之後才讀（mounted 旗標），server 與 client 首輪 render 同形。
// - 分享連結 ?list=code.code… 由 App 在啟動時快照、清掉 query 後以 shareCodes 傳進來；目錄到了才解析成佇列。
// - SEO（WebPage + Breadcrumb）由 App.tsx 統一處理；預渲染只輸出殼層（SSR 的 QueryClient 不抓資料），殼層要有 h1 與各區標題。

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
    ChevronRight, ChevronUp, ChevronDown, ListPlus, ListMusic, Loader2, MoreHorizontal, Music2, Pause, Play, Plus,
    RefreshCw, Repeat, Repeat1, Search, Share2, Shuffle, SkipBack, SkipForward, Trash2, X, ExternalLink, Pencil,
} from 'lucide-react';
import { StaticPageHeader } from '../StaticPageHeader';
import { RouteLink } from '../Navigation/RouteLink';
import { SiteFooter } from '../SiteFooter';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { cn } from '../ui/utils';
import {
    resolveCodes, toQueueItem, useSongCatalog, type SongCatalog, type SongEntry, type SongSegment, type SongVideo,
} from '../../features/songs/songsSource';
import { useSegmentPlayer, type SegmentPlayer } from '../../features/songs/hooks/useSegmentPlayer';
import { usePlaylistStore, type Playlist } from '../../features/songs/store/usePlaylistStore';
import { serializeSongShare, SONG_SHARE_MAX, SONG_SHARE_PARAM } from '../../features/songs/lib/songShareLink';
import { formatTimecode } from '../../features/songs/lib/timecode';
import type { RepeatMode } from '../../features/songs/lib/queue';
import { PAGE_PATHS } from '../../config/routes';

/** 目錄一次先顯示幾支歌回（其餘按「顯示更多」），避免上千首歌一次渲染 */
const CATALOG_PAGE_SIZE = 20;
const EMPTY_PLAYLISTS: Playlist[] = [];
const REPEAT_NEXT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };

interface SongsPageProps {
    /** 分享連結帶進來的歌曲 code（App 啟動時快照）；null = 沒有分享連結 */
    shareCodes?: string[] | null;
    /** 分享連結已處理完（App 清掉暫存，避免切頁回來重複載入） */
    onShareConsumed?: () => void;
}

interface ShareNotice {
    found: string[];
    missing: number;
    saved: boolean;
}

const normalize = (s: string) => s.normalize('NFKC').toLowerCase();

/** client 端搜尋：VTuber 名稱或歌回標題命中 → 整支歌回；否則只留歌名／原唱命中的歌 */
export function filterCatalog(videos: SongVideo[], query: string): SongVideo[] {
    const q = normalize(query.trim());
    if (!q) return videos;
    const out: SongVideo[] = [];
    for (const video of videos) {
        if (normalize(video.vtuber?.name ?? '').includes(q) || normalize(video.title).includes(q)) {
            out.push(video);
            continue;
        }
        const segments = video.segments.filter(
            (s) => normalize(s.title).includes(q) || normalize(s.artist ?? '').includes(q),
        );
        if (segments.length > 0) out.push({ ...video, segments });
    }
    return out;
}

function useMounted(): boolean {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    return mounted;
}

async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

function shareUrl(codes: string[]): string {
    return `${window.location.origin}${PAGE_PATHS.songs}?${SONG_SHARE_PARAM}=${serializeSongShare(codes)}`;
}

// ---------- 播放器區 ----------

function PlayerPanel({ player, catalog }: { player: SegmentPlayer; catalog: SongCatalog | undefined }) {
    const { t } = useTranslation('songs');
    const { queue, current } = player;
    const entry = current ? catalog?.byCode.get(current.code) : undefined;
    const hasQueue = queue.items.length > 0;
    const repeatLabel = t(`controls.repeat.${queue.repeat}`);

    let notice: string | null = null;
    if (player.playerStatus === 'error') notice = t('player.loadError');
    else if (queue.allFailed) notice = t('player.allFailed');
    else if (player.skipping) notice = t('player.skipping');
    else if (queue.status === 'stopped' && hasQueue) notice = t('player.ended');

    return (
        <section aria-labelledby="songs-player-h" className="min-w-0">
            <h2 id="songs-player-h" className="sr-only">{t('player.label')}</h2>
            {/* 16:9 播放器：桌機寬至少 480、任何寬度高至少 200（YouTube 嵌入政策 200×200，窄手機高度會大於 16:9）；
                最小值多 2px 是扣掉上下／左右 1px 邊框（border-box），量的是裡面的 iframe。
                容器內只有播放器本身，任何提示都放在下方，不覆蓋播放器 */}
            <div className="relative aspect-video min-h-[202px] w-full overflow-hidden rounded-2xl border border-border bg-black md:min-w-[482px]">
                <div ref={player.containerRef} className="absolute inset-0" data-testid="songs-player" />
            </div>
            {!hasQueue && player.playerStatus !== 'error' && (
                <p className="mt-2 text-sm text-muted-foreground">
                    {player.playerStatus === 'loading' ? t('player.loading') : t('player.empty')}
                </p>
            )}

            {player.needsGesture && (
                <Button className="mt-3 w-full" onClick={player.resume}>
                    <Play className="size-4" aria-hidden="true" />
                    {t('player.tapToPlay')}
                </Button>
            )}
            {notice && <p role="status" className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{notice}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="size-10" onClick={player.prev} disabled={!hasQueue} aria-label={t('controls.prev')} title={t('controls.prev')}>
                        <SkipBack className="size-5" aria-hidden="true" />
                    </Button>
                    <Button size="icon" className="size-11 rounded-full" onClick={player.togglePlay} disabled={!hasQueue || queue.allFailed} aria-label={player.isPlaying ? t('controls.pause') : t('controls.play')} title={player.isPlaying ? t('controls.pause') : t('controls.play')}>
                        {player.isPlaying ? <Pause className="size-5" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="size-10" onClick={player.next} disabled={!hasQueue} aria-label={t('controls.next')} title={t('controls.next')}>
                        <SkipForward className="size-5" aria-hidden="true" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn('size-10', queue.repeat !== 'off' && 'text-violet-600 dark:text-violet-300')}
                        onClick={() => player.setRepeat(REPEAT_NEXT[queue.repeat])}
                        aria-label={repeatLabel}
                        title={repeatLabel}
                    >
                        {queue.repeat === 'one' ? <Repeat1 className="size-5" aria-hidden="true" /> : <Repeat className="size-5" aria-hidden="true" />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn('size-10', queue.shuffle && 'text-violet-600 dark:text-violet-300')}
                        onClick={() => player.setShuffle(!queue.shuffle)}
                        aria-pressed={queue.shuffle}
                        aria-label={t('controls.shuffle')}
                        title={t('controls.shuffle')}
                    >
                        <Shuffle className="size-5" aria-hidden="true" />
                    </Button>
                </div>

                <div className="min-w-0 flex-1" aria-live="polite">
                    {entry ? (
                        <>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('now.label')}</p>
                            <p className="truncate font-bold">{entry.segment.title}</p>
                            <p className="truncate text-[13px] text-muted-foreground">
                                {[entry.segment.artist ? t('now.originalArtist', { artist: entry.segment.artist }) : null, entry.video.vtuber?.name ?? null]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </p>
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">{t('now.none')}</p>
                    )}
                </div>
            </div>
        </section>
    );
}

// ---------- 佇列 ----------

function QueuePanel({ player, catalog, onSaveQueue }: { player: SegmentPlayer; catalog: SongCatalog | undefined; onSaveQueue: () => void }) {
    const { t } = useTranslation('songs');
    const { queue } = player;
    if (queue.items.length === 0) {
        return <p className="px-1 py-8 text-center text-sm text-muted-foreground">{t('queue.empty')}</p>;
    }
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
                <span className="text-[13px] text-muted-foreground">{t('queue.count', { count: queue.items.length })}</span>
                <Button variant="ghost" size="sm" className="ml-auto h-8" onClick={onSaveQueue}>
                    <ListPlus className="size-3.5" aria-hidden="true" />
                    {t('queue.saveAs')}
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={player.clear}>
                    {t('queue.clear')}
                </Button>
            </div>
            <ScrollArea className="h-[340px] lg:h-[420px] [&>div>div]:!block">
                <ol className="flex flex-col gap-0.5 pr-3">
                    {queue.order.map((idx, pos) => {
                        const item = queue.items[idx];
                        if (!item) return null;
                        const entry = catalog?.byCode.get(item.code);
                        const isCurrent = pos === queue.cursor;
                        const unplayable = queue.unplayable.includes(item.videoId);
                        return (
                            <li key={item.code} className={cn('group flex items-center gap-1 rounded-lg', isCurrent && 'bg-violet-500/10')}>
                                <button
                                    type="button"
                                    onClick={() => player.jump(pos)}
                                    aria-current={isCurrent ? 'true' : undefined}
                                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <span className="w-5 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
                                        {isCurrent && player.isPlaying ? <Music2 className="ml-auto size-3.5 text-violet-500" aria-hidden="true" /> : pos + 1}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className={cn('block truncate text-sm', isCurrent && 'font-semibold', unplayable && 'text-muted-foreground line-through')}>
                                            {entry?.segment.title ?? item.code}
                                        </span>
                                        <span className="block truncate text-[12px] text-muted-foreground">
                                            {unplayable ? t('queue.unplayable') : [entry?.segment.artist, entry?.video.vtuber?.name].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                </button>
                                {!isCurrent && (
                                    <Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground" onClick={() => player.remove(pos)} aria-label={t('queue.remove')} title={t('queue.remove')}>
                                        <X className="size-3.5" aria-hidden="true" />
                                    </Button>
                                )}
                            </li>
                        );
                    })}
                </ol>
            </ScrollArea>
        </div>
    );
}

// ---------- 我的歌單 ----------

function PlaylistsPanel({ playlists, catalog, onPlay }: {
    playlists: Playlist[];
    catalog: SongCatalog | undefined;
    onPlay: (playlist: Playlist, startCode?: string) => void;
}) {
    const { t } = useTranslation('songs');
    const createPlaylist = usePlaylistStore((s) => s.createPlaylist);
    const renamePlaylist = usePlaylistStore((s) => s.renamePlaylist);
    const deletePlaylist = usePlaylistStore((s) => s.deletePlaylist);
    const removeFromPlaylist = usePlaylistStore((s) => s.removeFromPlaylist);
    const moveInPlaylist = usePlaylistStore((s) => s.moveInPlaylist);

    const [newName, setNewName] = useState('');
    const [openId, setOpenId] = useState<string | null>(null);
    const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Playlist | null>(null);

    const handleCreate = (e: FormEvent) => {
        e.preventDefault();
        const id = createPlaylist(newName || t('playlists.defaultName', { n: playlists.length + 1 }));
        setNewName('');
        setOpenId(id);
    };

    const handleShare = async (playlist: Playlist) => {
        if (playlist.codes.length === 0) {
            toast(t('playlists.emptyList'));
            return;
        }
        const ok = await copyText(shareUrl(playlist.codes));
        if (!ok) {
            toast.error(t('playlists.copyFailed'));
            return;
        }
        toast.success(t('playlists.copied'), {
            description: playlist.codes.length > SONG_SHARE_MAX ? t('playlists.shareTruncated', { max: SONG_SHARE_MAX }) : undefined,
        });
    };

    const handleRename = (e: FormEvent) => {
        e.preventDefault();
        if (renaming) renamePlaylist(renaming.id, renaming.name);
        setRenaming(null);
    };

    return (
        <div className="flex flex-col gap-3">
            <form onSubmit={handleCreate} className="flex gap-2 px-1">
                <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={t('playlists.newPlaceholder')}
                    aria-label={t('playlists.newPlaceholder')}
                    maxLength={100}
                    className="h-9"
                />
                <Button type="submit" size="sm" className="h-9 shrink-0">
                    <Plus className="size-3.5" aria-hidden="true" />
                    {t('playlists.create')}
                </Button>
            </form>

            {playlists.length === 0 ? (
                <p className="px-1 py-6 text-center text-sm text-muted-foreground">{t('playlists.empty')}</p>
            ) : (
                <ScrollArea className="h-[300px] lg:h-[380px] [&>div>div]:!block">
                    <ul className="flex flex-col gap-2 pr-3">
                        {playlists.map((pl) => {
                            const open = openId === pl.id;
                            return (
                                <li key={pl.id} className="rounded-xl border border-border bg-card/50">
                                    <div className="flex items-center gap-1 p-1.5">
                                        {renaming?.id === pl.id ? (
                                            <form onSubmit={handleRename} className="flex min-w-0 flex-1 gap-1">
                                                <Input
                                                    autoFocus
                                                    value={renaming.name}
                                                    onChange={(e) => setRenaming({ id: pl.id, name: e.target.value })}
                                                    aria-label={t('playlists.rename')}
                                                    maxLength={100}
                                                    className="h-8"
                                                />
                                                <Button type="submit" size="sm" className="h-8">{t('playlists.renameSave')}</Button>
                                                <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setRenaming(null)}>{t('playlists.cancel')}</Button>
                                            </form>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setOpenId(open ? null : pl.id)}
                                                aria-expanded={open}
                                                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                <ListMusic className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                                <span className="min-w-0 flex-1 truncate text-sm font-medium">{pl.name}</span>
                                                <span className="shrink-0 text-[12px] text-muted-foreground">{t('playlists.count', { count: pl.codes.length })}</span>
                                                <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
                                            </button>
                                        )}
                                        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => onPlay(pl)} disabled={pl.codes.length === 0} aria-label={t('playlists.play')} title={t('playlists.play')}>
                                            <Play className="size-3.5" aria-hidden="true" />
                                        </Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={t('playlists.actions')} title={t('playlists.actions')}>
                                                    <MoreHorizontal className="size-3.5" aria-hidden="true" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onSelect={() => void handleShare(pl)}>
                                                    <Share2 className="size-3.5" aria-hidden="true" />
                                                    {t('playlists.share')}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onSelect={() => setRenaming({ id: pl.id, name: pl.name })}>
                                                    <Pencil className="size-3.5" aria-hidden="true" />
                                                    {t('playlists.rename')}
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onSelect={() => setDeleteTarget(pl)} className="text-destructive focus:text-destructive">
                                                    <Trash2 className="size-3.5" aria-hidden="true" />
                                                    {t('playlists.delete')}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                    {open && (
                                        pl.codes.length === 0 ? (
                                            <p className="px-3 pb-3 text-[13px] text-muted-foreground">{t('playlists.emptyList')}</p>
                                        ) : (
                                            <ol className="flex flex-col gap-0.5 px-1.5 pb-1.5">
                                                {pl.codes.map((code, i) => {
                                                    const entry = catalog?.byCode.get(code);
                                                    return (
                                                        <li key={code} className="flex items-center gap-0.5">
                                                            <button
                                                                type="button"
                                                                disabled={!entry}
                                                                onClick={() => onPlay(pl, code)}
                                                                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                            >
                                                                <span className="w-5 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">{i + 1}</span>
                                                                <span className="min-w-0 flex-1">
                                                                    <span className={cn('block truncate text-[13px]', !entry && 'text-muted-foreground')}>
                                                                        {entry ? entry.segment.title : catalog ? t('playlists.missingSong') : code}
                                                                    </span>
                                                                    {entry && (
                                                                        <span className="block truncate text-[11.5px] text-muted-foreground">
                                                                            {[entry.segment.artist, entry.video.vtuber?.name].filter(Boolean).join(' · ')}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            </button>
                                                            <Button variant="ghost" size="icon" className="size-7 shrink-0" disabled={i === 0} onClick={() => moveInPlaylist(pl.id, i, i - 1)} aria-label={t('playlists.moveUp')} title={t('playlists.moveUp')}>
                                                                <ChevronUp className="size-3.5" aria-hidden="true" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="size-7 shrink-0" disabled={i === pl.codes.length - 1} onClick={() => moveInPlaylist(pl.id, i, i + 1)} aria-label={t('playlists.moveDown')} title={t('playlists.moveDown')}>
                                                                <ChevronDown className="size-3.5" aria-hidden="true" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" onClick={() => removeFromPlaylist(pl.id, code)} aria-label={t('playlists.removeItem')} title={t('playlists.removeItem')}>
                                                                <X className="size-3.5" aria-hidden="true" />
                                                            </Button>
                                                        </li>
                                                    );
                                                })}
                                            </ol>
                                        )
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </ScrollArea>
            )}
            <p className="px-1 text-[12px] text-muted-foreground">{t('playlists.localNote')}</p>

            <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('playlists.deleteConfirmTitle', { name: deleteTarget?.name ?? '' })}</AlertDialogTitle>
                        <AlertDialogDescription>{t('playlists.deleteConfirmBody')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('playlists.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={() => {
                                if (deleteTarget) deletePlaylist(deleteTarget.id);
                                if (openId === deleteTarget?.id) setOpenId(null);
                                setDeleteTarget(null);
                            }}
                        >
                            {t('playlists.delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

// ---------- 目錄 ----------

function AddToPlaylistMenu({ code, playlists }: { code: string; playlists: Playlist[] }) {
    const { t } = useTranslation('songs');
    const createPlaylist = usePlaylistStore((s) => s.createPlaylist);
    const addToPlaylist = usePlaylistStore((s) => s.addToPlaylist);
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={t('catalog.addToPlaylist')} title={t('catalog.addToPlaylist')}>
                    <ListMusic className="size-3.5" aria-hidden="true" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-[260px]">
                <DropdownMenuLabel>{t('catalog.addToPlaylist')}</DropdownMenuLabel>
                {playlists.map((pl) => (
                    <DropdownMenuItem
                        key={pl.id}
                        onSelect={() => {
                            addToPlaylist(pl.id, [code]);
                            toast.success(t('catalog.added', { name: pl.name }));
                        }}
                    >
                        <ListMusic className="size-3.5" aria-hidden="true" />
                        <span className="truncate">{pl.name}</span>
                    </DropdownMenuItem>
                ))}
                {playlists.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem
                    onSelect={() => {
                        const name = t('playlists.defaultName', { n: playlists.length + 1 });
                        createPlaylist(name, [code]);
                        toast.success(t('catalog.added', { name }));
                    }}
                >
                    <Plus className="size-3.5" aria-hidden="true" />
                    {t('catalog.newPlaylist')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

const VideoCard = memo(function VideoCard({ video, playlists, locale, onPlaySong, onPlayAll, onQueue }: {
    video: SongVideo;
    playlists: Playlist[];
    locale: string;
    onPlaySong: (video: SongVideo, segment: SongSegment) => void;
    onPlayAll: (video: SongVideo) => void;
    onQueue: (segment: SongSegment) => void;
}) {
    const { t } = useTranslation('songs');
    const date = video.streamedAt ? new Date(video.streamedAt) : null;
    return (
        <li className="rounded-2xl border border-border bg-card/50 p-3 sm:p-4">
            <div className="flex items-start gap-3">
                {video.vtuber?.img ? (
                    <img src={video.vtuber.img} alt="" width={40} height={40} loading="lazy" className="size-10 shrink-0 rounded-full object-cover" />
                ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden="true"><Music2 className="size-4 text-muted-foreground" /></span>
                )}
                <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-[15px] font-bold leading-snug">{video.title}</h3>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                        {[video.vtuber?.name ?? t('catalog.unknownVtuber'), date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(locale) : null]
                            .filter(Boolean)
                            .join(' · ')}
                        {' · '}
                        {t('catalog.songCount', { count: video.segments.length })}
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
                        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => onPlaySong(video, seg)} aria-label={`${t('catalog.play')}：${seg.title}`} title={t('catalog.play')}>
                            <Play className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => onQueue(seg)} aria-label={`${t('catalog.addToQueue')}：${seg.title}`} title={t('catalog.addToQueue')}>
                            <ListPlus className="size-3.5" aria-hidden="true" />
                        </Button>
                        <AddToPlaylistMenu code={seg.code} playlists={playlists} />
                    </li>
                ))}
            </ol>
        </li>
    );
});

// ---------- 頁面 ----------

export function SongsPage({ shareCodes = null, onShareConsumed }: SongsPageProps) {
    const { t, i18n } = useTranslation('songs');
    const locale = i18n.language || 'zh-TW';
    const mounted = useMounted();
    const catalogQuery = useSongCatalog();
    const catalog = catalogQuery.data;
    const player = useSegmentPlayer();
    const storePlaylists = usePlaylistStore((s) => s.playlists);
    const createPlaylist = usePlaylistStore((s) => s.createPlaylist);
    // 歌單在 localStorage：預渲染與 hydration 首輪一律當空，mount 後才顯示
    const playlists = mounted ? storePlaylists : EMPTY_PLAYLISTS;

    const [query, setQuery] = useState('');
    const deferredQuery = useDeferredValue(query);
    const [visible, setVisible] = useState(CATALOG_PAGE_SIZE);
    const [tab, setTab] = useState('queue');
    const [shareNotice, setShareNotice] = useState<ShareNotice | null>(null);

    const filtered = useMemo(() => (catalog ? filterCatalog(catalog.videos, deferredQuery) : []), [catalog, deferredQuery]);
    useEffect(() => setVisible(CATALOG_PAGE_SIZE), [deferredQuery]);

    const { load, append } = player;

    // 分享連結：目錄到了才解析；找不到的 code 略過並提示數量
    useEffect(() => {
        if (!shareCodes || !catalog) return;
        const { found, missing } = resolveCodes(catalog.byCode, shareCodes);
        if (found.length > 0) load(found.map((e) => toQueueItem(e.segment)), { play: false });
        setShareNotice({ found: found.map((e) => e.segment.code), missing, saved: false });
        setTab('queue');
        onShareConsumed?.();
    }, [shareCodes, catalog, load, onShareConsumed]);

    const playEntries = (entries: SongEntry[], startCode?: string) => {
        if (entries.length === 0) return;
        const start = startCode ? Math.max(0, entries.findIndex((e) => e.segment.code === startCode)) : 0;
        load(entries.map((e) => toQueueItem(e.segment)), { startIndex: start });
    };

    // 目錄卡片是 memo：這三個 handler 要穩定，否則每次播放狀態更新都會重畫整個目錄
    const handlePlaySong = useCallback((video: SongVideo, segment: SongSegment) => {
        // 從這首開始播整支歌回（播完接同一場的下一首）
        const index = video.segments.findIndex((s) => s.code === segment.code);
        load(video.segments.map(toQueueItem), { startIndex: Math.max(0, index) });
    }, [load]);
    const handlePlayAll = useCallback((video: SongVideo) => load(video.segments.map(toQueueItem), { startIndex: 0 }), [load]);
    const handleQueue = useCallback((segment: SongSegment) => {
        append([toQueueItem(segment)]);
        toast.success(t('catalog.queued', { title: segment.title }));
    }, [append, t]);

    const handlePlayPlaylist = (playlist: Playlist, startCode?: string) => {
        if (!catalog) return;
        const { found, missing } = resolveCodes(catalog.byCode, playlist.codes);
        if (found.length === 0) {
            toast.error(t('playlists.nothingPlayable'));
            return;
        }
        playEntries(found, startCode);
        if (missing > 0) toast(t('share.missing', { count: missing }));
    };

    const handleSaveQueue = () => {
        const codes = player.queue.order.map((i) => player.queue.items[i]?.code).filter((c): c is string => !!c);
        if (codes.length === 0) return;
        const name = t('playlists.defaultName', { n: playlists.length + 1 });
        createPlaylist(name, codes);
        toast.success(t('queue.saved', { name }));
        setTab('playlists');
    };

    const handleSaveShare = () => {
        if (!shareNotice || shareNotice.found.length === 0) return;
        createPlaylist(t('share.defaultName'), shareNotice.found);
        setShareNotice({ ...shareNotice, saved: true });
        toast.success(t('share.saved'));
    };

    const h2 = 'text-[19px] font-bold sm:text-[22px]';

    return (
        <div className="relative min-h-screen bg-background text-foreground">
            <StaticPageHeader title={t('title')} analyticsCategory="SongsPage" />

            <main className="mx-auto max-w-[1280px] px-4 pb-24 sm:px-6">
                <nav aria-label="Breadcrumb" className="pt-5 text-[13px] text-muted-foreground">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li><RouteLink to="home" className="hover:text-foreground">MultiStream Hub</RouteLink></li>
                        <li aria-hidden="true" className="inline-flex opacity-50"><ChevronRight size={13} /></li>
                        <li aria-current="page" className="font-medium text-foreground">{t('title')}</li>
                    </ol>
                </nav>

                <h1 className="mt-3 text-2xl font-bold sm:text-3xl">{t('hero.title')}</h1>
                <p className="mt-1.5 max-w-[720px] text-sm leading-relaxed text-muted-foreground">{t('hero.subtitle')}</p>

                {shareNotice && (
                    <div role="status" className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/[0.07] px-4 py-3 text-sm">
                        <span className="min-w-0 flex-1">
                            {shareNotice.found.length > 0 ? t('share.loaded', { count: shareNotice.found.length }) : t('share.none')}
                            {shareNotice.missing > 0 && shareNotice.found.length > 0 && <>{' '}{t('share.missing', { count: shareNotice.missing })}</>}
                        </span>
                        {shareNotice.found.length > 0 && (
                            <Button size="sm" variant="outline" className="h-8" onClick={handleSaveShare} disabled={shareNotice.saved}>
                                <ListPlus className="size-3.5" aria-hidden="true" />
                                {shareNotice.saved ? t('share.saved') : t('share.saveAs')}
                            </Button>
                        )}
                        <Button size="icon" variant="ghost" className="size-8" onClick={() => setShareNotice(null)} aria-label={t('share.dismiss')} title={t('share.dismiss')}>
                            <X className="size-3.5" aria-hidden="true" />
                        </Button>
                    </div>
                )}

                <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(480px,1fr)_380px]">
                    <PlayerPanel player={player} catalog={catalog} />

                    <section aria-labelledby="songs-side-h" className="min-w-0">
                        <h2 id="songs-side-h" className="sr-only">{t('side.label')}</h2>
                        <Tabs value={tab} onValueChange={setTab}>
                            <TabsList className="w-full">
                                <TabsTrigger value="queue" className="flex-1">{t('tabs.queue')}</TabsTrigger>
                                <TabsTrigger value="playlists" className="flex-1">{t('tabs.playlists')}</TabsTrigger>
                            </TabsList>
                            <TabsContent value="queue">
                                <QueuePanel player={player} catalog={catalog} onSaveQueue={handleSaveQueue} />
                            </TabsContent>
                            <TabsContent value="playlists">
                                <PlaylistsPanel playlists={playlists} catalog={catalog} onPlay={handlePlayPlaylist} />
                            </TabsContent>
                        </Tabs>
                    </section>
                </div>

                <section aria-labelledby="songs-catalog-h" className="mt-10 sm:mt-12">
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                        <h2 id="songs-catalog-h" className={h2}>{t('catalog.title')}</h2>
                        <div className="relative w-full sm:ml-auto sm:w-80">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                            <Input
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={t('catalog.search')}
                                aria-label={t('catalog.search')}
                                className="h-10 pl-9"
                            />
                        </div>
                    </div>

                    {catalog ? (
                        catalog.videos.length === 0 ? (
                            <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">{t('catalog.empty')}</p>
                        ) : filtered.length === 0 ? (
                            <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">{t('catalog.noResults', { query: deferredQuery.trim() })}</p>
                        ) : (
                            <>
                                <ul className="grid gap-3 md:grid-cols-2">
                                    {filtered.slice(0, visible).map((video) => (
                                        <VideoCard
                                            key={video.videoId}
                                            video={video}
                                            playlists={playlists}
                                            locale={locale}
                                            onPlaySong={handlePlaySong}
                                            onPlayAll={handlePlayAll}
                                            onQueue={handleQueue}
                                        />
                                    ))}
                                </ul>
                                {filtered.length > visible && (
                                    <div className="mt-4 flex justify-center">
                                        <Button variant="outline" onClick={() => setVisible((v) => v + CATALOG_PAGE_SIZE)}>{t('catalog.showMore')}</Button>
                                    </div>
                                )}
                            </>
                        )
                    ) : catalogQuery.isError ? (
                        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-muted/40 p-6">
                            <p role="alert" className="flex-1 font-bold">{t('catalog.loadError')}</p>
                            <Button variant="outline" onClick={() => void catalogQuery.refetch()} disabled={catalogQuery.isFetching}>
                                <RefreshCw className={cn('size-3.5', catalogQuery.isFetching && 'animate-spin')} aria-hidden="true" />
                                {t('catalog.retry')}
                            </Button>
                        </div>
                    ) : (
                        <p role="status" className="flex min-h-[160px] items-center justify-center gap-2 rounded-2xl border border-border bg-muted/30 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            {t('catalog.loading')}
                        </p>
                    )}
                </section>

                <section aria-labelledby="songs-about-h" className="mt-14 max-w-[680px] border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground">
                    <h2 id="songs-about-h" className="mb-1.5 text-sm font-bold text-foreground">{t('about.title')}</h2>
                    <p>{t('about.body')}</p>
                </section>
            </main>

            <SiteFooter />
        </div>
    );
}
