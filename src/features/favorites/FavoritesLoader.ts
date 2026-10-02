import { favoritesService } from './FavoritesService';
import { apiLoader } from '../../utils/apiLoader';
import { FavoriteStream } from './types';
import { useStreamStore } from '../../store/useStreamStore';
import i18n from '../../i18n/i18n';


export class FavoritesLoaderService {
    // Helper to safely add stream with retries
    async safeAddStream(url: string, platform?: string, displayName?: string, retries = 3): Promise<boolean> {
        const { addStream } = useStreamStore.getState();

        try {
            await addStream(url, { withChat: true, withStream: true, displayName }); // Pass displayName to addStream
            return true;
        } catch (e) {
            if (retries > 0) {
                console.warn(`Failed to add stream (attempt ${4 - retries}/3), retrying...`, e);
                await new Promise(resolve => setTimeout(resolve, 500));
                return this.safeAddStream(url, platform, displayName, retries - 1);
            }
            console.error('Failed to add stream after multiple retries:', e);
            const errorMsg = i18n.t('favorites:failedToAddStream');
            throw new Error(errorMsg);
        }
    }

    async load(item: FavoriteStream): Promise<{ success: boolean; message?: string }> {
        if (!item || (!item.url && !item.channelId && !item.videoId)) {
            return { success: false, message: i18n.t('favorites:invalidFavoriteItem') };
        }

        const displayName = item.name; // Use favorite name as displayName

        // Logic to check live status
        if (item.isLive) {
            const liveUrl = item.liveUrl || item.url;
            try {
                if (liveUrl) {
                    await this.safeAddStream(liveUrl, undefined, displayName);
                    return { success: true };
                }
            } catch (e) {
                // If failed, maybe not live?
            }
        } else {
            // Not live
            favoritesService.updateFavorite(item.id, {
                isLive: false,
                liveVideoId: undefined,
                lastChecked: new Date().toISOString()
            });

            // Removed dead code: if (item.isLive === true) check is impossible here

            const fallbackUrl = item.url || (item.platform === 'youtube' && item.channelId ? `https://www.youtube.com/channel/${item.channelId}/live` : undefined);

            if (fallbackUrl) {
                try {
                    await this.safeAddStream(fallbackUrl, undefined, displayName);
                    return { success: true };
                } catch (e) { }
            }
        }

        // Twitch Logic
        if (item.platform === 'twitch' && item.channelId) {
            const fallbackUrl = item.url || `https://www.twitch.tv/${item.channelId}`;
            try {
                await this.safeAddStream(fallbackUrl, undefined, displayName);
                return { success: true };
            } catch (e) { }
        }

        // Default fallback
        if (item.url) {
            try {
                await this.safeAddStream(item.url, undefined, displayName);
                return { success: true };
            } catch (e) {
                return { success: false, message: (e as Error).message };
            }
        }

        return { success: false, message: i18n.t('favorites:invalidFavoriteItem') };
    }

    async loadMultiple(items: FavoriteStream[]): Promise<{ success: boolean; message: string; successCount: number; failCount: number }> {
        if (!items || items.length === 0) {
            return { success: false, message: i18n.t('favorites:noFavoritesToLoad'), successCount: 0, failCount: 0 };
        }

        const twitchItems = items.filter(item =>
            item.platform === 'twitch' || (item.url && item.url.includes('twitch.tv'))
        );

        if (twitchItems.length > 0) {
            try { await apiLoader.loadTwitchPlayerApi(); } catch (e) { }
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
            message = i18n.t('favorites:loadMultipleSuccess', { count: successCount });
        } else {
            message = i18n.t('favorites:loadMultipleSuccessWithFail', { success: successCount, fail: failCount });
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
