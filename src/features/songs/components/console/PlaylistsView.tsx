import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, ListMusic, MoreHorizontal, Pencil, Play, Plus, Share2, Trash2, X } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { ScrollArea } from '../../../../components/ui/scroll-area';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle,
} from '../../../../components/ui/alert-dialog';
import { cn } from '../../../../components/ui/utils';
import type { SongCatalog } from '../../songsSource';
import { usePlaylistStore, type Playlist } from '../../store/usePlaylistStore';
import { SONG_SHARE_MAX } from '../../lib/songShareLink';
import { copyText, shareUrl } from './shareLink';

export function PlaylistsPanel({ playlists, catalog, onPlay }: {
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
