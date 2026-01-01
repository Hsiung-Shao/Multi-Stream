import { FavoriteStream, FavoriteCategory } from '../features/favorites/types';

declare global {
    interface Window {
        CONFIG?: {
            TWITCH_CLIENT_ID?: string;
            TWITCH_CLIENT_SECRET?: string;
            TWITCH_ACCESS_TOKEN?: string;
            YOUTUBE_API_KEY?: string;
        };
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
            getApiKey: () => Promise<string | null>;
            getChannelIdFromVideoId: (videoId: string) => Promise<string>;
            getChannelIdFromHandle: (handle: string) => Promise<string>;
            getChannelTitleFromChannelId: (channelId: string) => Promise<string | null>;
            checkChannelLiveStatus: (channelId: string) => Promise<{ isLive: boolean; liveVideoId?: string; finalUrl?: string }>;
        };
        twitchApi?: {
            searchChannels: (query: string, limit: number) => Promise<any[]>;
            checkChannelLiveStatus: (channelId: string) => Promise<any>;
            checkMultipleChannelsLiveStatus: (channelIds: string[]) => Promise<Record<string, { isLive: boolean; viewerCount?: number; gameName?: string }>>;
            setConfig: (config: any) => void;
            getConfig: () => any;
            clearCache: () => void;
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
        // Legacy Chat Functions
        createChat: (id: number, platform: 'twitch' | 'youtube', channelId: string, videoId: string) => void;
        toggleChat: (id: number) => void;
        separateChat: (id: number) => void;
        closeSeparatedChat: (id: number) => void;
        setupChatResizer: (id: number, callback: any) => void;

        addStream?: (url: string) => Promise<void>;
    }
}
