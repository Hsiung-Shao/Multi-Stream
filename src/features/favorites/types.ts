/**
 * Favorite Stream Item Interface
 * Matches legacy data structure in settings.js
 */
export interface FavoriteStream {
    id: string;
    url: string;
    name: string;
    platform: 'twitch' | 'youtube' | 'other';
    channelId?: string | null;
    videoId?: string | null;
    categoryId?: string | null;
    addedAt: string;

    // Live Status Metadata
    isLive?: boolean | null;
    lastChecked?: string | null;
    viewerCount?: number | null;
    liveTitle?: string | null;
    gameName?: string | null;
    liveVideoId?: string | null;
    liveUrl?: string | null;
}

/**
 * Favorite Category Interface
 * Matches legacy data structure in settings.js
 */
export interface FavoriteCategory {
    id: string;
    name: string;
    createdAt: string;
}

/**
 * Event detail for favorite updates
 */
export interface FavoriteUpdateEventDetail {
    action: 'add' | 'update' | 'remove';
    favoriteId: string;
    favorite?: FavoriteStream;
}
