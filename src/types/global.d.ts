import { FavoriteStream, FavoriteCategory } from '../features/favorites/types';

declare global {
    interface Window {
        favoriteStreams?: {
            getList: () => FavoriteStream[];
            add: (url: string, name?: string, categoryId?: string | null, providedChannelId?: string | null) => Promise<{ success: boolean; message: string; item?: FavoriteStream }>;
            update?: (id: string, updates: { name?: string; categoryId?: string | null }) => { success: boolean; message: string };
            remove?: (id: string) => { success: boolean; message: string };
            load: (item: FavoriteStream | string) => Promise<{ success: boolean; message: string }>;
            loadMultiple: (items: FavoriteStream[]) => Promise<{ success: boolean; message: string }>;
            saveList?: (list: FavoriteStream[]) => void;
        };
        favoriteCategories?: {
            getList: () => FavoriteCategory[];
            add?: (name: string) => { success: boolean; message: string; id?: string };
            update?: (id: string, newName: string) => { success: boolean; message: string };
            remove?: (id: string) => void;
            saveList?: (list: FavoriteCategory[]) => void;
        };
        youtubeApiUtils?: {
            getChannelIdFromHandle?: (handle: string) => Promise<string>;
            getChannelIdFromVideoId?: (videoId: string) => Promise<string>;
            getChannelTitleFromChannelId?: (channelId: string) => Promise<string>;
            checkChannelLiveStatus: (channelId: string) => Promise<{ isLive: boolean; liveVideoId?: string; finalUrl?: string }>;
        };
        twitchApi?: {
            checkMultipleChannelsLiveStatus: (channelIds: string[]) => Promise<Record<string, { isLive: boolean; viewerCount?: number; gameName?: string }>>;
        };
        indexedDBBackup?: {
            isEnabled: () => boolean;
            backup: () => Promise<boolean>;
            getAllData: () => {
                version: string;
                exportDate: string;
                userSettings: any;
                favoriteStreams: any[];
                favoriteCategories: any[];
                controlPanelCollapsed: string | null;
                multiStreamLayout: any;
                adConfig: any;
            };
            hasLocalStorageData?: () => boolean;
        };
        addStream?: (url: string) => Promise<void>;
    }
}
