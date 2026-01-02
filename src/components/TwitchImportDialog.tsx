import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Checkbox } from './ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Input } from './ui/input';
import { FollowedChannel } from '../hooks/useTwitchUser';

interface TwitchImportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channels: FollowedChannel[];
    loading: boolean;
    hasMore: boolean;
    onLoadMore: () => void;
    onImport: (selectedChannels: FollowedChannel[]) => void;
    theme: 'light' | 'dark';
}

export function TwitchImportDialog({
    open,
    onOpenChange,
    channels,
    loading,
    hasMore,
    onLoadMore,
    onImport,
    theme
}: TwitchImportDialogProps) {
    const { t } = useTranslation(['favorites']);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    const filteredChannels = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return channels;
        return channels.filter(c =>
            c.broadcasterName.toLowerCase().includes(query) ||
            c.broadcasterLogin.toLowerCase().includes(query)
        );
    }, [channels, searchQuery]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            // Select all currently visible (filtered) channels
            const newSet = new Set(selectedIds);
            filteredChannels.forEach(c => newSet.add(c.broadcasterLogin));
            setSelectedIds(newSet);
        } else {
            // Deselect all currently visible (filtered) channels
            const newSet = new Set(selectedIds);
            filteredChannels.forEach(c => newSet.delete(c.broadcasterLogin));
            setSelectedIds(newSet);
        }
    };

    const toggleSelection = (login: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(login)) {
            newSet.delete(login);
        } else {
            newSet.add(login);
        }
        setSelectedIds(newSet);
    };

    const handleImport = () => {
        // Import all selected channels (from original list) that have their IDs in selectedIds
        const selected = channels.filter(c => selectedIds.has(c.broadcasterLogin));
        onImport(selected);
        setSelectedIds(new Set());
        setSearchQuery(''); // Reset search
        onOpenChange(false);
    };

    // Check if all *filtered* channels are selected
    const areAllSelected = useMemo(() => {
        if (filteredChannels.length === 0) return false;
        return filteredChannels.every(c => selectedIds.has(c.broadcasterLogin));
    }, [filteredChannels, selectedIds]);


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={`max-w-3xl max-h-[85vh] flex flex-col ${theme === 'dark' ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white'}`}>
                <DialogHeader>
                    <DialogTitle>{t('importTwitchTitle')}</DialogTitle>
                    <DialogDescription>
                        {t('twitchConnectDescription')}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3 py-2 px-1">
                    {/* Search Input */}
                    <Input
                        placeholder={t('searchPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}
                    />

                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="select-all"
                                checked={areAllSelected}
                                onCheckedChange={(c: boolean | 'indeterminate') => handleSelectAll(!!c)}
                                className={theme === 'dark' ? 'border-gray-500 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600' : ''}
                            />
                            <label htmlFor="select-all" className="text-sm cursor-pointer select-none">
                                {t('selectAll')}
                            </label>
                        </div>
                        {/* Simplified count display */}
                        <span className="text-sm text-muted-foreground font-medium">
                            {selectedIds.size}
                        </span>
                    </div>
                </div>

                <div className="flex-1 border rounded-md h-[400px] overflow-hidden">
                    <ScrollArea className="h-[800px]">
                        <div className="p-4">
                            {filteredChannels.length === 0 && !loading ? (
                                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                                    <p>{searchQuery ? t('noChannelsFound') : t('noChannelsFound')}</p>
                                </div>
                            ) : (
                                // Vertical List Layout
                                <div className="flex flex-col gap-2">
                                    {filteredChannels.map((channel) => (
                                        <div
                                            key={channel.broadcasterId}
                                            className={`flex items-center space-x-4 p-3 rounded-lg border cursor-pointer transition-colors ${selectedIds.has(channel.broadcasterLogin)
                                                ? 'border-purple-500 bg-purple-500/10'
                                                : theme === 'dark' ? 'border-gray-800 hover:bg-gray-800' : 'border-gray-200 hover:bg-gray-50'
                                                }`}
                                            onClick={() => toggleSelection(channel.broadcasterLogin)}
                                        >
                                            <Checkbox
                                                checked={selectedIds.has(channel.broadcasterLogin)}
                                                onCheckedChange={() => toggleSelection(channel.broadcasterLogin)}
                                                className={theme === 'dark' ? 'border-gray-500 data-[state=checked]:bg-purple-600' : 'data-[state=checked]:bg-purple-600'}
                                            />
                                            <Avatar className="h-10 w-10">
                                                <AvatarImage src={channel.profileImageUrl} alt={channel.broadcasterName} />
                                                <AvatarFallback>{channel.broadcasterName.slice(0, 2).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                {/* min-w-0 to enable truncate */}
                                                <p className="text-base font-medium truncate">{channel.broadcasterName}</p>
                                                <p className="text-sm text-muted-foreground truncate">{channel.broadcasterLogin}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {hasMore && !searchQuery && (
                                <div className="py-4 flex justify-center">
                                    <Button
                                        variant="outline"
                                        onClick={onLoadMore}
                                        disabled={loading}
                                        className="w-full"
                                    >
                                        {loading ? t('loading') : t('loadMore')}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>

                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={handleImport}
                        disabled={selectedIds.size === 0}
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                        {t('import')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
