import { create } from 'zustand';
import { StreamData, parseStreamUrl, validateUrl } from '../utils/streamUtils';
import { ChatLayoutType } from '../utils/chatLayoutUtils';
import { LayoutType, autoSelectLayout, isLayoutOverCapacity } from '../utils/layoutUtils';
import { apiLoader } from '../utils/apiLoader';
import { favoritesService } from '../features/favorites/FavoritesService';

interface StreamStoreState {
    streams: StreamData[];
    layout: LayoutType;
    userLayout: LayoutType | null; // 用戶手動選擇的佈局
    chatLayout: ChatLayoutType;

    // Actions
    addStream: (url: string) => Promise<{ success: boolean; message?: string }>;
    removeStream: (id: number) => void;
    moveStream: (fromIndex: number, toIndex: number) => void;
    setChatLayout: (layout: ChatLayoutType) => void;
    setLayout: (layout: LayoutType, isUserAction?: boolean) => void;
    updateStream: (id: number, updates: Partial<StreamData>) => void;
    setStreams: (streams: StreamData[]) => void; // 用於初始化或批量設置
}

export const useStreamStore = create<StreamStoreState>((set, get) => ({
    streams: [],
    layout: 2, // 預設佈局 (LayoutType 2 is usually split or grid-2 depending on implementation, ensuring number)
    userLayout: null,
    chatLayout: 'none',

    addStream: async (url: string) => {
        if (!url || !url.trim()) {
            return { success: false, message: '請輸入直播網址或頻道名稱' };
        }

        const trimmedUrl = url.trim();
        let finalUrl = trimmedUrl;
        let foundChannelName: string | null = null;

        // 1. 嘗試搜尋 (簡單判斷：非 URL 且非特定域名)
        if (!trimmedUrl.includes('http://') && !trimmedUrl.includes('https://') &&
            !trimmedUrl.includes('twitch.tv/') && !trimmedUrl.includes('youtube.com') &&
            !trimmedUrl.includes('youtu.be/')) {

            try {
                await apiLoader.loadTwitchDataApi();
                if (window.twitchApi && window.twitchApi.searchChannels) {
                    const results = await window.twitchApi.searchChannels(trimmedUrl, 1);
                    if (results && results.length > 0) {
                        finalUrl = results[0].url;
                        foundChannelName = results[0].display_name;
                    } else {
                        return { success: false, message: `找不到頻道 "${trimmedUrl}"` };
                    }
                } else {
                    return { success: false, message: 'Twitch API 未初始化' };
                }
            } catch (error: any) {
                return { success: false, message: `搜尋頻道失敗: ${error.message || '未知錯誤'}` };
            }
        }

        // 2. 驗證 URL
        const urlValidation = validateUrl(finalUrl);
        if (!urlValidation.valid) {
            return { success: false, message: urlValidation.error };
        }

        // 3. 解析 URL
        const parsed = parseStreamUrl(finalUrl);
        if (!parsed.platform || parsed.error) {
            return { success: false, message: parsed.error || '無法解析 URL' };
        }

        // 4. (可選) YouTube Channel ID 二次驗證邏輯
        if (parsed.platform === 'youtube' && parsed.channelId && parsed.videoId) {
            try {
                await apiLoader.loadYouTubeDataApi();
                if (window.youtubeApiUtils && window.youtubeApiUtils.getChannelIdFromVideoId) {
                    const actualId = await window.youtubeApiUtils.getChannelIdFromVideoId(parsed.videoId);
                    if (actualId && actualId !== parsed.channelId) {
                        return {
                            success: false,
                            message: `頻道 ID 驗證失敗：目標影片不屬於該頻道 (預期: ${parsed.channelId}, 實際: ${actualId})`
                        };
                    }
                    if (actualId) parsed.channelId = actualId;
                }
            } catch (e) {
                // 忽略驗證錯誤
            }
        }

        // 5. 查找收藏名稱
        let displayName = foundChannelName;
        let name = null;
        try {
            const favorites = favoritesService.getFavorites();
            const favorite = favorites.find(fav => {
                if (fav.platform !== parsed.platform) return false;
                // Twitch
                if (parsed.platform === 'twitch' && fav.channelId === parsed.channelId) return true;
                // YouTube
                if (parsed.platform === 'youtube') {
                    if (fav.channelId && parsed.channelId && fav.channelId === parsed.channelId) return true;
                    if (fav.videoId && parsed.videoId && fav.videoId === parsed.videoId) return true;
                    if (fav.url && finalUrl && fav.url === finalUrl) return true;
                }
                return false;
            });
            if (favorite && favorite.name) {
                displayName = favorite.name;
                name = favorite.name;
            }
        } catch (e) {
            // ignore
        }

        // 6. Generate ID (Max ID + 1 Strategy)
        const currentIds = get().streams.map(s => s.id);
        const maxId = currentIds.length > 0 ? Math.max(...currentIds) : 0;
        const newId = maxId + 1;

        const newStream: StreamData = {
            id: newId,
            platform: parsed.platform,
            channelId: parsed.channelId,
            videoId: parsed.videoId,
            originalUrl: finalUrl,
            volume: 100,
            chatVisible: false,
            isMuted: false,
            name: name,
            displayName: displayName
        };

        // Legacy Global Sync Removed

        set(state => {
            const newStreams = [...state.streams, newStream];
            const currentCount = newStreams.length;
            const { userLayout } = state;

            // 計算新佈局
            let newLayout = state.layout;
            if (userLayout) {
                // 如果用戶有選擇佈局，檢查是否超過容量
                if (isLayoutOverCapacity(userLayout, currentCount)) {
                    // 超過容量，自動切換
                    newLayout = autoSelectLayout(currentCount);
                    // 清除用戶選擇（或僅在 store 中標記失效，這裡簡單清除與 useLayout 行為一致）
                    // 若要嚴格模仿 useLayout: setUserSelectedLayout(null)
                    // 這裡我們清除 userLayout 以回退到自動模式
                    return { streams: newStreams, layout: newLayout, userLayout: null };
                } else {
                    newLayout = userLayout;
                    return { streams: newStreams, layout: newLayout }; // 保持用戶佈局
                }
            } else {
                // 自動模式
                newLayout = autoSelectLayout(currentCount);
                return { streams: newStreams, layout: newLayout };
            }
        });

        return { success: true };
    },

    removeStream: (id: number) => {
        set(state => {
            const newStreams = state.streams.filter(s => s.id !== id);
            const currentCount = newStreams.length;

            // Cleanup Legacy Global
            if (window.streamData && window.streamData[id]) {
                delete window.streamData[id];
            }

            // 重新計算佈局
            // 如果當前是自動模式 (userLayout === null)，則重新自動選擇
            // 如果是用戶模式，檢查是否需要調整（通常不需要，除非特殊需求，useLayout 邏輯是維持用戶選擇除非... wait, useLayout 只有在 exceeds capacity 時才強制切換。
            // 減少串流通常不會 exceeds capacity，所以維持原狀。）
            // 但如果 streams 變為 0? useLayout 邏輯: count=0 -> 1.
            let newLayout = state.layout;
            const { userLayout } = state;

            if (currentCount === 0) {
                // 沒串流重置
                newLayout = 1;
                // 保留 userLayout? useLayout hook keeps userSelectedLayout but sets selectedLayout=autoLayout(0) -> 1?
                // useLayout hook: if streamCount=0 return (ref reset). 
                // If we simply set layout to 1 it's fine.
            } else {
                if (userLayout) {
                    // 維持用戶選擇，除非不合法？isLayoutOverCapacity 檢查是大於容量，小於通常沒問題。
                    newLayout = userLayout;
                } else {
                    newLayout = autoSelectLayout(currentCount);
                }
            }

            return { streams: newStreams, layout: newLayout };
        });
    },

    moveStream: (fromIndex, toIndex) => {
        set(state => {
            const newStreams = [...state.streams];
            const [moved] = newStreams.splice(fromIndex, 1);
            newStreams.splice(toIndex, 0, moved);
            return { streams: newStreams };
        });
    },

    updateStream: (id, updates) => {
        set(state => ({
            streams: state.streams.map(s =>
                s.id === id ? { ...s, ...updates } : s
            )
        }));
        // Sync Legacy
        if (window.streamData && window.streamData[id]) {
            Object.assign(window.streamData[id], updates);
        }
    },

    setChatLayout: (layout) => set({ chatLayout: layout }),

    setLayout: (layout, isUserAction = true) => {
        set(state => {
            if (isUserAction) {
                // 檢查是否合法 (Optional, Store 可以彈性一點，UI 層通常會限制只能選合法的)
                return { layout: layout, userLayout: layout };
            } else {
                return { layout: layout };
            }
        });
    },

    setStreams: (streams) => set(state => {
        // 批量設置（例如初始化或恢復）
        // 重新計算佈局
        const currentCount = streams.length;
        let newLayout = state.layout;
        const { userLayout } = state;

        if (userLayout) {
            if (isLayoutOverCapacity(userLayout, currentCount)) {
                newLayout = autoSelectLayout(currentCount);
                return { streams, layout: newLayout, userLayout: null };
            } else {
                newLayout = userLayout;
                return { streams, layout: newLayout };
            }
        } else {
            newLayout = autoSelectLayout(currentCount);
            return { streams, layout: newLayout };
        }
    }),
}));
