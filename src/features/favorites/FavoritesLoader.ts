
import { favoritesService } from './FavoritesService';
import { FavoriteStream } from './types';
import { youtubeApi } from '../../utils/youtubeApi';

// Define window interface extension for this file
declare global {
    interface Window {
        addStream: (url: string) => Promise<any>;
        i18n: any;
        _reactAddStreamReady?: boolean;
        apiLoader?: any;
    }
}

export class FavoritesLoaderService {
    private addStreamHandler: ((url: string) => Promise<any>) | null = null;

    setAddStreamHandler(handler: (url: string) => Promise<any>) {
        this.addStreamHandler = handler;
    }

    // Helper to safely add stream with retries
    async safeAddStream(url: string, retries = 3): Promise<any> {
        if (this.addStreamHandler) {
            try {
                return await this.addStreamHandler(url);
            } catch (error) {
                if (retries > 0) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    return this.safeAddStream(url, retries - 1);
                }
                throw error;
            }
        }

        // Fallback to window.addStream for legacy support (temporarily) or if not set
        const legacyAddStream = (window as any).addStream;
        if (legacyAddStream && typeof legacyAddStream === 'function') {
            try {
                return await legacyAddStream(url);
            } catch (error) {
                if (retries > 0) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    return this.safeAddStream(url, retries - 1);
                }
                throw error;
            }
        }

        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
            return this.safeAddStream(url, retries - 1);
        } else {
            const i18n = (window as any).i18n || { t: (key: string) => key };
            const errorMsg = i18n.t('reactAppNotLoaded') || '錯誤：React 應用尚未載入...';
            console.error('safeAddStream failed:', errorMsg);
            throw new Error(errorMsg);
        }
    }

    async load(item: FavoriteStream): Promise<{ success: boolean; message?: string }> {
        const i18n = (window as any).i18n || { t: (key: string) => key };

        if (!item || (!item.url && !item.channelId && !item.videoId)) {
            return { success: false, message: i18n.t('invalidFavoriteItem') };
        }

        // Logic to check live status
        if (item.isLive) {
            const liveUrl = item.liveUrl || item.url;
            try {
                await this.safeAddStream(liveUrl);
                return { success: true };
            } catch (e) {
                // If failed, maybe not live?
                // Legacy: if platform is youtube, check status
                if (item.platform === 'youtube' && item.channelId) {
                    // Check status logic
                    // Fallback to fetch status
                }
            }
        }

        // Comprehensive check logic similar to legacy
        if (item.platform === 'youtube' && item.channelId) {
            // Check live status
            const status = await youtubeApi.checkChannelLiveStatus(item.channelId);

            if (status.isLive && (status.liveVideoId || status.finalUrl)) {
                const liveUrl = status.finalUrl || `https://www.youtube.com/watch?v=${status.liveVideoId}`;

                // Update favorite item status
                favoritesService.updateFavorite(item.id, {
                    isLive: true,
                    liveVideoId: status.liveVideoId,
                    liveUrl: liveUrl,
                    lastChecked: new Date().toISOString()
                });

                try {
                    await this.safeAddStream(liveUrl);
                    return { success: true };
                } catch (e) {
                    // Retrying or continue
                }
            } else {
                // Not live
                favoritesService.updateFavorite(item.id, {
                    isLive: false,
                    liveVideoId: undefined, // Clear live video id? Legacy might keep it?
                    // Legacy line 1133: doesn't seem to clear liveVideoId but sets isLive false
                    lastChecked: new Date().toISOString()
                });

                if (item.isLive === true) {
                    // It was marked live but now checked false
                    // Legacy shows alert if item.isLive was true?
                    // Line 1217: alert if item.isLive === false (after check)
                    return { success: false, message: i18n.t('channelNotLive') };
                }

                // Try to add channel/video directly if not live?
                // Legacy logic usually tries to add the channel url if we still want to load it
                // But strictly speaking if we are here we might return failure if we only wanted live.
                // However, "load" usually implies user wants to watch it.
                const fallbackUrl = item.url || `https://www.youtube.com/channel/${item.channelId}/live`;
                try {
                    await this.safeAddStream(fallbackUrl);
                    return { success: true };
                } catch (e) {

                }
            }
        }

        // Twitch Logic
        if (item.platform === 'twitch' && item.channelId) {
            const fallbackUrl = item.url || `https://www.twitch.tv/${item.channelId}`;
            try {
                await this.safeAddStream(fallbackUrl);
                return { success: true };
            } catch (e) {

            }
        }

        // Default fallback
        if (item.url) {
            try {
                await this.safeAddStream(item.url);
                return { success: true };
            } catch (e) {
                return { success: false, message: (e as Error).message };
            }
        }

        return { success: false, message: i18n.t('invalidFavoriteItem') };
    }

    async loadMultiple(items: FavoriteStream[]): Promise<{ success: boolean; message: string; successCount: number; failCount: number }> {
        const i18n = (window as any).i18n || { t: (key: string) => key };

        if (!items || items.length === 0) {
            return { success: false, message: i18n.t('noFavoritesToLoad'), successCount: 0, failCount: 0 };
        }

        const twitchItems = items.filter(item =>
            item.platform === 'twitch' || (item.url && item.url.includes('twitch.tv'))
        );

        if (twitchItems.length > 0 && window.apiLoader) {
            try { await window.apiLoader.loadTwitchPlayerApi(); } catch (e) { }
        }

        const BATCH_SIZE = 3;
        const DELAY_BETWEEN_BATCHES = 300;

        let successCount = 0;
        let failCount = 0;
        const errors: string[] = [];

        for (let i = 0; i < items.length; i += BATCH_SIZE) {
            const batch = items.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map(async (item) => {
                try {
                    const result = await this.load(item);
                    if (result.success) successCount++;
                    else {
                        failCount++;
                        if (result.message) errors.push(result.message);
                    }
                } catch (e) {
                    failCount++;
                    errors.push((e as Error).message || 'Unknown error');
                }
            });

            await Promise.allSettled(batchPromises);

            if (i + BATCH_SIZE < items.length) {
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
            }
        }

        let message = '';
        if (failCount === 0) {
            message = i18n.t('loadMultipleSuccess')?.replace('{count}', successCount.toString()) ||
                `成功載入 ${successCount} 個收藏`;
        } else {
            message = i18n.t('loadMultipleSuccessWithFail')?.replace('{success}', successCount.toString()).replace('{fail}', failCount.toString()) ||
                `成功載入 ${successCount} 個收藏，失敗 ${failCount} 個`;
        }

        return {
            success: successCount > 0,
            message,
            successCount,
            failCount
        };
    }
}

export const favoritesLoader = new FavoritesLoaderService();
