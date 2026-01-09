import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { StreamData, parseStreamUrl, validateUrl } from '../utils/streamUtils';
import { youtubeApi } from '../utils/youtubeApi';
import { ChatLayoutType } from '../utils/chatLayoutUtils';
import { LayoutType, autoSelectLayout, isLayoutOverCapacity } from '../utils/layoutUtils';
import { CanvasItem, CanvasItemType, LayoutPreset } from '../types/canvas';
import { generateStandardLayout } from '../utils/canvasUtils';
import { generateLayout, LayoutMode } from '../utils/layoutPresets';
import { findAvailablePosition, findMaximalEmptyRect, repackAndMaximizeRows } from '../utils/layoutEngine';
import { calculateAutoGridLayout, calculateDualDirectionLayout } from '../utils/layoutPresets';
import { CustomLayout, LayoutSlot } from '../types/canvas';
import { layoutStorage } from '../utils/layoutStorage';

interface StreamStoreState {
    streams: StreamData[];
    layout: LayoutType;
    layoutMode: 'auto' | 'canvas';
    userLayout: LayoutType | null;
    chatLayout: ChatLayoutType;

    // Canvas State
    canvasItems: CanvasItem[];
    presets: LayoutPreset[];
    customLayouts: CustomLayout[]; // User saved layouts

    // Actions
    addStream: (url: string, options?: { withChat?: boolean; withStream?: boolean; displayName?: string }) => Promise<{ success: boolean; message?: string; streamId?: number }>;
    removeStream: (id: number) => void;
    moveStream: (fromIndex: number, toIndex: number) => void;
    setChatLayout: (layout: ChatLayoutType) => void;
    setLayout: (layout: LayoutType, isUserAction?: boolean) => void;
    updateStream: (id: number, updates: Partial<StreamData>) => void;
    setStreams: (streams: StreamData[]) => void;

    // Custom Layout Actions
    saveCustomLayout: (name: string) => Promise<void>;
    deleteCustomLayout: (id: string) => Promise<void>;
    renameCustomLayout: (id: string, newName: string) => Promise<void>;
    updateCustomLayoutFromCurrent: (id: string) => Promise<void>;
    applyCustomLayout: (id: string) => void;
    loadCustomLayoutsFromBackup: () => Promise<void>;

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
            customLayouts: [],

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

            addStream: async (url: string, options = { withChat: true, withStream: true, displayName: undefined as string | undefined }) => {
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
                console.log('[addStream] parseStreamUrl result:', { finalUrl, streamData });
                if (!streamData || !streamData.platform) {
                    return { success: false, message: streamData?.error || '無法解析網址' };
                }

                // 2. Check Duplicates
                const existing = state.streams.find(s => s.originalUrl === finalUrl);
                if (existing) {
                    return { success: false, message: '此串流已存在', streamId: existing.id };
                }

                // Create new Stream Object
                const newId = Date.now();
                // Use provided displayName if available, otherwise fallback to channelId
                const customDisplayName = (options as any).displayName;
                let displayName = customDisplayName || streamData.channelId;
                let name = streamData.channelId;

                // Attempt to fetch Title for YouTube
                if (streamData.platform === 'youtube') {
                    // Default fallback
                    if (!displayName) {
                        if (streamData.videoId) {
                            displayName = `YouTube Video (${streamData.videoId})`;
                            name = 'YouTube Channel';
                        } else {
                            displayName = 'YouTube Stream';
                            name = 'YouTube Channel';
                        }
                    }

                    try {
                        const shouldUpdateTitle = !options.displayName; // Only update from API if no custom name provided

                        if (streamData.videoId) {
                            const info = await youtubeApi.getVideoInfo(streamData.videoId);
                            if (info && info.title) {
                                if (shouldUpdateTitle) displayName = info.title;
                                name = info.channelTitle || 'YouTube Channel';

                                if (!streamData.channelId && info.channelId) {
                                    streamData.channelId = info.channelId;
                                }
                            }
                        } else if (streamData.channelId) {
                            const title = await youtubeApi.getChannelTitleFromChannelId(streamData.channelId);
                            if (title) {
                                if (shouldUpdateTitle) displayName = title;
                                name = title;
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to fetch YouTube title:', e);
                        // Start using fallback automatically if fetch failed
                    }
                } else if (!displayName && streamData.platform === 'twitch') {
                    // Basic fallback for Twitch if parsing failed to get channelId (unlikely with regex)
                    displayName = streamData.channelId || 'Twitch Stream';
                }

                const newStream: StreamData = {
                    id: newId,
                    platform: streamData.platform!,
                    channelId: streamData.channelId,
                    videoId: streamData.videoId,
                    originalUrl: finalUrl,
                    volume: 50,
                    chatVisible: true,
                    isMuted: false,
                    name: name,
                    displayName: displayName
                };

                const newStreams = [...state.streams, newStream];
                const uniqueId = uuidv4().slice(0, 8);
                let newCanvasItems = [...state.canvasItems];

                if (state.layoutMode === 'canvas') {
                    // Hybrid Layout Logic with "Fill Empty Slot" Optimization

                    let streamPlaced = false;
                    let chatPlaced = false;

                    // 1. Try to fill empty STREAM slot (only if requested)
                    if (options?.withStream) {
                        const emptyStreamIndex = newCanvasItems.findIndex(i => i.type === 'stream' && !i.contentId);
                        if (emptyStreamIndex !== -1) {
                            newCanvasItems[emptyStreamIndex] = {
                                ...newCanvasItems[emptyStreamIndex],
                                i: `stream-${uniqueId}-${newStream.id}`, // Update ID to force refresh
                                contentId: newStream.id
                            };
                            streamPlaced = true;
                        }
                    }

                    // 2. Try to fill empty CHAT slot (only if requested)
                    if (options?.withChat) {
                        const emptyChatIndex = newCanvasItems.findIndex(i => i.type === 'chat' && !i.contentId);
                        if (emptyChatIndex !== -1) {
                            newCanvasItems[emptyChatIndex] = {
                                ...newCanvasItems[emptyChatIndex],
                                i: `chat-${uniqueId}-${newStream.id}`,
                                contentId: newStream.id
                            };
                            chatPlaced = true;
                        }
                    }

                    // 3. Calculate how many NEW items we still need to add
                    let addedCount = 0;
                    if (options?.withStream && !streamPlaced) addedCount++;
                    if (options?.withChat && !chatPlaced) addedCount++;

                    // Smart Layout / Infinite Flow Logic
                    const totalCurrentItems = newCanvasItems.length;
                    const streamCount = 1;

                    // Chat Cap Check: Only add chat if total chat count < 6
                    const currentChatCount = newCanvasItems.filter(i => i.type === 'chat').length;
                    const shouldAddChat = options?.withChat && !chatPlaced && currentChatCount < 6;

                    const newItemsCount = streamCount + (shouldAddChat ? 1 : 0);
                    const futureTotalItems = totalCurrentItems + newItemsCount;


                    // Decision: Smart Layout (Grid) vs Infinite Flow
                    if (futureTotalItems <= 16) {
                        // --- Smart Layout Mode (<= 16) ---
                        // Re-calculate layout for ALL items to distribute them evenly

                        // 1. Prepare list of items
                        const tempItems = [...newCanvasItems];

                        // 2. Add new items (Stream)
                        if (!streamPlaced) {
                            tempItems.push({
                                i: `stream-${uniqueId}-${newStream.id}`,
                                type: 'stream',
                                contentId: newStream.id,
                                layout: { x: 0, y: 0, w: 1, h: 1 } // Placeholder, will be autosized
                            });
                        }

                        // 3. Add new items (Chat) - ONLY if under cap
                        if (shouldAddChat) {
                            tempItems.push({
                                i: `chat-${uniqueId}-${newStream.id}`,
                                type: 'chat',
                                contentId: newStream.id,
                                layout: { x: 0, y: 0, w: 1, h: 1 } // Placeholder
                            });
                        }

                        // 4. Calculate Dual-Direction Smart Layout
                        // This positions Streams (Left->Right) and Chats (Right->Left)
                        newCanvasItems = calculateDualDirectionLayout(tempItems);

                        // 5. (Optional) Post-process or apply
                        // The items returned already have 'layout' set correctly.
                        // No mapping needed.

                    } else {
                        // --- Infinite Flow Mode (> 16) ---
                        // Append to bottom with fixed small size (Stream 6x6, Chat 4x6)

                        if (options?.withStream && !streamPlaced) {
                            // Use findAvailablePosition directly to enforce 6x6
                            const pos = findAvailablePosition(newCanvasItems, 6, 6);
                            newCanvasItems.push({
                                i: `stream-${uniqueId}-${newStream.id}`,
                                type: 'stream',
                                contentId: newStream.id,
                                layout: { x: pos.x, y: pos.y, w: 6, h: 6 }
                            });
                        }

                        if (shouldAddChat) {
                            const size = { w: 4, h: 6 };
                            const pos = findAvailablePosition(newCanvasItems, size.w, size.h);
                            newCanvasItems.push({
                                i: `chat-${uniqueId}-${newStream.id}`,
                                type: 'chat',
                                contentId: newStream.id,
                                layout: { x: pos.x, y: pos.y, w: size.w, h: size.h }
                            });
                        }
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

                return { success: true, streamId: newId };
            },

            addEmptyGroup: () => set(state => {
                let newCanvasItems = [...state.canvasItems];
                const uniqueId = uuidv4().slice(0, 8);

                // Always use "Infinite Flow Mode" logic (User Request: No Auto-Grid on Add)
                const chatSize = { w: 4, h: 6 }; // Chat size limit

                // Add Stream (Maximal Space) - Default 6x6
                // Use findAvailablePosition directly to enforce 6x6 and avoid maximizing
                const streamPos = findAvailablePosition(newCanvasItems, 6, 6);
                newCanvasItems.push({
                    i: `empty-stream-${uniqueId}`,
                    type: 'stream',
                    contentId: null,
                    layout: { x: streamPos.x, y: streamPos.y, w: 6, h: 6 }
                });

                // Add Chat - Default 4x6
                const chatPos = findAvailablePosition(newCanvasItems, chatSize.w, chatSize.h);
                newCanvasItems.push({
                    i: `empty-chat-${uniqueId}`,
                    type: 'chat',
                    contentId: null,
                    layout: { x: chatPos.x, y: chatPos.y, w: chatSize.w, h: chatSize.h }
                });

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
                            layout: { x: 0, y: Infinity, w: 6, h: 6 }
                        });
                        // Add Chat?
                        newCanvasItems.push({
                            i: `chat-${s.id}-${uuidv4()}`,
                            type: 'chat',
                            contentId: s.id,
                            layout: { x: 0, y: Infinity, w: 4, h: 6 }
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

                    // Remove associated canvas items completely
                    let newCanvasItems = state.canvasItems.filter(item => item.contentId !== id);

                    // Apply hybrid layout logic after removal
                    if (state.layoutMode === 'canvas') {
                        if (newCanvasItems.length <= 16 && newCanvasItems.length > 0) {
                            const specs = calculateAutoGridLayout(newCanvasItems.length);
                            newCanvasItems = newCanvasItems.map((item, idx) => {
                                const spec = specs[idx];
                                let w = spec.w;
                                let h = spec.h;
                                if (item.type === 'chat') {
                                    w = Math.min(spec.w, 4);
                                    h = Math.max(spec.h, 6);
                                }
                                return { ...item, layout: { ...spec, w, h } };
                            });
                        }
                        // If > 16 or 0 items, RGL will handle compaction naturally.
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
                        layout: { x: 0, y: 0, w: 6, h: 6 }
                    });
                    newCanvasItems.push({
                        i: `chat-${uniqueId}-${s.id}`,
                        type: 'chat',
                        contentId: s.id,
                        layout: { x: 8, y: 0, w: 4, h: 6 }
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

                let newItems: CanvasItem[] = [];

                // Always use "Find Empty Slot" logic (User Request: No Auto-Grid on Add)
                if (type === 'stream') {
                    // Use findAvailablePosition directly to enforce 6x6
                    const pos = findAvailablePosition(state.canvasItems, 6, 6);
                    newItems = [...state.canvasItems, {
                        i: id,
                        type,
                        contentId: streamId,
                        layout: { x: pos.x, y: pos.y, w: 6, h: 6 }
                    }];
                } else {
                    // Chat or others
                    const width = type === 'chat' ? 4 : 6;
                    const height = 6;
                    const pos = findAvailablePosition(state.canvasItems, width, height);
                    newItems = [...state.canvasItems, {
                        i: id,
                        type,
                        contentId: streamId,
                        layout: { x: pos.x, y: pos.y, w: width, h: height }
                    }];
                }

                return {
                    canvasItems: newItems
                };
            }),

            removeCanvasItem: (id) => set(state => {
                const filtered = state.canvasItems.filter(item => item.i !== id);

                // If we dropped to <= 16, trigger Auto-Grid Layout recalculation
                if (filtered.length <= 16 && filtered.length > 0) {
                    const specs = calculateAutoGridLayout(filtered.length);
                    const tentativeItems = filtered.map((item, idx) => ({
                        ...item,
                        layout: specs[idx]
                    }));
                    const reordered = repackAndMaximizeRows(tentativeItems);
                    return { canvasItems: reordered };
                }

                return {
                    canvasItems: filtered
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
            }),

            saveCustomLayout: async (name: string) => {
                const state = get();
                const slots: LayoutSlot[] = state.canvasItems.map(item => ({
                    x: item.layout.x,
                    y: item.layout.y,
                    w: item.layout.w,
                    h: item.layout.h,
                    type: item.type
                }));

                const newLayout: CustomLayout = {
                    id: uuidv4(),
                    name,
                    slots,
                    createdAt: Date.now()
                };

                const updatedLayouts = [...state.customLayouts, newLayout];
                set({ customLayouts: updatedLayouts });

                // Sync to backup
                await layoutStorage.saveToBackup(updatedLayouts);
            },

            deleteCustomLayout: async (id: string) => {
                const state = get();
                const updatedLayouts = state.customLayouts.filter(l => l.id !== id);
                set({ customLayouts: updatedLayouts });
                await layoutStorage.saveToBackup(updatedLayouts);
            },

            renameCustomLayout: async (id: string, newName: string) => {
                const state = get();
                const updatedLayouts = state.customLayouts.map(l =>
                    l.id === id ? { ...l, name: newName } : l
                );
                set({ customLayouts: updatedLayouts });
                await layoutStorage.saveToBackup(updatedLayouts);
            },

            updateCustomLayoutFromCurrent: async (id: string) => {
                const state = get();
                // 1. Get current items and transform to slots
                const currentSlots: LayoutSlot[] = state.canvasItems.map(item => ({
                    x: item.layout.x,
                    y: item.layout.y,
                    w: item.layout.w,
                    h: item.layout.h,
                    type: item.type as 'stream' | 'chat'
                }));

                // 2. Update the target layout
                const updatedLayouts = state.customLayouts.map(l =>
                    l.id === id ? { ...l, slots: currentSlots } : l
                );

                set({ customLayouts: updatedLayouts });
                await layoutStorage.saveToBackup(updatedLayouts);
            },

            loadCustomLayoutsFromBackup: async () => {
                const layouts = await layoutStorage.loadFromBackup();
                if (layouts && layouts.length > 0) {
                    // Merge strategy: Unique by ID, or prefer backup?
                    // For now, let's just use what's in local storage as truth, 
                    // but if local is empty, restore from backup.
                    const current = get().customLayouts;
                    if (current.length === 0) {
                        set({ customLayouts: layouts });
                    }
                }
            },

            applyCustomLayout: (id: string) => {
                const state = get();
                const layout = state.customLayouts.find(l => l.id === id);
                if (!layout) return;

                // 1. Harvest current content
                // Streams: We use state.streams as the source of truth for active streams.
                const streamIds = state.streams.map(s => s.id);

                // Chats: We use existing canvasItems to find active chat windows.
                // We sort them by position to respect visual order "first one fills first slot".
                const currentChatItems = state.canvasItems
                    .filter(i => i.type === 'chat' && i.contentId)
                    .sort((a, b) => {
                        if (a.layout.y !== b.layout.y) return a.layout.y - b.layout.y;
                        return a.layout.x - b.layout.x;
                    });

                const chatIds = currentChatItems.map(i => i.contentId!);

                const newItems: CanvasItem[] = [];
                const placedStreamIds = new Set<number>();

                // Queues for distribution
                const streamQueue = [...streamIds];
                const chatQueue = [...chatIds];

                // 2. Fill Slots from Layout Template
                layout.slots.forEach((slot) => {
                    const itemLayout = { x: slot.x, y: slot.y, w: slot.w, h: slot.h };
                    const slotType = slot.type || 'stream'; // Default to stream if undefined

                    if (slotType === 'stream') {
                        const sId = streamQueue.shift();
                        if (sId !== undefined) {
                            newItems.push({
                                i: `stream-${uuidv4()}-${sId}`,
                                type: 'stream',
                                contentId: sId,
                                layout: itemLayout
                            });
                            placedStreamIds.add(sId);
                        } else {
                            // Create Empty Stream Window
                            newItems.push({
                                i: `empty-stream-${uuidv4()}`,
                                type: 'stream',
                                contentId: null, // Empty
                                layout: itemLayout
                            });
                        }
                    } else if (slotType === 'chat') {
                        const cId = chatQueue.shift();
                        if (cId !== undefined) {
                            newItems.push({
                                i: `chat-${uuidv4()}-${cId}`,
                                type: 'chat',
                                contentId: cId,
                                layout: itemLayout
                            });
                        } else {
                            // Create Empty Chat Window
                            newItems.push({
                                i: `empty-chat-${uuidv4()}`,
                                type: 'chat',
                                contentId: null, // Empty
                                layout: itemLayout
                            });
                        }
                    }
                });

                // 3. Handle Overflow
                // Rule: "Prioritize showing streams" -> overflow streams should be added.
                // Rule: "Multiple chat rooms then do not join" -> overflow chats are IGNORED.

                while (streamQueue.length > 0) {
                    const sId = streamQueue.shift()!;
                    // Find position for overflow stream
                    const pos = findAvailablePosition(newItems, 12, 12, 24);
                    newItems.push({
                        i: `stream-${uuidv4()}-${sId}`,
                        type: 'stream',
                        contentId: sId,
                        layout: { x: pos.x, y: pos.y, w: 12, h: 12 }
                    });
                }

                set({ canvasItems: newItems, layoutMode: 'canvas' });
            },
        }),

        {
            name: 'stream-storage',
            partialize: (state) => ({
                streams: state.streams,
                layoutMode: state.layoutMode,
                presets: state.presets,
                canvasItems: state.canvasItems,
                customLayouts: state.customLayouts
            })
        }
    )
);


