import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { Checkbox } from '../../../components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Loader2, Search, twitch as TwitchIcon } from 'lucide-react';
// Note: lucide-react might not have 'twitch', using a custom icon function if needed or check imports. 
// FavoritesManagerMain used a custom TwitchIcon function, I will reuse that or copy it.
// Let's copy the custom TwitchIcon from FavoritesManagerMain or use a Lucide one if available (Lucide has 'Twitch' but let's be safe).

import { FollowedChannel } from '../../../hooks/useTwitchUser';

interface TwitchIntegrationSectionProps {
    theme: 'light' | 'dark';
    isLoggedIn: boolean;
    login: () => void;
    logout: () => void;
    resetTwitchUser: () => void;
    twitchUser: any;
    channels: FollowedChannel[];
    loading: boolean;
    hasMore: boolean;
    onLoadMore: () => void;
    onImport: (selectedChannels: FollowedChannel[]) => void;
    onFetchChannels: () => void;
}

export function TwitchIntegrationSection({
    isLoggedIn,
    login,
    logout,
    resetTwitchUser,
    twitchUser,
    channels,
    loading,
    hasMore,
    onLoadMore,
    onImport,
    onFetchChannels
}: TwitchIntegrationSectionProps) {
    const { t } = useTranslation(['favorites', 'common']);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [showChannelList, setShowChannelList] = useState(false);

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
            const newSet = new Set(selectedIds);
            filteredChannels.forEach(c => newSet.add(c.broadcasterLogin));
            setSelectedIds(newSet);
        } else {
            const newSet = new Set(selectedIds);
            filteredChannels.forEach(c => newSet.delete(c.broadcasterLogin));
            setSelectedIds(newSet);
        }
    };

    const toggleSelection = (login: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(login)) newSet.delete(login);
        else newSet.add(login);
        setSelectedIds(newSet);
    };

    const handleImportClick = () => {
        const selected = channels.filter(c => selectedIds.has(c.broadcasterLogin));
        onImport(selected);
        setSelectedIds(new Set());
        setSearchQuery('');
    };

    const handleShowChannels = () => {
        if (!showChannelList) {
            onFetchChannels();
        }
        setShowChannelList(!showChannelList);
    };

    // Custom Twitch Icon
    const TwitchSvg = () => (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 2H3v16h5v4l4-4h5l4-4V2z" />
            <path d="M11 11V7" />
            <path d="M16 11V7" />
        </svg>
    );

    return (
        <div className="p-6 rounded-2xl border border-border bg-muted/40">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                        <TwitchSvg />
                    </div>
                    <h3 className="text-lg font-bold font-normal text-foreground">{t('twitchIntegration')}</h3>
                </div>
                {isLoggedIn && <Badge className="bg-green-500">Connected</Badge>}
            </div>

            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                {t('twitchConnectDescription')}
            </p>

            {!isLoggedIn ? (
                <Button
                    onClick={login}
                    className="w-full bg-[#9146ff] hover:bg-[#772ce8] text-white h-12 rounded-xl text-md font-bold"
                >
                    {t('connectTwitch')}
                </Button>
            ) : (
                <div className="space-y-6">
                    {/* User Info Card */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border">
                        <div className="flex items-center gap-3">
                            {twitchUser?.profileImageUrl && (
                                <img src={twitchUser.profileImageUrl} alt="Profile" className="size-10 rounded-full" />
                            )}
                            <div className="flex flex-col">
                                <span className="text-xs text-muted-foreground">{t('connectedAs', { name: '' })}</span>
                                <span className="font-semibold text-foreground">{twitchUser?.displayName || 'Unknown'}</span>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { logout(); resetTwitchUser(); setShowChannelList(false); }}
                            className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                        >
                            {t('disconnectTwitch')}
                        </Button>
                    </div>

                    {/* Import Channels Section */}
                    <div className="space-y-4">
                        <Button
                            onClick={handleShowChannels}
                            variant="outline"
                            className={`w-full h-12 rounded-xl border-border ${showChannelList ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : ''}`}
                        >
                            {showChannelList ? 'Hide Channels' : t('importFollowedChannels')}
                        </Button>

                        {showChannelList && (
                            <div className="animate-in slide-in-from-top-2 duration-200">
                                {/* Search and Filter Toolbar */}
                                <div className="flex flex-col gap-3 mb-4">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                                        <Input
                                            placeholder={t('searchPlaceholder')}
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-10 bg-background border-border"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between px-1">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="select-all-inline"
                                                checked={filteredChannels.length > 0 && filteredChannels.every(c => selectedIds.has(c.broadcasterLogin))}
                                                onCheckedChange={(c) => handleSelectAll(!!c)}
                                                className="border-border data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                                            />
                                            <label htmlFor="select-all-inline" className="text-sm cursor-pointer select-none text-foreground">
                                                {t('selectAll')}
                                            </label>
                                        </div>
                                        <span className="text-sm text-muted-foreground">
                                            {selectedIds.size} Selected
                                        </span>
                                    </div>
                                </div>

                                {/* Channel List */}
                                <div className="rounded-xl border border-border overflow-hidden bg-card">
                                    <ScrollArea className="h-[400px]">
                                        <div className="p-2 space-y-1">
                                            {loading && channels.length === 0 ? (
                                                <div className="flex items-center justify-center py-8 text-muted-foreground">
                                                    <Loader2 className="size-5 animate-spin mr-2" />
                                                    {t('loading')}
                                                </div>
                                            ) : filteredChannels.length === 0 ? (
                                                <div className="py-8 text-center text-muted-foreground text-sm">
                                                    {t('noChannelsFound')}
                                                </div>
                                            ) : (
                                                filteredChannels.map((channel) => (
                                                    <div
                                                        key={channel.broadcasterId}
                                                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${selectedIds.has(channel.broadcasterLogin)
                                                                ? 'bg-purple-500/10 box-border border border-purple-500/30'
                                                                : 'hover:bg-accent border border-transparent'
                                                            }`}
                                                        onClick={() => toggleSelection(channel.broadcasterLogin)}
                                                    >
                                                        <Checkbox
                                                            checked={selectedIds.has(channel.broadcasterLogin)}
                                                            onCheckedChange={() => toggleSelection(channel.broadcasterLogin)}
                                                            className="border-border data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                                                        />
                                                        <Avatar className="size-8">
                                                            <AvatarImage src={channel.profileImageUrl} />
                                                            <AvatarFallback>{channel.broadcasterName.slice(0, 2)}</AvatarFallback>
                                                        </Avatar>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-medium truncate text-foreground">{channel.broadcasterName}</div>
                                                            <div className="text-xs text-muted-foreground truncate">{channel.broadcasterLogin}</div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}

                                            {hasMore && !searchQuery && (
                                                <div className="pt-2 pb-1 px-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={onLoadMore}
                                                        disabled={loading}
                                                        className="w-full text-xs"
                                                    >
                                                        {loading ? <Loader2 className="size-3 animate-spin" /> : t('loadMore')}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </ScrollArea>
                                </div>

                                <div className="mt-4 flex justify-end">
                                    <Button
                                        onClick={handleImportClick}
                                        disabled={selectedIds.size === 0}
                                        className="bg-purple-600 hover:bg-purple-700 text-white"
                                    >
                                        {t('importSelected', { count: selectedIds.size })}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
