import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ListMusic, Plus } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu';
import { usePlaylistStore, type Playlist } from '../../store/usePlaylistStore';

export function AddToPlaylistMenu({ code, playlists }: { code: string; playlists: Playlist[] }) {
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
