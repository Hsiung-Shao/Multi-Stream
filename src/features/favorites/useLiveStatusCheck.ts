import { useState, useCallback } from 'react';
import { favoritesService } from './FavoritesService';
import { twitchService } from '../twitch/TwitchService';
import { youtubeApi } from '../../utils/youtubeApi';
import { cacheChannelIfAbsent } from '../youtube/YouTubeChannelRepository';
import { FavoriteStream } from './types';

export const useLiveStatusCheck = () => {
    const [isRefreshing, setIsRefreshing] = useState(false);

    const checkNow = useCallback(async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);

        try {
            const favoritesList = favoritesService.getFavorites();
            const twitchFavorites = favoritesList.filter(f => f.platform === 'twitch' && f.channelId);
            const youtubeFavorites = favoritesList.filter(f => f.platform === 'youtube' && f.channelId);

            let updatedFavorites = [...favoritesList];
            let hasUpdates = false;

            // 1. Check Twitch Status
            if (twitchFavorites.length > 0) {
                try {
                    const channelIds = twitchFavorites.map(f => f.channelId!);
                    const liveStatuses = await twitchService.checkMultipleChannelsLiveStatus(channelIds);

                    updatedFavorites = updatedFavorites.map(fav => {
                        if (fav.platform === 'twitch' && fav.channelId && liveStatuses[fav.channelId]) {
                            const status = liveStatuses[fav.channelId];

                            // Check if status actually changed to avoid unnecessary updates
                            if (fav.isLive !== status.isLive ||
                                fav.viewerCount !== status.viewerCount ||
                                fav.gameName !== status.gameName) {
                                hasUpdates = true;
                                return {
                                    ...fav,
                                    isLive: status.isLive || false,
                                    lastChecked: new Date().toISOString(),
                                    viewerCount: status.viewerCount,
                                    gameName: status.gameName
                                } as FavoriteStream;
                            }
                        }
                        return fav;
                    });
                } catch (e) {
                    console.error('[LiveCheck] Twitch check failed', e);
                }
            }

            // 2. Check YouTube Status
            if (youtubeFavorites.length > 0) {
                let isFirstYoutubeCheck = true;
                for (const fav of youtubeFavorites) {
                    if (!fav.channelId) continue;

                    // Optimization: Skip if live and checked recently (< 1 hour)
                    if (fav.isLive && fav.lastChecked) {
                        const lastCheckedTime = new Date(fav.lastChecked).getTime();
                        if (Date.now() - lastCheckedTime < 60 * 60 * 1000) {
                            continue;
                        }
                    }

                    // Rate limiting: 2000ms delay between requests
                    if (!isFirstYoutubeCheck) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                    isFirstYoutubeCheck = false;

                    try {
                        const status = await youtubeApi.checkChannelLiveStatus(fav.channelId);

                        // 順手蒐集到離線頻道資料庫:寫官方頻道名、查 DB 去重、不更動使用者收藏資料。
                        // fire-and-forget,失敗不影響直播狀態檢查。
                        if (status.channelTitle) {
                            cacheChannelIfAbsent(fav.channelId, status.channelTitle).catch(() => {});
                        }

                        // Check if updates are needed
                        // Important: Always update if we have a new liveUrl (finalUrl) and it's different
                        const newLiveUrl = status.finalUrl || null;
                        const newLiveVideoId = status.liveVideoId || null;
                        const newIsLive = status.isLive || false;

                        // Identify if anything meaningful changed
                        // Specifically check liveUrl because that was the bug
                        if (fav.isLive !== newIsLive ||
                            fav.liveUrl !== newLiveUrl ||
                            fav.liveVideoId !== newLiveVideoId) {

                            hasUpdates = true;
                            updatedFavorites = updatedFavorites.map(f => {
                                if (f.id === fav.id) {
                                    return {
                                        ...f,
                                        isLive: newIsLive,
                                        lastChecked: new Date().toISOString(),
                                        liveUrl: newLiveUrl,
                                        liveVideoId: newLiveVideoId
                                    };
                                }
                                return f;
                            });
                        }
                    } catch (e) {
                        console.warn(`[LiveCheck] YouTube check failed for ${fav.channelId}`, e);
                    }
                }
            }

            // 3. Save only if there were updates
            if (hasUpdates) {

                favoritesService.saveFavorites(updatedFavorites);
            } else {

            }

        } catch (e) {
            console.error('[LiveCheck] Global check failed', e);
        } finally {
            setIsRefreshing(false);
        }
    }, [isRefreshing]);

    return {
        isRefreshing,
        checkNow
    };
};
