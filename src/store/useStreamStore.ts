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
import { findFreePosition, generateStandardLayout } from '../utils/canvasUtils';

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
    // Grid Mode
    gridMode: boolean;
    toggleGridMode: () => void;
    gridSize: { w: number; h: number };

    // Magnetic Mode
    magneticMode: boolean;
    toggleMagneticMode: () => void;

    addCanvasItem: (type: CanvasItemType, streamId: number | null) => void;
    removeCanvasItem: (itemId: string) => void;
    updateCanvasLayout: (items: CanvasItem[]) => void;
    saveCurrentLayout: (name: string) => void;
    deleteLayout: (id: string) => void;
    applyLayout: (id: string) => void;

    addEmptyGroup: () => void;
    clearCanvasItems: () => void;
    applyStandardLayoutToCanvas: (type: 'grid' | 'focus' | 'flow') => void;
    updateCanvasItem: (itemId: string, updates: Partial<CanvasItem>) => void;
    syncCanvasWithStreams: () => void;
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

            // Grid Mode Init
            gridMode: false,
            gridSize: { w: 48, h: 27 }, // 10x10 grid relative to 480x270 base? or 20px? Let's say 20px. 
            // Better: 16:9 ratio grid unit? 
            // If base is 480x270. 480/10 = 48. 270/10 = 27.
            // Let's use 20px for finer control, or 10px. 
            // User requested "Arbitrary drag / Grid / Snap".
            // Let's default to a reasonable grid size. 20px is standard.

            toggleGridMode: () => set(state => ({ gridMode: !state.gridMode })),

            // Magnetic Mode
            magneticMode: false,
            toggleMagneticMode: () => set(state => ({ magneticMode: !state.magneticMode })),

            addStream: async (url: string) => {
                const state = get();
                if (!url || !url.trim()) return { success: false, message: '請輸入直播網址或頻道名稱' };

                const trimmedUrl = url.trim();
                let finalUrl = trimmedUrl;
                let foundChannelName: string | null = null;

                // 1. Validate & Parse
                if (!validateUrl(finalUrl)) {
                    // Try to guess it's a channel name if simple string
                    if (!finalUrl.includes('.') && !finalUrl.includes('/')) {
                        // Assume Twitch channel for now or try both? 
                        // Simplified: Assume Twitch for plain text
                        finalUrl = `https://twitch.tv/${finalUrl}`;
                    } else {
                        return { success: false, message: '不支援的網址格式' };
                    }
                }

                const streamData = parseStreamUrl(finalUrl);
                if (!streamData) return { success: false, message: '無法解析網址' };

                // 2. Check Duplicates
                if (state.streams.some(s => s.originalUrl === finalUrl)) {
                    return { success: false, message: '此串流已存在' };
                }

                // 3. Fetch Info (Optional but good)
                // TODO: Implement platform specific info fetching if needed. 
                // Currently handled by components or effect later.

                // Create new Stream Object
                const newId = Date.now();
                const newStream: StreamData = {
                    id: newId,
                    platform: streamData.platform!,
                    channelId: streamData.channelId,
                    videoId: streamData.videoId,
                    originalUrl: finalUrl,
                    volume: 50,
                    chatVisible: true,
                    isMuted: false,
                    name: streamData.channelId, // fallback name
                    displayName: streamData.channelId // fallback display name
                };

                const newStreams = [...state.streams, newStream];

                // 4. Update Canvas Items (Global Reflow)
                let newCanvasItems = [...state.canvasItems];

                // Assign to empty slot if available?
                // Logic:
                // Global Reflow logic usually rebuilds the grid. 
                // But we should try to fill the "first empty stream slot" if exists, 
                // OR add new items if no empty slot.

                // Find empty slot
                const emptySlotIndex = newCanvasItems.findIndex(i => i.type === 'stream' && !i.contentId);

                if (emptySlotIndex !== -1) {
                    // Fill slot
                    newCanvasItems[emptySlotIndex] = { ...newCanvasItems[emptySlotIndex], contentId: newStream.id };
                    // We might also want to fill the corresponding Chat slot if it's empty?
                    // Usually they are paired by convention? 
                    // Let's just find an empty chat slot too.
                    const emptyChatIndex = newCanvasItems.findIndex(i => i.type === 'chat' && !i.contentId);
                    if (emptyChatIndex !== -1) {
                        newCanvasItems[emptyChatIndex] = { ...newCanvasItems[emptyChatIndex], contentId: newStream.id };
                    }
                } else {
                    // Create new pair
                    const uniqueId = uuidv4().slice(0, 8);

                    newCanvasItems.push({
                        i: `stream-${uniqueId}-${newStream.id}`,
                        type: 'stream',
                        contentId: newStream.id,
                        layout: { x: 0, y: 0, w: 480, h: 270 }
                    });

                    newCanvasItems.push({
                        i: `chat-${uniqueId}-${newStream.id}`,
                        type: 'chat',
                        contentId: newStream.id,
                        layout: { x: 0, y: 0, w: 300, h: 270 }
                    });
                }

                // Perform Global Reflow
                newCanvasItems = generateStandardLayout(
                    newCanvasItems,
                    'flow', // Use Reflow to respect new sizes
                    newStreams.length,
                    window.innerWidth,
                    window.innerHeight
                );

                // Auto Layout for Non-Canvas
                const newLayout = autoSelectLayout(newStreams.length);

                set({
                    streams: newStreams,
                    canvasItems: newCanvasItems,
                    layout: state.userLayout ? state.layout : newLayout
                });

                return { success: true };
            },

            addEmptyGroup: () => set(state => {
                let newCanvasItems = [...state.canvasItems];
                const uniqueId = uuidv4().slice(0, 8); // Short ID

                // Add temp items at 0,0 - they will be reflowed
                newCanvasItems.push({
                    i: `empty-stream-${uniqueId}`,
                    type: 'stream',
                    contentId: null,
                    layout: { x: 0, y: 0, w: 480, h: 270 }
                });

                newCanvasItems.push({
                    i: `empty-chat-${uniqueId}`,
                    type: 'chat',
                    contentId: null,
                    layout: { x: 0, y: 0, w: 300, h: 270 }
                });

                // USER REQUIREMENT: Global Reflow
                newCanvasItems = generateStandardLayout(
                    newCanvasItems,
                    'grid',
                    state.streams.length,
                    window.innerWidth,
                    window.innerHeight
                );

                return { canvasItems: newCanvasItems };
            }),

            clearCanvasItems: () => set({ canvasItems: [] }),

            applyStandardLayoutToCanvas: (type) => set(state => {
                if (state.canvasItems.length === 0) return {};

                const newCanvasItems = generateStandardLayout(
                    state.canvasItems,
                    type,
                    state.streams.length,
                    window.innerWidth,
                    window.innerHeight
                );

                return { canvasItems: newCanvasItems };
            }),

            updateCanvasItem: (itemId, updates) => set(state => ({
                canvasItems: state.canvasItems.map(item =>
                    item.i === itemId ? { ...item, ...updates } : item
                )
            })),

            syncCanvasWithStreams: () => set(state => {
                // Ensure every stream has a corresponding canvas item (stream & chat)
                const newCanvasItems = [...state.canvasItems];
                const streams = state.streams;

                streams.forEach(s => {
                    // Check for Stream Item
                    const hasStreamItem = newCanvasItems.some(i => i.type === 'stream' && i.contentId === s.id);
                    if (!hasStreamItem) {
                        // Add Stream Item
                        const offset = newCanvasItems.length * 30;
                        newCanvasItems.push({
                            i: `stream-${s.id}-${uuidv4()}`,
                            type: 'stream',
                            contentId: s.id,
                            layout: { x: 50 + (offset % 500), y: 50 + (offset % 300), w: 480, h: 270 }
                        });
                    }
                    // Check for Chat Item - Optional? 
                    // Let's NOT force add Chat items to avoid clutter, user can add manually or switch type.
                    // Or maybe we should? "Sync" implies full availability.
                    // But user requirement says "Generated windows can be blank first...".
                    // Let's just ensure Stream availability for now.
                });

                return { canvasItems: newCanvasItems };
            }),



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

