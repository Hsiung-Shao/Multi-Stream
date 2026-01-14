import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { useUIStore } from './useUIStore';
import { StreamData, parseStreamUrl, validateUrl } from '../utils/streamUtils';
import { youtubeApi } from '../utils/youtubeApi';
import { ChatLayoutType } from '../utils/chatLayoutUtils';
import { LayoutType, autoSelectLayout, isLayoutOverCapacity } from '../utils/layoutUtils';
import { CanvasItem, CanvasItemType, LayoutPreset } from '../types/canvas';
import { generateStandardLayout } from '../utils/canvasUtils';
import { LayoutMode, layoutTemplates, generateLayoutFromTemplate, calculateAutoGridLayout } from '../utils/layoutPresets';
import { findAvailablePosition } from '../utils/layoutEngine';
// import { calculateDualDirectionLayout } from '../utils/layoutPresets'; // Removed old import
import { CustomLayout, LayoutSlot } from '../types/canvas';
import { layoutStorage } from '../utils/layoutStorage';
import { logEvent, isTrackingEnabled } from '../utils/analytics';
import { userSegmentationManager, FEATURE_FLAGS } from '../utils/userSegmentation';

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
    addStream: (url: string, options?: { withChat?: boolean, withStream?: boolean, displayName?: string, targetWindowId?: string }) => Promise<{ success: boolean; message?: string; streamId?: number }>;
    removeStream: (id: number, forceRemove?: boolean) => void;
    moveStream: (fromIndex: number, toIndex: number) => void;
    setChatLayout: (layout: ChatLayoutType) => void;
    setLayout: (layout: LayoutType, isUserAction?: boolean) => void;
    updateStream: (id: number, updates: Partial<StreamData>) => void;
    setStreams: (streams: StreamData[]) => void;
    setAllMuted: (muted: boolean) => void;

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
    applyTemplateLayout: (templateId: string) => void;
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

            addStream: async (url: string, options = { withChat: true, withStream: true, displayName: undefined as string | undefined, targetWindowId: undefined as string | undefined }) => {
                try {
                    const state = get();

                    // Check limits
                    if (state.streams.length >= 16) {
                        return { success: false, message: 'Max streams reached' };
                    }
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

                    // Attempt to fetch Title for YouTube
                    if (streamData.platform === 'youtube') {
                        // Default fallback
                        if (!displayName) {
                            if (streamData.videoId) {
                                displayName = `YouTube Video (${streamData.videoId})`;
                            } else {
                                displayName = 'YouTube Stream';
                            }
                        }

                        try {
                            const shouldUpdateTitle = !options.displayName; // Only update from API if no custom name provided

                            if (streamData.videoId) {
                                const info = await youtubeApi.getVideoInfo(streamData.videoId);
                                if (info && info.title) {
                                    if (shouldUpdateTitle) displayName = info.title;

                                    if (!streamData.channelId && info.channelId) {
                                        streamData.channelId = info.channelId;
                                    }
                                }
                            } else if (streamData.channelId) {
                                const title = await youtubeApi.getChannelTitleFromChannelId(streamData.channelId);
                                if (title) {
                                    if (shouldUpdateTitle) displayName = title;
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
                        displayName: displayName
                    };

                    const newStreams = [...state.streams, newStream];
                    let newCanvasItems = [...state.canvasItems];

                    if (state.layoutMode === 'canvas') {
                        // Smart Layout System: Template-Based Architecture

                        // 0. Check for Empty Slots (Targeted or Global)
                        // If targetWindowId is provided, we MUST use it or fail to fill it? 
                        // Actually, if provided, we find that specific index.

                        let targetSlotIndex = -1;

                        if (options.targetWindowId) {
                            targetSlotIndex = state.canvasItems.findIndex(i => i.i === options.targetWindowId && i.contentId === null);
                        }

                        // Fallback to finding ANY empty stream slot if no target or target invalid
                        if (targetSlotIndex === -1 && !options.targetWindowId) {
                            targetSlotIndex = state.canvasItems.findIndex(i => i.type === 'stream' && i.contentId === null);
                        }

                        if (targetSlotIndex !== -1) {
                            // --- Strategy A: Fill Empty Slot ---

                            // 1. Fill the Stream Slot
                            newCanvasItems = state.canvasItems.map((item, index) => {
                                if (index === targetSlotIndex) {
                                    return { ...item, contentId: newId };
                                }
                                return item;
                            });

                            // 2. Fill Paired Chat Slot (if withChat)
                            // Safety Check: If the TARGET itself was a chat window, we should NOT go looking for another chat window to fill "pair".
                            const targetIsChat = state.canvasItems[targetSlotIndex].type === 'chat';

                            if (options.withChat && !targetIsChat) {
                                // Try to find a chat with the same unique ID suffix
                                // ID format: type-layoutId-uniqueId or similar?
                                // addEmptyGroup uses: `empty-stream-${uniqueId}` and `empty-chat-${uniqueId}`

                                const targetItem = state.canvasItems[targetSlotIndex];
                                // Extract suffix after 'stream-'
                                // If ID starts with 'empty-stream-', suffix is the rest.
                                // But ID could be anything if it came from template? 
                                // Standard RGL IDs from presets: `stream-${uuid}-${streamId}` (not helpful for empty)
                                // Empty IDs: `empty-stream-${uniqueId}`

                                let pairedChatIndex = -1;

                                if (targetItem.i && targetItem.i.startsWith('empty-stream-')) {
                                    const suffix = targetItem.i.replace('empty-stream-', '');
                                    const expectedChatId = `empty-chat-${suffix}`;
                                    pairedChatIndex = newCanvasItems.findIndex(i => i.i === expectedChatId && i.contentId === null);
                                }

                                // If no paired found, fallback to finding ANY empty chat (legacy behavior, but optional)
                                // User request implies "don't mess up layout". 
                                // Prioritize paired. If not found, maybe just don't add chat? 
                                // Or find nearest? Let's stick to Paired First.
                                // If no pair, fall back to "First Available Empty Chat" to be helpful?
                                // Maybe better to NOT fill random chats to avoid confusion.

                                if (pairedChatIndex !== -1) {
                                    newCanvasItems[pairedChatIndex] = { ...newCanvasItems[pairedChatIndex], contentId: newId };
                                } else {
                                    // Find all empty streams and chats to determine RANK
                                    // This assumes strict N:N correspondence in templates (which is true for N=1~6 with_chat)
                                    // S1, S2, S3... C1, C2, C3...
                                    // Rank of S[i] among empty streams should equal Rank of C[i] among empty chats.

                                    const emptyStreams = state.canvasItems.filter(i => i.type === 'stream' && i.contentId === null);
                                    const emptyChats = state.canvasItems.filter(i => i.type === 'chat' && i.contentId === null);

                                    // Find my rank among empty streams
                                    // targetItem is state.canvasItems[targetSlotIndex]
                                    const myRank = emptyStreams.findIndex(i => i.i === targetItem.i);

                                    if (myRank !== -1 && myRank < emptyChats.length) {
                                        // Pick the chat with the same rank
                                        const targetChat = emptyChats[myRank];
                                        const chatIndexInCanvas = newCanvasItems.findIndex(i => i.i === targetChat.i);

                                        if (chatIndexInCanvas !== -1) {
                                            newCanvasItems[chatIndexInCanvas] = { ...newCanvasItems[chatIndexInCanvas], contentId: newId };
                                        }
                                    } else {
                                        // Still fallback to first available if rank matching fails
                                        const firstEmptyChat = newCanvasItems.findIndex(i => i.type === 'chat' && i.contentId === null);
                                        if (firstEmptyChat !== -1) {
                                            newCanvasItems[firstEmptyChat] = { ...newCanvasItems[firstEmptyChat], contentId: newId };
                                        }
                                    }
                                }
                            }
                        } else {
                            // --- Strategy B: Smart Layout Reflow (No empty slots available) ---

                            // 1. Determine Target Layout Mode
                            // If the user requests chat, OR if we are adding a chat window, we favor 'with_chat' mode.
                            // However, for consistency, we base it on the resulting composition.
                            // If options.withChat is true, we act in 'with_chat' mode for this operation.
                            const targetMode: LayoutMode = (options.withChat) ? 'with_chat' : 'video_only';
                            const streamCount = newStreams.length;

                            // 2. Select Template
                            // We look for a template that matches the count and mode.
                            let targetItems: any[] = [];
                            const template = layoutTemplates.find(t => t.count === streamCount && t.type === targetMode);

                            if (template) {
                                // Generate items from template
                                const streamIds = newStreams.map(s => s.id);
                                targetItems = generateLayoutFromTemplate(template.id, streamIds);
                            } else {
                                // Fallback: Auto Grid (Video Only default for large numbers)
                                // If count > 6 or no template found, we use auto grid.
                                const specs = calculateAutoGridLayout(streamCount);
                                const streamIds = newStreams.map(s => s.id);

                                targetItems = specs.map((spec, index) => ({
                                    type: 'stream',
                                    contentId: streamIds[index],
                                    layout: spec,
                                    i: `stream-${uuidv4().slice(0, 8)}-${streamIds[index]}` // Temp ID, will be resolved below
                                }));
                            }

                            // 3. ID Preservation (Diff & Patch)
                            // We maintain a pool of available items to ensure we don't reuse the same item twice
                            const availableItems = [...state.canvasItems];

                            newCanvasItems = targetItems.map(target => {
                                const matchIndex = availableItems.findIndex(
                                    prev => prev.type === target.type && prev.contentId === target.contentId
                                );

                                if (matchIndex !== -1) {
                                    // Reuse existing item
                                    const existingItem = availableItems[matchIndex];
                                    availableItems.splice(matchIndex, 1); // Remove from pool

                                    // Preserve the ID ('i') but update the layout
                                    return {
                                        ...existingItem,
                                        layout: {
                                            x: target.layout?.x ?? target.x,
                                            y: target.layout?.y ?? target.y,
                                            w: target.layout?.w ?? target.w,
                                            h: target.layout?.h ?? target.h
                                        }
                                    };
                                } else {
                                    // Create new item
                                    return {
                                        ...target,
                                        layout: {
                                            x: target.layout?.x ?? target.x,
                                            y: target.layout?.y ?? target.y,
                                            w: target.layout?.w ?? target.w,
                                            h: target.layout?.h ?? target.h
                                        },
                                        i: target.i || `${target.type}-${uuidv4().slice(0, 8)}-${target.contentId || 'empty'}`
                                    };
                                }
                            });
                        }
                    } else {
                        // Legacy / Layout Mode Auto Reflow
                        // This part runs if layoutMode is NOT 'canvas'. 
                        // But we usually are in 'canvas' mode for this app now.
                        // Keep existing logic or update? 
                        // We should probably force canvas mode logic or just leave it for now if 'auto' mode is deprecated.
                        // Assuming 'canvas' mode is primary.
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
                } catch (error) {
                    console.error('[addStream] Error:', error);
                    return { success: false, message: 'Failed to add stream' };
                }
            },

            addEmptyGroup: () => set(state => {
                let newCanvasItems = [...state.canvasItems];
                const uniqueId = uuidv4().slice(0, 8);

                // Always use "Infinite Flow Mode" logic (User Request: No Auto-Grid on Add)


                // Add Stream (Default 6x6)
                // user request: "1.串流: 6x6" "2.聊天: 4x6"
                const streamPos = findAvailablePosition(newCanvasItems, 6, 6);
                newCanvasItems.push({
                    i: `empty-stream-${uniqueId}`,
                    type: 'stream',
                    contentId: null,
                    layout: { x: streamPos.x, y: streamPos.y, w: 6, h: 6 }
                });

                // Add Chat (Default 4x6)
                // user request: "2.聊天: 4x6"
                const chatPos = findAvailablePosition(newCanvasItems, 4, 6);
                newCanvasItems.push({
                    i: `empty-chat-${uniqueId}`,
                    type: 'chat',
                    contentId: null,
                    layout: { x: chatPos.x, y: chatPos.y, w: 4, h: 6 }
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

            // Updated removeStream to support Close Window Mode
            removeStream: (id: number, forceRemove = false) => {
                set(state => {
                    const { closeWindowMode } = useUIStore.getState();
                    const shouldKeepEmpty = !forceRemove && closeWindowMode === 'empty';

                    // 1. Remove Stream Data (Always happens)
                    const newStreams = state.streams.filter(s => s.id !== id);
                    const currentCount = newStreams.length;

                    // 2. Handle Canvas Items
                    let newCanvasItems = state.canvasItems;

                    if (shouldKeepEmpty) {
                        // "Empty" Mode: Keep windows but clear contentId
                        newCanvasItems = state.canvasItems.map(item => {
                            if (item.contentId === id) {
                                return { ...item, contentId: null };
                            }
                            return item;
                        });
                    } else {
                        // "Remove" Mode (or Forced): Remove windows completely
                        newCanvasItems = state.canvasItems.filter(item => item.contentId !== id);
                    }

                    // 3. Layout Handling
                    // If we are NOT in empty mode, we must reflow the layout to matches the new count.
                    if (!shouldKeepEmpty) {
                        const streamCount = newStreams.length;
                        // Determine implied mode based on previous state content
                        // If we had any chat windows, we try to maintain 'with_chat' mode if possible/logical.
                        const hasChat = state.canvasItems.some(i => i.type === 'chat');
                        const mode: LayoutMode = hasChat ? 'with_chat' : 'video_only';

                        // Select Template
                        const template = layoutTemplates.find(t => t.count === streamCount && t.type === mode);
                        let targetItems: any[] = [];
                        const streamIds = newStreams.map(s => s.id);

                        if (template) {
                            targetItems = generateLayoutFromTemplate(template.id, streamIds);
                        } else {
                            // Fallback Auto Grid
                            const specs = calculateAutoGridLayout(streamCount);
                            targetItems = specs.map((spec, index) => ({
                                type: 'stream',
                                contentId: streamIds[index],
                                layout: spec,
                                i: `stream-${uuidv4().slice(0, 8)}-${streamIds[index]}` // Temp
                            }));
                        }

                        // Diff & Patch ID Preservation
                        // Diff & Patch ID Preservation
                        const availableItems = [...state.canvasItems];
                        newCanvasItems = targetItems.map(target => {
                            const matchIndex = availableItems.findIndex(p => p.type === target.type && p.contentId === target.contentId);

                            if (matchIndex !== -1) {
                                const existing = availableItems[matchIndex];
                                availableItems.splice(matchIndex, 1);
                                return { ...existing, layout: { ...target.layout } }; // target.layout is likely valid here from fallback or template? 
                                // Wait, template returns x,y. Fallback returns layout object.
                                // We need the robust check here too.
                            }

                            // Re-constructing layout object carefully
                            const layout = target.layout || { x: target.x, y: target.y, w: target.w, h: target.h };

                            return {
                                ...target,
                                layout: layout,
                                i: target.i || `${target.type}-${uuidv4().slice(0, 8)}-${target.contentId || 'empty'}`
                            };
                        });
                    }

                    // Update layout property (legacy)
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
                set(state => {
                    const newStreams = state.streams.map(s => {
                        if (s.id !== id) return s;

                        // Apply updates
                        const updatedStream = { ...s, ...updates };

                        // Special Logic: If user manually changes `isMuted`, 
                        // and we have a stored `_restoreMuteState` (implying we are in a Master Mute session),
                        // we must update the _restoreMuteState to match the new user preference.
                        // This ensures that when Master Mute is released, we don't revert to an old state
                        // that the user has explicitly overridden.
                        if (updates.isMuted !== undefined && s._restoreMuteState !== undefined) {
                            updatedStream._restoreMuteState = updates.isMuted;
                        }
                        return updatedStream;
                    });

                    return { streams: newStreams };
                });
            },

            setAllMuted: (muted: boolean) => {
                set(state => ({
                    streams: state.streams.map(s => {
                        if (muted) {
                            // Enable Master Mute
                            // Save current state (if not already saved - though usually it's cleared on unmute)
                            // If _restoreMuteState exists, maybe we are re-applying? checking s.isMuted is safer.
                            return {
                                ...s,
                                isMuted: true,
                                // Save current 'isMuted' as the restore target. 
                                // CAUTION: If we toggle True -> True, we shouldn't overwrite if already saved?
                                // But UI safeguards usually Toggle. 
                                // Let's assume we save the state 'just before' muting.
                                _restoreMuteState: s.isMuted
                            };
                        } else {
                            // Disable Master Mute (Unmute All / Restore)
                            // Restore to saved state, or default to false (unmuted)
                            // If _restoreMuteState is undefined, it means stream was added during mute or some other edge case.
                            // Defaulting to false (unmuted) is safe for "Unmute All" semantics.
                            const restoreState = s._restoreMuteState !== undefined ? s._restoreMuteState : false;

                            // Remove the temporary state
                            const { _restoreMuteState, ...rest } = s;
                            return { ...rest, isMuted: restoreState };
                        }
                    })
                }));
            },

            setChatLayout: (layout) => set({ chatLayout: layout }),

            setLayout: (layout, isUserAction = true) => {
                set((state) => {
                    const changes: Partial<StreamStoreState> = isUserAction ? { layout, userLayout: layout } : { layout };

                    // If in Canvas Mode, apply standard layout transformations immediately
                    if (state.layoutMode === 'canvas') {
                        let standardType: 'grid' | 'focus' | 'flow' = 'grid';

                        // Map legacy ID to standard types
                        if (layout === 5) {
                            standardType = 'focus';
                        }
                        // Layout 1, 2, 3, 4, 6, 9 are all variations of 'grid' in the new engine
                        // passed with different parameters?
                        // Actually generateStandardLayout (Focus) is hardcoded for 1 Main + Side.
                        // generateStandardLayout (Grid) is generic N x M.
                        // So for 1, 2, 3, 4, 6, 9 -> 'grid' is correct, as it auto-calculates NxM based on count.
                        // However, user might expect Alt+2 to force 2 columns?
                        // generateStandardLayout logic currently auto-calculates colCount based on sqrt(count).
                        // It doesn't take "target columns" as input.
                        // We might need to enhance generateStandardLayout if we want strict "Split Horizontal" vs "Split Vertical" behavior for N=2.
                        // BUT, for now, just applying 'grid' or 'focus' is a huge improvement over "doing nothing".

                        // We can reuse the logic from applyStandardLayoutToCanvas but inside here to be atomic
                        const newCanvasItems = generateStandardLayout(
                            state.canvasItems,
                            standardType,
                            state.streams.length,
                            window.innerWidth,
                            window.innerHeight
                        );
                        changes.canvasItems = newCanvasItems;
                    }

                    return changes;
                });
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

                return { streams: streams, layout: newLayout, canvasItems: newCanvasItems };
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

            removeCanvasItem: (id) => {
                const { closeWindowMode } = useUIStore.getState();
                const state = get(); // Access current state
                const itemToRemove = state.canvasItems.find(item => item.i === id);

                if (!itemToRemove) return;

                // 1. If ALREADY Empty Window (no contentId), ALWAYS Remove
                if (!itemToRemove.contentId) {
                    set(state => ({
                        canvasItems: state.canvasItems.filter(item => item.i !== id)
                    }));
                    return;
                }

                // 2. If has content, check Mode
                if (closeWindowMode === 'empty') {
                    // "Keep Empty Window" Mode
                    if (itemToRemove.type === 'stream' && itemToRemove.contentId) {
                        const streamId = itemToRemove.contentId;

                        // Clear content ID (make it empty)
                        set(state => ({
                            canvasItems: state.canvasItems.map(item =>
                                item.i === id ? { ...item, contentId: null } : item
                            )
                        }));

                        // Remove Stream Data but DO NOT force remove the canvas item
                        // (WE just handled the canvas item update above)
                        get().removeStream(streamId, false);
                        return;
                    } else {
                        // Chat Window: Just clear contentId
                        set(state => ({
                            canvasItems: state.canvasItems.map(item =>
                                item.i === id ? { ...item, contentId: null } : item
                            )
                        }));
                        return;
                    }
                }

                // "Remove" Mode (Default): Completely remove item
                set(state => {
                    const filtered = state.canvasItems.filter(item => item.i !== id);
                    return { canvasItems: filtered };
                });

                // Cleanup Stream Data if needed (for Remove mode)
                if (itemToRemove.type === 'stream' && itemToRemove.contentId) {
                    get().removeStream(itemToRemove.contentId, true);
                }
            },

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
                    // GA4 追蹤：套用預設布局
                    if (isTrackingEnabled()) {
                        logEvent('Layout', 'apply_preset', preset.name || id);
                        userSegmentationManager.recordFeatureUsage(FEATURE_FLAGS.LAYOUT_SWITCH);
                    }
                    return { canvasItems: preset.items };
                }
                return {};
            }),

            applyAutoLayout: (mode: LayoutMode) => set(state => {
                const streamIds = state.streams.map(s => s.id);
                const count = streamIds.length;

                const template = layoutTemplates.find(t => t.count === count && t.type === mode);
                let targetItems: any[] = [];

                if (template) {
                    targetItems = generateLayoutFromTemplate(template.id, streamIds);
                } else {
                    const specs = calculateAutoGridLayout(count);
                    targetItems = specs.map((spec, index) => ({
                        type: 'stream',
                        contentId: streamIds[index],
                        layout: spec,
                    }));
                }

                const availableItems = [...state.canvasItems];
                const newItems = targetItems.map(target => {
                    const matchIndex = availableItems.findIndex(p => p.type === target.type && p.contentId === target.contentId);

                    if (matchIndex !== -1) {
                        const existing = availableItems[matchIndex];
                        availableItems.splice(matchIndex, 1);

                        // Handle potential simple x,y vs layout object
                        const newLayout = target.layout || { x: target.x, y: target.y, w: target.w, h: target.h };
                        return { ...existing, layout: newLayout };
                    }

                    const layout = target.layout || { x: target.x, y: target.y, w: target.w, h: target.h };
                    return {
                        ...target,
                        layout,
                        i: target.i || `${target.type}-${uuidv4().slice(0, 8)}-${target.contentId || 'empty'}`
                    };
                });

                return { canvasItems: newItems };
            }),

            applyTemplateLayout: (templateId) => set(state => {
                const template = layoutTemplates.find(t => t.id === templateId);
                if (!template) return {};

                // GA4 追蹤：套用模板布局
                if (isTrackingEnabled()) {
                    logEvent('Layout', 'apply_preset', templateId);
                    userSegmentationManager.recordFeatureUsage(FEATURE_FLAGS.LAYOUT_SWITCH);
                }

                // 1. Prepare Stream IDs
                // We need at least template.count IDs. 
                // If we have fewer streams, we pad with null (creating empty windows).
                // If we have more, we only use the first N (others are hidden from canvas).
                const currentStreamIds = state.streams.map(s => s.id);
                const needed = template.count;

                const processingIds: (number | null)[] = [...currentStreamIds];

                // Pad with nulls if needed
                while (processingIds.length < needed) {
                    processingIds.push(null);
                }

                // 2. Generate Items
                // The template generator uses the IDs provided (including nulls)
                // Note: The generator assumes input array covers indices 0..N-1
                // We pass the full array, it slices inside.
                const newItemsSpecs = template.generate(processingIds);

                // 3. Convert Specs to CanvasItems
                const availableItems = [...state.canvasItems];

                const newCanvasItems: CanvasItem[] = newItemsSpecs.map(spec => {
                    // Optimization: Reuse ID if matching content exists
                    let existingId: string | null = null;
                    let existingItem: CanvasItem | null = null;

                    if (spec.contentId || spec.contentId === null) {
                        // Even for null (empty), we try to reuse one to avoid churn, 
                        // BUT we must avoid duplicates.
                        const matchIndex = availableItems.findIndex(item =>
                            item.type === spec.type && item.contentId === spec.contentId
                        );

                        if (matchIndex !== -1) {
                            existingItem = availableItems[matchIndex];
                            availableItems.splice(matchIndex, 1);
                            existingId = existingItem.i;
                        }
                    }

                    return {
                        i: existingId || `${spec.type}-${uuidv4()}-${spec.contentId || 'empty'}`,
                        type: spec.type,
                        contentId: spec.contentId || null,
                        layout: { x: spec.x, y: spec.y, w: spec.w, h: spec.h }
                    };
                });

                return { canvasItems: newCanvasItems };
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

                // GA4 追蹤：儲存自訂布局
                if (isTrackingEnabled()) {
                    logEvent('Layout', 'create_custom', name);
                    userSegmentationManager.recordFeatureUsage(FEATURE_FLAGS.CUSTOM_LAYOUT);
                }

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

                // GA4 追蹤：套用自訂布局
                if (isTrackingEnabled()) {
                    logEvent('Layout', 'apply_custom', layout.name || id);
                    userSegmentationManager.recordFeatureUsage(FEATURE_FLAGS.LAYOUT_SWITCH);
                }

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


