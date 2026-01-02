import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { StreamData, parseStreamUrl, validateUrl } from '../utils/streamUtils';
import { ChatLayoutType } from '../utils/chatLayoutUtils';
import { LayoutType, autoSelectLayout, isLayoutOverCapacity } from '../utils/layoutUtils';
import { favoritesService } from '../features/favorites/FavoritesService';
import { twitchService } from '../features/twitch/TwitchService';
import { youtubeApi } from '../utils/youtubeApi';
import { CanvasItem, CanvasItemType, LayoutPreset } from '../types/canvas';

interface StreamStoreState {
    streams: StreamData[];
    layout: LayoutType;
    layoutMode: 'auto' | 'canvas';
    userLayout: LayoutType | null;
    chatLayout: ChatLayoutType;

    // Canvas State
    canvasItems: CanvasItem[];
    presets: LayoutPreset[];

    // Actions
    addStream: (url: string) => Promise<{ success: boolean; message?: string }>;
    removeStream: (id: number) => void;
    moveStream: (fromIndex: number, toIndex: number) => void;
    setChatLayout: (layout: ChatLayoutType) => void;
    setLayout: (layout: LayoutType, isUserAction?: boolean) => void;
    updateStream: (id: number, updates: Partial<StreamData>) => void;
    setStreams: (streams: StreamData[]) => void;

    // Canvas Actions
    setLayoutMode: (mode: 'auto' | 'canvas') => void;
    addCanvasItem: (type: CanvasItemType, streamId: number) => void;
    removeCanvasItem: (itemId: string) => void;
    updateCanvasLayout: (items: CanvasItem[]) => void;
    saveCurrentLayout: (name: string) => void;
    deleteLayout: (id: string) => void;
    applyLayout: (id: string) => void;
}

export const useStreamStore = create<StreamStoreState>()(
    persist(
        (set, get) => ({
            streams: [],
            layout: 2,
            layoutMode: 'auto',
            userLayout: null,
            chatLayout: 'none',
            canvasItems: [],
            presets: [],

            addStream: async (url: string) => {
                if (!url || !url.trim()) return { success: false, message: '請輸入直播網址或頻道名稱' };

                const trimmedUrl = url.trim();
                let finalUrl = trimmedUrl;
                let foundChannelName: string | null = null;

                // 1. 嘗試搜尋
                if (!trimmedUrl.includes('http://') && !trimmedUrl.includes('https://') &&
                    !trimmedUrl.includes('twitch.tv/') && !trimmedUrl.includes('youtube.com') &&
                    !trimmedUrl.includes('youtu.be/')) {
                    try {
                        const results = await twitchService.searchChannels(trimmedUrl, 1);
                        if (results && results.length > 0) {
                            finalUrl = results[0].url;
                            foundChannelName = results[0].displayName;
                        } else {
                            return { success: false, message: `找不到頻道 "${trimmedUrl}"` };
                        }
                    } catch (error: any) {
                        return { success: false, message: `搜尋頻道失敗: ${error.message || '未知錯誤'}` };
                    }
                }

                // 2. 驗證 URL
                const urlValidation = validateUrl(finalUrl);
                if (!urlValidation.valid) return { success: false, message: urlValidation.error };

                // 3. 解析 URL
                const parsed = parseStreamUrl(finalUrl);
                if (!parsed.platform || parsed.error) return { success: false, message: parsed.error || '無法解析 URL' };

                // 4. YouTube Channel ID 驗證
                if (parsed.platform === 'youtube' && parsed.channelId && parsed.videoId) {
                    try {
                        const actualId = await youtubeApi.getChannelIdFromVideoId(parsed.videoId);
                        if (actualId && actualId !== parsed.channelId) {
                            return { success: false, message: `頻道 ID 驗證失敗` };
                        }
                        if (actualId) parsed.channelId = actualId;
                    } catch (e) { }
                }

                // 5. 查找收藏名稱
                let displayName = foundChannelName;
                let name = null;
                try {
                    const favorites = favoritesService.getFavorites();
                    const favorite = favorites.find(fav => {
                        if (fav.platform !== parsed.platform) return false;
                        if (parsed.platform === 'twitch' && fav.channelId === parsed.channelId) return true;
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
                } catch (e) { }

                // 6. Generate ID
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

                set(state => {
                    const newStreams = [...state.streams, newStream];
                    const currentCount = newStreams.length;

                    // Auto Layout Logic
                    let newLayout = state.layout;
                    let newUserLayout = state.userLayout;

                    if (newUserLayout && isLayoutOverCapacity(newUserLayout, currentCount)) {
                        newLayout = autoSelectLayout(currentCount);
                        newUserLayout = null;
                    } else if (!newUserLayout) {
                        newLayout = autoSelectLayout(currentCount);
                    } else {
                        newLayout = newUserLayout;
                    }

                    // Canvas Logic: Smart Auto-fill
                    // 1. Find Empty Stream Slot
                    const newCanvasItems = [...state.canvasItems];
                    const emptyStreamSlotIndex = newCanvasItems.findIndex(item => item.type === 'stream' && !item.contentId);

                    if (emptyStreamSlotIndex !== -1) {
                        // Found empty slot, fill it
                        newCanvasItems[emptyStreamSlotIndex] = {
                            ...newCanvasItems[emptyStreamSlotIndex],
                            contentId: newId
                        };

                        // Also try to find a matching Empty Chat Slot? 
                        // It's hard to associate "Empty Chat" with "Empty Stream" unless they are spatially related or index related.
                        // For simplicity, we just look for ANY empty chat slot and fill it too.
                        const emptyChatSlotIndex = newCanvasItems.findIndex(item => item.type === 'chat' && !item.contentId);
                        if (emptyChatSlotIndex !== -1) {
                            newCanvasItems[emptyChatSlotIndex] = {
                                ...newCanvasItems[emptyChatSlotIndex],
                                contentId: newId
                            };
                        } else {
                            // If no empty chat slot, maybe we should create one?
                            // User requirement: "新增串流是自動產生兩個視窗"
                            // If we filled a stream slot but have no chat slot, we should probably add a chat slot nearby if possible.
                            // But adding it might overlap.
                            // Strategy: If we reused a slot, we assume the layout is "fixed" by user, so we only fill what's there.
                            // UNLESS the user explicitly wants a chat window always.
                            // Let's stick to: "If reuse stream slot, try reuse chat slot. If no chat slot, do nothing (assume user didn't want chat there)."
                        }
                    } else {
                        // No empty slot, create new pair (Stream + Chat)
                        // Position logic: Find a good spot or just cascade.
                        const offset = newCanvasItems.length * 30; // Simple cascade
                        // Stream
                        newCanvasItems.push({
                            i: `stream-${newId}`,
                            type: 'stream',
                            contentId: newId,
                            layout: { x: 50 + (offset % 500), y: 50 + (offset % 300), w: 480, h: 270 }
                        });
                        // Chat (Right of Stream)
                        newCanvasItems.push({
                            i: `chat-${newId}`,
                            type: 'chat',
                            contentId: newId,
                            layout: { x: 50 + (offset % 500) + 480, y: 50 + (offset % 300), w: 300, h: 270 }
                        });
                    }

                    return {
                        streams: newStreams,
                        layout: newLayout,
                        userLayout: newUserLayout,
                        canvasItems: newCanvasItems
                    };
                });

                return { success: true };
            },

            removeStream: (id: number) => {
                set(state => {
                    const newStreams = state.streams.filter(s => s.id !== id);
                    const currentCount = newStreams.length;

                    // Canvas Logic: Clear slot instead of remove (Soft Delete)
                    // But if we have too many undefined items, maybe we should clean up?
                    // User said: "生成的視窗可以先以空白的生成", implies persistent slots.
                    // So we set contentId to null.
                    const newCanvasItems = state.canvasItems.map(item => {
                        if (item.contentId === id) {
                            return { ...item, contentId: null };
                        }
                        return item;
                    });

                    // Optional: If we want to strictly clean up "Dynamic" items vs "Layout" items?
                    // No, keeping it simple: All items become blank when stream is removed.

                    // Auto Layout Logic (for non-canvas mode)
                    let newLayout = state.layout;
                    if (currentCount === 0) newLayout = 1;
                    else if (!state.userLayout) newLayout = autoSelectLayout(currentCount);

                    return { streams: newStreams, layout: newLayout, canvasItems: newCanvasItems };
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
                    streams: state.streams.map(s => s.id === id ? { ...s, ...updates } : s)
                }));
            },

            setChatLayout: (layout) => set({ chatLayout: layout }),

            setLayout: (layout, isUserAction = true) => {
                set(state => isUserAction ? { layout, userLayout: layout } : { layout });
            },

            setStreams: (streams) => set(state => {
                // Initialize canvas items for these streams if missing
                const newCanvasItems = [...state.canvasItems];
                // 1. Clear invalid IDs
                // 2. Assign streams to empty slots first

                // This is complex for bulk set. 
                // Simple strategy: reset all slots to empty, then fill?
                // That would lose positions of active streams if IDs match.

                // Better: 
                // Keep existing assignments if valid.
                // If stream removed, clear slot.
                // If new stream, fill empty or create.

                // Map current streams
                const currentStreamIds = new Set(streams.map(s => s.id));

                // Clear slots for removed streams
                for (let i = 0; i < newCanvasItems.length; i++) {
                    if (newCanvasItems[i].contentId && !currentStreamIds.has(newCanvasItems[i].contentId!)) {
                        newCanvasItems[i] = { ...newCanvasItems[i], contentId: null };
                    }
                }

                // Assign new streams
                streams.forEach(s => {
                    const alreadyAssigned = newCanvasItems.find(item => item.contentId === s.id);
                    if (!alreadyAssigned) {
                        const emptySlotIndex = newCanvasItems.findIndex(item => item.type === 'stream' && !item.contentId);
                        if (emptySlotIndex !== -1) {
                            newCanvasItems[emptySlotIndex] = { ...newCanvasItems[emptySlotIndex], contentId: s.id };
                        } else {
                            // Start new
                            const offset = newCanvasItems.length * 30;
                            newCanvasItems.push({
                                i: `stream-${s.id}`,
                                type: 'stream',
                                contentId: s.id,
                                layout: { x: 50 + (offset % 500), y: 50 + (offset % 300), w: 480, h: 270 }
                            });
                        }
                    }
                });

                // Recalculate auto layout
                const count = streams.length;
                const newLayout = state.userLayout && !isLayoutOverCapacity(state.userLayout, count)
                    ? state.userLayout
                    : autoSelectLayout(count);

                return { streams, layout: newLayout, canvasItems: newCanvasItems };
            }),

            // Canvas Actions
            setLayoutMode: (mode) => set({ layoutMode: mode }),

            addCanvasItem: (type, streamId) => set(state => {
                const id = uuidv4();
                const offset = state.canvasItems.length * 30;
                // Allow streamId to be null/undefined (treated as optional in type now)

                return {
                    canvasItems: [...state.canvasItems, {
                        i: id,
                        type,
                        contentId: streamId,
                        layout: { x: 50 + (offset % 500), y: 50 + (offset % 300), w: 480, h: 270 }
                    }]
                };
            }),

            removeCanvasItem: (itemId) => set(state => ({
                canvasItems: state.canvasItems.filter(i => i.i !== itemId)
            })),

            updateCanvasLayout: (items) => set({ canvasItems: items }),

            saveCurrentLayout: (name) => set(state => {
                const newPreset: LayoutPreset = {
                    id: uuidv4(),
                    name,
                    type: 'user',
                    items: state.canvasItems.map(item => ({ ...item })) // Deep copy items
                };
                return { presets: [...state.presets, newPreset] };
            }),

            deleteLayout: (id) => set(state => ({
                presets: state.presets.filter(p => p.id !== id)
            })),

            applyLayout: (id) => set(state => {
                // Determine layout Config
                // Since 'id' is just 'Grid 2x2' etc for auto layout, but here we deal with "Presets".
                // We actually need a way to generate "Blank Grids".
                // In my logic, `presets` only contains saved User presets.
                // But the user might want to "Clear to 2x2 Grid".

                // If `id` matches a preset, load it.
                // If `id` looks like a template name (not implemented yet), generate it.

                const preset = state.presets.find(p => p.id === id);
                if (preset) {
                    // Load Preset
                    const newCanvasItems: CanvasItem[] = [];
                    const streams = state.streams;
                    let streamIndex = 0;

                    preset.items.forEach(pItem => {
                        let contentId: number | null = null;

                        if (pItem.type === 'stream') {
                            if (streamIndex < streams.length) {
                                contentId = streams[streamIndex].id;
                                streamIndex++;
                            }
                        }
                        // For Chat, we can also try to match streamIndex? 
                        // Or just leave empty?
                        // Let's leave Chat empty if loading layout, unless we track "Chat for Stream N" relation.
                        // But we don't.

                        newCanvasItems.push({
                            ...pItem,
                            i: uuidv4(),
                            contentId: contentId
                        });
                    });

                    // If we have more streams than slots, add them to extra slots?
                    // Or just leave them floating?
                    // User said "Generated windows can be blank first... fill in order".
                    // So we respect the preset. The extra streams just won't be on canvas (or add to queue?)
                    // Let's add them as new windows if necessary.
                    for (let i = streamIndex; i < streams.length; i++) {
                        const s = streams[i];
                        const offset = newCanvasItems.length * 30;
                        newCanvasItems.push({
                            i: `stream-${s.id}`,
                            type: 'stream',
                            contentId: s.id,
                            layout: { x: 50 + (offset % 500), y: 50 + (offset % 300), w: 480, h: 270 }
                        });
                    }
                    return { canvasItems: newCanvasItems };
                }

                return {};
            })
        }),
        {
            name: 'stream-storage', // Persistence key
            partialize: (state) => ({
                streams: state.streams,
                layoutMode: state.layoutMode,
                presets: state.presets,
                canvasItems: state.canvasItems,
            })
        }
    )
);

