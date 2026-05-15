import { FavoritesRepository } from './FavoritesRepository';
import { CategoryRepository } from './CategoryRepository';
import { FavoriteStream, FavoriteUpdateEventDetail } from './types';
import { backupService } from '../backup/index';
import { DEFAULT_TAG_TWITCH_ID, DEFAULT_TAG_YOUTUBE_ID } from './constants';
import { youtubeApi } from '../../utils/youtubeApi';
import { getCachedChannel, upsertChannel } from '../youtube/YouTubeChannelRepository';

export class FavoritesService {
    private favRepo: FavoritesRepository;
    private catRepo: CategoryRepository;

    constructor() {
        this.favRepo = new FavoritesRepository();
        this.catRepo = new CategoryRepository();
    }

    // --- Category Operations ---

    getCategories() {
        return this.catRepo.getList();
    }

    saveCategories(list: any[]) {
        this.catRepo.saveList(list);
        backupService.scheduleBackup();
    }

    addCategory(name: string) {
        const result = this.catRepo.add(name);
        backupService.scheduleBackup();
        return result;
    }

    updateCategory(id: string, name: string) {
        const result = this.catRepo.update(id, name);
        backupService.scheduleBackup();
        return result;
    }

    removeCategory(id: string) {
        const result = this.catRepo.remove(id);
        if (result.success) {
            // Cascade: uncategorize streams
            this.favRepo.uncategorize(id);
        }
        backupService.scheduleBackup();
        return result;
    }

    // --- Favorite Operations ---

    getFavorites() {
        return this.favRepo.getList();
    }

    saveFavorites(list: FavoriteStream[]) {
        this.favRepo.saveList(list);
        this.emitChangeEvent('update', 'bulk-update'); // Emit event for reactivity
    }

    /**
     * Logic to determine if a stream is duplicate
     */
    isDuplicate(url: string, channelId?: string | null): boolean {
        const list = this.favRepo.getList();

        // Try to parse channelId from URL if not provided
        let targetChannelId = channelId;
        if (!targetChannelId) {
            if (url.includes('youtube.com/channel/')) {
                const match = url.match(/youtube\.com\/channel\/([^\/\?]+)/);
                if (match) targetChannelId = match[1];
            } else if (url.includes('twitch.tv/')) {
                const match = url.match(/twitch\.tv\/([^\/\?]+)/);
                if (match) targetChannelId = match[1];
            }
        }

        return list.some(item => {
            // Direct URL match
            if (item.url === url) return true;

            // YouTube logic
            if (item.platform === 'youtube') {
                // If we have a target channel ID, check against stored channel ID
                if (targetChannelId && item.channelId && targetChannelId.trim() === item.channelId.trim()) {
                    return true;
                }

                // Fallback: Check if URLs map to same channel via regex
                const urlChannelMatch = url.match(/youtube\.com\/channel\/([^\/\?]+)/);
                const itemChannelMatch = item.url ? item.url.match(/youtube\.com\/channel\/([^\/\?]+)/) : null;
                if (urlChannelMatch && itemChannelMatch && urlChannelMatch[1] === itemChannelMatch[1]) {
                    return true;
                }
            }

            // Twitch logic
            if (item.platform === 'twitch') {
                const itemChannelId = item.channelId || (item.url ? item.url.match(/twitch\.tv\/([^\/\?]+)/)?.[1] : null);

                if (targetChannelId && itemChannelId === targetChannelId) return true;

                const urlMatch = url.match(/twitch\.tv\/([^\/\?]+)/);
                if (urlMatch && itemChannelId === urlMatch[1]) return true;
            }

            return false;
        });
    }



    async addFavorite(
        url: string,
        name: string = '',
        categoryId: string | null = null,
        providedChannelId: string | null = null,
        providedVideoId: string | null = null,
        tagIds: string[] = []
    ): Promise<{ success: boolean; message: string; item?: FavoriteStream }> {

        // Initial duplicate check
        if (this.isDuplicate(url, providedChannelId)) {
            return { success: false, message: 'streamAlreadyInFavorites' };
        }

        // Parse Platform
        let platform: 'twitch' | 'youtube' | 'other' = 'other';
        let channelId = providedChannelId;
        let videoId = providedVideoId;

        if (url.includes('twitch.tv')) {
            platform = 'twitch';
            // Auto-add default tag
            if (!tagIds.includes(DEFAULT_TAG_TWITCH_ID)) {
                tagIds = [...tagIds, DEFAULT_TAG_TWITCH_ID];
            }
            const match = url.match(/twitch\.tv\/([^\/\?]+)/);
            if (match) channelId = match[1];

            // Try to get displayName from URL if name is empty
            if (!name) {
                try {
                    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
                    const startName = urlObj.searchParams.get('displayName');
                    if (startName) name = startName;
                } catch (e) { }
            }
            if (!name && channelId) name = channelId;

        } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
            platform = 'youtube';
            // Auto-add default tag
            if (!tagIds.includes(DEFAULT_TAG_YOUTUBE_ID)) {
                tagIds = [...tagIds, DEFAULT_TAG_YOUTUBE_ID];
            }
            // Basic Video ID extraction
            if (!videoId) {
                if (url.includes('youtube.com/watch')) {
                    try {
                        videoId = new URL(url.startsWith('http') ? url : `https://${url}`).searchParams.get('v');
                    } catch (e) { }
                } else if (url.includes('youtu.be/')) {
                    const parts = url.split('youtu.be/');
                    if (parts.length > 1) videoId = parts[1].split('?')[0];
                }
            }

            // If we have videoId but no channelId, try to resolve it via API
            if (videoId && !channelId) {
                try {
                    // Use static import
                    const resolvedChannelId = await youtubeApi.getChannelIdFromVideoId(videoId);
                    if (resolvedChannelId) {
                        channelId = resolvedChannelId;

                        // Check duplicate AGAIN with resolved channelId
                        if (this.isDuplicate(url, channelId)) {
                            return { success: false, message: 'streamAlreadyInFavorites' };
                        }

                        // Normalize URL to channel live format
                        url = `https://www.youtube.com/channel/${channelId}/live`;

                        // If no name, fetch channel title
                        // 優先順序:Supabase cache(youtube_channels)→ YouTube Data API
                        // - cache hit(channel_id 存在 + fetched_at < 24h + title 非空):直接用,免 quota
                        // - cache miss:呼 API,成功則 upsertChannel 寫回 cache 給後續 user 共享
                        if (!name) {
                            try {
                                const cached = await getCachedChannel(channelId);
                                if (cached?.channel_title) {
                                    name = cached.channel_title;
                                } else {
                                    const title = await youtubeApi.getChannelTitleFromChannelId(channelId);
                                    if (title) {
                                        name = title;
                                        // fire-and-forget 寫回 cache;失敗不影響加入收藏流程
                                        upsertChannel({ channel_id: channelId, channel_title: title }).catch(() => {});
                                    }
                                }
                            } catch (e) { }
                        }
                    }
                } catch (e) {
                    console.warn('Failed to resolve YouTube channel info', e);
                }
            }

            if (!name) name = videoId || channelId || url;
        }

        const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const newItem: FavoriteStream = {
            id: uniqueId,
            url,
            name: name || url,
            platform,
            channelId,
            videoId,
            categoryId,
            tagIds,
            addedAt: new Date().toISOString(),
            isLive: null,
            lastChecked: null,
            liveUrl: null,
            liveVideoId: null
        };

        this.favRepo.add(newItem);
        this.emitChangeEvent('add', uniqueId, newItem);

        return { success: true, message: 'addedToFavorites', item: newItem };
    }

    updateFavorite(id: string, updates: Partial<FavoriteStream>): { success: boolean; message: string } {
        const success = this.favRepo.update(id, updates);
        if (!success) return { success: false, message: 'favoriteNotFound' };

        const updatedItem = this.favRepo.getList().find(i => i.id === id);
        this.emitChangeEvent('update', id, updatedItem);

        return { success: true, message: 'favoriteUpdated' };
    }

    removeFavorite(id: string): { success: boolean; message: string } {
        const removedItem = this.favRepo.remove(id);
        if (!removedItem) return { success: false, message: 'favoriteNotFound' };

        this.emitChangeEvent('remove', id, removedItem);
        return { success: true, message: 'favoriteRemoved' };
    }

    private emitChangeEvent(action: 'add' | 'update' | 'remove', id: string, item?: FavoriteStream) {
        if (typeof window !== 'undefined') {
            const detail: FavoriteUpdateEventDetail = {
                action,
                favoriteId: id,
                favorite: item
            };
            window.dispatchEvent(new CustomEvent('favoritesUpdated', { detail }));
        }
        backupService.scheduleBackup();
    }
}

export const favoritesService = new FavoritesService();
