import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { StreamData, parseStreamUrl, validateUrl } from '../utils/streamUtils';
import { ChatLayoutType } from '../utils/chatLayoutUtils';
import { LayoutType, autoSelectLayout, isLayoutOverCapacity } from '../utils/layoutUtils';
import { CanvasItem, CanvasItemType, LayoutPreset } from '../types/canvas';
import { generateStandardLayout } from '../utils/canvasUtils';
import { generateLayout, LayoutMode } from '../utils/layoutPresets';
import { getSmartLayoutForStreamAndChat } from '../utils/layoutEngine';

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
    addStream: (url: string, options?: { withChat?: boolean; withStream?: boolean }) => Promise<{ success: boolean; message?: string }>;
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
    gridColumns: number;
    setGridSize: (size: { w: number; h: number }) => void;

    // Magnetic Mode
    magneticMode: boolean;
    toggleMagneticMode: () => void;

    addCanvasItem: (type: CanvasItemType, streamId: number | null) => void;
    removeCanvasItem: (itemId: string) => void;
    updateCanvasLayout: (items: any[]) => void;
    saveCurrentLayout: (name: string) => void;
    deleteLayout: (id: string) => void;
    applyLayout: (id: string) => void;

    addEmptyGroup: () => void;
    clearCanvasItems: () => void;
    applyStandardLayoutToCanvas: (type: 'grid' | 'focus' | 'flow') => void;
    updateCanvasItem: (itemId: string, updates: Partial<CanvasItem>) => void;
    syncCanvasWithStreams: () => void;

    // New Action
    applyAutoLayout: (mode: LayoutMode) => void;
}


// Helper for Auto-Reflow
// Helper for Auto-Reflow (RGL handles packing, we just ensure basic initial placement)
// In RGL, if we add items at y: Infinity, it puts them at the bottom.
// We can just return items as is, or do basic initial grid assignment if needed.
// For migration, we'll simplify this to just ensure valid grid units.
const normalizeCanvasItems = (items: CanvasItem[]): CanvasItem[] => {
    return items.map(item => ({
        ...item,
        layout: {
            x: item.layout.x ?? 0,
            y: item.layout.y ?? Infinity, // Put at bottom if undefined
            w: item.layout.w || 6,
            h: item.layout.h || 6
        }
    }));
};

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
            gridMode: true,
            gridSize: { w: 80, h: 80 },
            gridColumns: 24,

            setGridSize: (size) => set(state => ({
                gridSize: size,
                canvasItems: state.canvasItems // No more manual reflow needed
            })),

            toggleGridMode: () => set(state => ({ gridMode: !state.gridMode })),

            // Magnetic Mode
            magneticMode: false,
            toggleMagneticMode: () => set(state => ({ magneticMode: !state.magneticMode })),

            addStream: async (url: string, options = { withChat: true, withStream: true }) => {
                const state = get();
                if (!url || !url.trim()) return { success: false, message: '請輸入直播網址或頻道名稱' };

                const trimmedUrl = url.trim();
                let finalUrl = trimmedUrl;

                // 1. Validate & Parse
                if (!validateUrl(finalUrl).valid) {
                    if (!finalUrl.includes('.') && !finalUrl.includes('/')) {
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
                    name: streamData.channelId,
                    displayName: streamData.channelId
                };

                const newStreams = [...state.streams, newStream];
                const uniqueId = uuidv4().slice(0, 8);
                let newCanvasItems = [...state.canvasItems];

                if (state.layoutMode === 'canvas') {
                    // Intelligent Layout: 20x24 Stream + 4x24 Chat
                    const smartLayout = getSmartLayoutForStreamAndChat(state.canvasItems); // default cols=24

                    if (options.withStream) {
                        newCanvasItems.push({
                            i: `stream-${uniqueId}-${newStream.id}`,
                            type: 'stream',
                            contentId: newStream.id,
                            layout: { ...smartLayout.stream }
                        });
                    }
                    if (options.withChat) {
                        newCanvasItems.push({
                            i: `chat-${uniqueId}-${newStream.id}`,
                            type: 'chat',
                            contentId: newStream.id,
                            layout: { ...smartLayout.chat }
                        });
                    }

                } else {
                    // Legacy / Layout Mode Auto Reflow
                    // ... (Legacy logic preserved or largely irrelevant for Canvas Mode focused task)
                    // But let's keep consistency.
                    // Actually, if we are not in canvas mode, we update canvasItems anyway?
                    newCanvasItems.push({
                        i: `stream-${uuidv4()}-${newStream.id}`,
                        type: 'stream',
                        contentId: newStream.id,
                        layout: { x: 0, y: 0, w: 480, h: 270 }
                    });
                    newCanvasItems.push({
                        i: `chat-${uuidv4()}-${newStream.id}`,
                        type: 'chat',
                        contentId: newStream.id,
                        layout: { x: 0, y: 0, w: 300, h: 270 }
                    });
                }

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
                const uniqueId = uuidv4().slice(0, 8);

                // Always add Stream + Chat pair
                newCanvasItems.push({
                    i: `empty-stream-${uniqueId}`,
                    type: 'stream',
                    contentId: null,
                    layout: { x: 0, y: 0, w: 8, h: 5 } // Placeholder
                });
                newCanvasItems.push({
                    i: `empty-chat-${uniqueId}`,
                    type: 'chat',
                    contentId: null,
                    layout: { x: 0, y: 0, w: 4, h: 5 } // Placeholder
                });

                // RGL auto places new items
                if (state.layoutMode === 'canvas') {
                    // newCanvasItems already pushed above
                } else {
                    // Legacy fallback...
                }

                return { canvasItems: newCanvasItems };
            }),

            clearCanvasItems: () => set({ canvasItems: [], streams: [] }),

            applyStandardLayoutToCanvas: (type) => set(state => {
                // If user invokes this, maybe we should respect it?
                // Or does Auto-Reflow override?
                // Let's assume this manual tool re-applies reflow if grid?
                // For now, let's just trigger reflow if type is grid.
                if (type === 'grid') {
                    // Simplify: Just ensure they are valid. RGL will pack them.
                    return { canvasItems: normalizeCanvasItems(state.canvasItems) };
                }

                // Existing logic for others...
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
                let newCanvasItems = [...state.canvasItems];
                const streams = state.streams;

                // Sync logic... (simplified for brevity, ensuring reflow)
                // 1. Add missing
                streams.forEach(s => {
                    const hasStreamItem = newCanvasItems.some(i => i.type === 'stream' && i.contentId === s.id);
                    if (!hasStreamItem) {
                        newCanvasItems.push({
                            i: `stream-${s.id}-${uuidv4()}`,
                            type: 'stream',
                            contentId: s.id,
                            layout: { x: 0, y: 0, w: 6, h: 6 }
                        });
                        // Add Chat?
                        newCanvasItems.push({
                            i: `chat-${s.id}-${uuidv4()}`,
                            type: 'chat',
                            contentId: s.id,
                            layout: { x: 0, y: 0, w: 6, h: 6 }
                        });
                    }
                });

                // RGL Handles reflow by default due to layout logic
                return { canvasItems: newCanvasItems };
            }),

            removeStream: (id: number) => {
                set(state => {
                    const newStreams = state.streams.filter(s => s.id !== id);
                    const currentCount = newStreams.length;

                    // Remove associated canvas items completely in Auto-Reflow mode
                    // To keep it clean and reflow nicely.
                    let newCanvasItems = state.canvasItems.filter(item => item.contentId !== id);

                    if (state.layoutMode === 'canvas') {
                        // RGL will auto-compact when items are removed from DOM
                    }

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
                set(() => isUserAction ? { layout, userLayout: layout } : { layout });
            },

            setStreams: (streams) => set(state => {
                // Rebuild items from scratch for clean reflow?
                let newCanvasItems: CanvasItem[] = [];
                streams.forEach(s => {
                    const uniqueId = uuidv4().slice(0, 8);
                    newCanvasItems.push({
                        i: `stream-${uniqueId}-${s.id}`,
                        type: 'stream',
                        contentId: s.id,
                        layout: { x: 0, y: 0, w: 8, h: 5 }
                    });
                    newCanvasItems.push({
                        i: `chat-${uniqueId}-${s.id}`,
                        type: 'chat',
                        contentId: s.id,
                        layout: { x: 8, y: 0, w: 4, h: 5 }
                    });
                });

                // AUTO REFLOW
                if (state.layoutMode === 'canvas') {
                    newCanvasItems = normalizeCanvasItems(newCanvasItems);
                }

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

                const newItems = [...state.canvasItems, {
                    i: id,
                    type,
                    contentId: streamId,
                    layout: { x: 0, y: Infinity, w: type === 'chat' ? 4 : 8, h: 5 } // Auto-place at bottom
                }];
                // Just normalize to be safe
                return {
                    canvasItems: normalizeCanvasItems(newItems)
                };
            }),

            removeCanvasItem: (itemId) => set(state => {
                const newItems = state.canvasItems.filter(i => i.i !== itemId);
                // RGL auto handles compaction visually, but we can normalize data if needed
                return {
                    canvasItems: newItems
                };
            }),

            // Modified for RGL Layout Callback
            updateCanvasLayout: (items: any[]) => set(state => {
                // Map RGL Layout objects back to our CanvasItem structure
                // RGL Item: { i, x, y, w, h }
                // Our Item: CanvasItem
                const newItems = state.canvasItems.map(item => {
                    const layoutUpdate = items.find((l: any) => l.i === item.i);
                    if (layoutUpdate) {
                        return {
                            ...item,
                            layout: {
                                x: layoutUpdate.x,
                                y: layoutUpdate.y,
                                w: layoutUpdate.w,
                                h: layoutUpdate.h
                            }
                        };
                    }
                    return item;
                });
                return { canvasItems: newItems };
            }),

            saveCurrentLayout: (name) => set(state => {
                const newPreset: LayoutPreset = {
                    id: uuidv4(),
                    name,
                    type: 'user',
                    items: state.canvasItems.map(item => ({ ...item }))
                };
                return { presets: [...state.presets, newPreset] };
            }),

            deleteLayout: (id) => set(state => ({
                presets: state.presets.filter(p => p.id !== id)
            })),

            applyLayout: (id) => set(state => {
                const preset = state.presets.find(p => p.id === id);
                if (preset) {
                    return { canvasItems: preset.items };
                }
                return {};
            }),

            applyAutoLayout: (mode) => set(state => {
                const streamIds = state.streams.map(s => s.id);
                // Get layout specs from presets
                // Note: generateLayout returns just specs { type, x, y, w, h }
                const layoutSpecs = generateLayout(streamIds, mode);

                const newItems: CanvasItem[] = [];
                let streamIndex = 0;
                let chatIndex = 0;

                layoutSpecs.forEach(spec => {
                    let targetStreamId: number | null = null;
                    let newItem: CanvasItem | null = null;

                    if (spec.type === 'stream') {
                        if (streamIndex < streamIds.length) {
                            targetStreamId = streamIds[streamIndex];
                            // Reuse ID if meaningful? New UUID is safer for now.
                            newItem = {
                                i: `stream-${uuidv4()}-${targetStreamId}`,
                                type: 'stream',
                                contentId: targetStreamId,
                                layout: { x: spec.x, y: spec.y, w: spec.w, h: spec.h }
                            };
                            streamIndex++;
                        }
                    } else if (spec.type === 'chat') {
                        // Assuming 1:1 mapping order
                        if (chatIndex < streamIds.length) {
                            targetStreamId = streamIds[chatIndex];
                            newItem = {
                                i: `chat-${uuidv4()}-${targetStreamId}`,
                                type: 'chat',
                                contentId: targetStreamId,
                                layout: { x: spec.x, y: spec.y, w: spec.w, h: spec.h }
                            };
                            chatIndex++;
                        }
                    }

                    if (newItem) {
                        newItems.push(newItem);
                    }
                });

                return { canvasItems: newItems };
            })
        }),
        {
            name: 'stream-storage',
            partialize: (state) => ({
                streams: state.streams,
                layoutMode: state.layoutMode,
                presets: state.presets,
                canvasItems: state.canvasItems,
            })
        }
    )
);


