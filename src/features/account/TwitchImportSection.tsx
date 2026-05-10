import { useUIStore } from '../../store/useUIStore';
import { useTwitchAuth } from '../../hooks/useTwitchAuth';
import { useTwitchUser, type FollowedChannel } from '../../hooks/useTwitchUser';
import { TwitchIntegrationSection } from '../favorites/components/TwitchIntegrationSection';
import { favoritesService } from '../favorites/FavoritesService';
import { logEvent } from '../../utils/analytics';
import { toast } from 'sonner';

/**
 * 帳號頁「Twitch 匯入」section wrapper：
 *   - 用 useTwitchAuth + useTwitchUser 拿狀態與 actions
 *   - render 既有 TwitchIntegrationSection（與 /canvas FavoritesManagerMain 共用）
 *   - onImport 邏輯與 FavoritesManagerMain.handleImportTwitchChannels 一致
 *     （addFavorite × N + clearToken + toast）
 */
export function TwitchImportSection() {
    const theme = useUIStore((s) => s.theme);

    const {
        token,
        isLoggedIn,
        login,
        logout,
        clearToken,
    } = useTwitchAuth();

    const {
        user: twitchUser,
        loading: twitchLoading,
        followedChannels,
        hasMore: twitchHasMore,
        fetchFollowedChannels,
        loadMore: loadMoreChannels,
        reset: resetTwitchUser,
    } = useTwitchUser();

    const handleImport = async (channels: FollowedChannel[]) => {
        let imported = 0;
        for (const channel of channels) {
            const url = `https://www.twitch.tv/${channel.broadcasterLogin}`;
            const result = await favoritesService.addFavorite(url, channel.broadcasterName);
            if (result.success) imported++;
        }
        clearToken();
        logEvent('Favorites', 'twitch_import_account_page', 'count', imported);
        toast.success(`成功匯入 ${imported} 個頻道`);
    };

    return (
        <TwitchIntegrationSection
            theme={theme === 'dark' ? 'dark' : 'light'}
            isLoggedIn={isLoggedIn}
            login={login}
            logout={logout}
            resetTwitchUser={resetTwitchUser}
            twitchUser={twitchUser}
            channels={followedChannels}
            loading={twitchLoading}
            hasMore={twitchHasMore}
            onLoadMore={() => token && twitchUser && loadMoreChannels(token, twitchUser.id)}
            onImport={handleImport}
            onFetchChannels={() => token && twitchUser && fetchFollowedChannels(token, twitchUser.id)}
        />
    );
}
