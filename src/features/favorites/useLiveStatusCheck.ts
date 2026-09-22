import { useState, useCallback } from 'react';
import { favoritesService } from './FavoritesService';
import { twitchService } from '../twitch/TwitchService';
import { youtubeApi } from '../../utils/youtubeApi';
import { cacheChannelIfAbsent } from '../youtube/YouTubeChannelRepository';
import { FavoriteStream } from './types';
import { shouldCheckChannel, recordChannelCheck } from './liveCheckThrottle';
import { fetchLiveStatuses, isLiveStatusFresh, toLiveStatusResult, type LiveStatusRow } from './liveStatusRepository';

export interface CheckNowOptions {
    /** 使用者手動觸發：略過每頻道節流（見 liveCheckThrottle.ts） */
    force?: boolean;
}

export const useLiveStatusCheck = () => {
    const [isRefreshing, setIsRefreshing] = useState(false);

    const checkNow = useCallback(async (options?: CheckNowOptions) => {
        const force = options?.force === true;
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
                // 先決定這一輪要處理哪些頻道
                const candidates = youtubeFavorites.filter(fav => {
                    if (!fav.channelId) return false;
                    // Optimization: Skip if live and checked recently (< 1 hour)
                    if (fav.isLive && fav.lastChecked
                        && Date.now() - new Date(fav.lastChecked).getTime() < 60 * 60 * 1000) {
                        return false;
                    }
                    // 每頻道節流：離線頻道 15 分鐘、其餘 4 分鐘內查過就跳過（跨分頁、跨重新整理共用）
                    return shouldCheckChannel(fav.channelId, Date.now(), force);
                });

                // 共享表：別的使用者 3 分鐘內查過的頻道直接用資料庫的結果，不打端點（整輪只讀一次）
                const shared = candidates.length > 0
                    ? await fetchLiveStatuses(candidates.map(fav => fav.channelId as string))
                    : new Map<string, LiveStatusRow>();

                let isFirstYoutubeCheck = true;
                for (const fav of candidates) {
                    const channelId = fav.channelId as string;
                    const sharedRow = shared.get(channelId);
                    const fromShared = !!sharedRow && isLiveStatusFresh(sharedRow);

                    // Rate limiting: 打端點之間間隔 2 秒；讀共享表的結果不需要
                    if (!fromShared) {
                        if (!isFirstYoutubeCheck) {
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }
                        isFirstYoutubeCheck = false;
                    }

                    try {
                        const status = fromShared && sharedRow
                            ? toLiveStatusResult(sharedRow)
                            : await youtubeApi.checkChannelLiveStatus(channelId);
                        recordChannelCheck(channelId, !!status.isLive);

                        // 順手蒐集到離線頻道資料庫:寫官方頻道名、查 DB 去重、不更動使用者收藏資料。
                        // fire-and-forget,失敗不影響直播狀態檢查。只在真的打了端點時做——
                        // 讀共享表時每輪都做會讓每個頻道多一次 Supabase 查詢。
                        if (!fromShared && status.channelTitle) {
                            cacheChannelIfAbsent(channelId, status.channelTitle).catch(() => {});
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
                        console.warn(`[LiveCheck] YouTube check failed for ${channelId}`, e);
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
