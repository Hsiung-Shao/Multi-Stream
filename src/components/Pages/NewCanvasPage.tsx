/**
 * NewCanvasPage - High Performance Canvas Page
 * Uses SimpleCanvas instead of react-grid-layout
 */

import { useEffect, useCallback, useMemo } from 'react';
import { DynamicIsland } from '../Navigation/DynamicIsland';
import { SimpleCanvas, CanvasWindow, WindowRenderProps } from '../Canvas';
import { useStreamStore } from '../../store/useStreamStore';
import { CanvasStreamContent } from './CanvasStreamContent';

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
        removeCanvasItem(id);
    }, [removeCanvasItem]);

    // Render content for each window - now receives WindowRenderProps
    const renderContent = useCallback((window: CanvasWindow, renderProps: WindowRenderProps) => {
        if (!window.contentId) {
            return (
                <div className="w-full h-full flex items-center justify-center text-white/50 text-sm">
                    空視窗
                </div>
            );
        }

        const stream = streams.find(s => s.id === window.contentId);
        if (!stream) {
            return (
                <div className="w-full h-full flex items-center justify-center text-white/50 text-sm">
                    串流未找到
                </div>
            );
        }

        return (
            <CanvasStreamContent
                stream={stream}
                renderProps={renderProps}
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
