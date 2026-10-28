import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ListMusic, Plus } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../components/ui/utils';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu';
import { usePlaylistStore, type Playlist } from '../../store/usePlaylistStore';
import { track } from '../../../../utils/analytics';

/** 加入歌單選單：codes 可以是一首（目錄、曲目表、底部列）或整場（詳細畫面）；pill＝顯示文字的外框鈕 */
export function AddToPlaylistMenu({ codes, playlists, pill = false, className }: {
    codes: string[];
    playlists: Playlist[];
    pill?: boolean;
    className?: string;
}) {
    const { t } = useTranslation('songs');
    const createPlaylist = usePlaylistStore((s) => s.createPlaylist);
    const addToPlaylist = usePlaylistStore((s) => s.addToPlaylist);
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                {pill ? (
                    <Button variant="outline" size="sm" className={cn('h-[34px] rounded-full bg-transparent px-3.5 text-[13px] text-foreground/80', className)} disabled={codes.length === 0}>
                        <ListMusic className="size-3.5" aria-hidden="true" />
                        {t('catalog.addToPlaylist')}
                    </Button>
                ) : (
                    <Button variant="ghost" size="icon" className={cn('size-8 shrink-0', className)} disabled={codes.length === 0} aria-label={t('catalog.addToPlaylist')} title={t('catalog.addToPlaylist')}>
                        <ListMusic className="size-3.5" aria-hidden="true" />
                    </Button>
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-[260px]">
                <DropdownMenuLabel>{t('catalog.addToPlaylist')}</DropdownMenuLabel>
                {playlists.map((pl) => (
                    <DropdownMenuItem
                        key={pl.id}
                        onSelect={() => {
                            addToPlaylist(pl.id, codes);
                            track.songPlaylistAdd(codes.length);
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
                        createPlaylist(name, codes);
                        track.songPlaylistCreate('add_menu', codes.length);
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
