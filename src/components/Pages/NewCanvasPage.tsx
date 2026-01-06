/**
 * NewCanvasPage - High Performance Canvas Page
 * Uses SimpleCanvas instead of react-grid-layout
 */

import { useEffect, useCallback, useMemo } from 'react';
import { DynamicIsland } from '../Navigation/DynamicIsland';
import { SimpleCanvas, CanvasWindow, WindowRenderProps } from '../Canvas';
import { useStreamStore } from '../../store/useStreamStore';
import { CanvasStreamContent } from './CanvasStreamContent';
import { EmptyWindowContent } from '../Canvas/EmptyWindowContent';

export const NewCanvasPage = () => {
    const setLayoutMode = useStreamStore(s => s.setLayoutMode);
    const streams = useStreamStore(s => s.streams);
    const canvasItems = useStreamStore(s => s.canvasItems);
    const updateCanvasLayout = useStreamStore(s => s.updateCanvasLayout);
    const removeCanvasItem = useStreamStore(s => s.removeCanvasItem);

    useEffect(() => {
        setLayoutMode('canvas');
    }, [setLayoutMode]);

    // Convert canvasItems to SimpleCanvas windows format
    const windows: CanvasWindow[] = useMemo(() => {
        return canvasItems.map(item => ({
            id: item.i,
            gridX: item.layout.x,
            gridY: item.layout.y,
            gridW: item.layout.w,
            gridH: item.layout.h,
            contentId: item.contentId ?? undefined,
            type: item.type as 'stream' | 'chat',
            title: (() => {
                if (!item.contentId) return undefined;
                const stream = streams.find(s => s.id === item.contentId);
                return stream?.displayName || stream?.name || stream?.channelId;
            })()
        }));
    }, [canvasItems, streams]);

    // Handle window update
    const handleWindowUpdate = useCallback((updatedWindows: CanvasWindow[]) => {
        // Convert back to canvasItems layout format
        const layout = updatedWindows.map(w => ({
            i: w.id,
            x: w.gridX,
            y: w.gridY,
            w: w.gridW,
            h: w.gridH
        }));
        updateCanvasLayout(layout);
    }, [updateCanvasLayout]);

    // Handle window remove
    const handleWindowRemove = useCallback((id: string) => {
        // 1. Get current state to verify window type
        const state = useStreamStore.getState();
        const item = state.canvasItems.find(i => i.i === id);

        // 2. Remove the visual window (Canvas Item)
        removeCanvasItem(id);

        // 3. If it's a stream window, we MUST remove the actual stream data
        // This ensures it disappears from Media Control Panel and stops playing.
        if (item && item.type === 'stream' && item.contentId) {
            console.log('[NewCanvasPage] Removing stream data for closed window:', item.contentId);
            state.removeStream(item.contentId);
        }
    }, [removeCanvasItem]);

    // Render content for each window - now receives WindowRenderProps
    const renderContent = useCallback((window: CanvasWindow, renderProps: WindowRenderProps) => {
        // Callback to update window content (passed to EmptyWindow)
        const handleUpdateWindow = (id: string, updates: any) => {
            // DEBUG: trace canvas item update flow
            console.log('[NewCanvasPage] handleUpdateWindow:', { id, updates });
            // We need a way to update the specific canvas item by its ID (window.id is the item.i)
            // useStreamStore's updateCanvasItem takes (itemId, updates)
            useStreamStore.getState().updateCanvasItem(id, updates);
        };

        if (!window.contentId) {
            return (
                <EmptyWindowContent
                    windowId={window.id}
                    type={window.type}
                    onUpdateWindow={handleUpdateWindow}
                    renderProps={renderProps}
                />
            );
        }

        const stream = streams.find(s => s.id === window.contentId);
        console.log('[NewCanvasPage] renderContent stream lookup:', {
            windowId: window.id,
            contentId: window.contentId,
            streamFound: !!stream,
            allStreamIds: streams.map(s => s.id)
        });
        if (!stream) {
            // If stream not found but we have an ID, maybe render empty or error
            // Fallback to empty for now but keep ID just in case? 
            // Better to show "Stream Not Found" or reset.
            // Let's render EmptyWindowContent but maybe with a warning? 
            // Or just the placeholder text as before but cleaner.
            return (
                <div className="w-full h-full flex items-center justify-center text-white/50 text-sm bg-slate-900 border border-white/10 rounded-lg">
                    串流未找到 (ID: {window.contentId})
                </div>
            );
        }

        return (
            <CanvasStreamContent
                stream={stream}
                windowType={window.type}
                renderProps={renderProps}
                windowId={window.id} // Pass window ID for updates if needed
            />
        );
    }, [streams]);

    return (
        <div className="w-full h-screen bg-black overflow-hidden relative">
            {/* Canvas Layer */}
            <div className="absolute inset-0 z-0">
                <SimpleCanvas
                    windows={windows}
                    onWindowUpdate={handleWindowUpdate}
                    onWindowRemove={handleWindowRemove}
                    renderContent={renderContent}
                />
            </div>

            {/* UI Layer (Dynamic Island) */}
            <div className="pointer-events-none absolute inset-0 z-50">
                <DynamicIsland />
            </div>
        </div>
    );
};
