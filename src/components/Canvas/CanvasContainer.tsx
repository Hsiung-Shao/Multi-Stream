import { useEffect, useState } from 'react';
import { useStreamStore } from '../../store/useStreamStore';
import { ScrollArea } from '../ui/scroll-area';
import { CanvasItemWrapper } from './CanvasItemWrapper';
import { GridEngine } from './GridEngine';
import { registerStandardBlocks } from './blocks';
import { calculateGridDimensions, getGridBackgroundStyle } from '../../utils/gridUtils';

export function CanvasContainer() {
    const canvasItems = useStreamStore(s => s.canvasItems);
    const updateCanvasLayout = useStreamStore(s => s.updateCanvasLayout);
    const setGridSize = useStreamStore(s => s.setGridSize);
    const gridSize = useStreamStore(s => s.gridSize);

    const [mounted, setMounted] = useState(false);

    // We update this via store action or local state? 
    // GridEngine needs a rowHeight. We calculated it and stored it in store in previous version?
    // Let's use local state for rowHeight updates for now to keep it responsive.
    const [rowHeight, setRowHeight] = useState(30);
    const [containerWidth, setContainerWidth] = useState(1200);

    // Track resizing item: { i: string, w: number, h: number }
    const [resizingItem, setResizingItem] = useState<{ i: string, w: number, h: number } | null>(null);

    useEffect(() => {
        registerStandardBlocks();
        setMounted(true);

        const handleResize = () => {
            const { colWidth, rowHeight: rHeight, containerWidth: cWidth } = calculateGridDimensions(
                window.innerWidth,
                window.innerHeight
            );

            setContainerWidth(cWidth);
            setRowHeight(rHeight);
            setGridSize({ w: colWidth, h: rHeight });
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [setGridSize]);

    // RGL Resize Callback
    const handleItemResize = (layout: any, oldItem: any, newItem: any) => {
        setResizingItem({ i: newItem.i, w: newItem.w, h: newItem.h });
    };

    const handleItemResizeStop = () => {
        setResizingItem(null);
    };

    if (!mounted) return null;

    // Visual Grid Background
    const gridStyle = getGridBackgroundStyle(gridSize.w || 40, rowHeight, containerWidth);

    return (
        <ScrollArea className="w-full h-full bg-slate-950">
            <div
                className="min-h-screen relative"
                style={gridStyle}
            >
                <GridEngine
                    items={canvasItems}
                    width={containerWidth}
                    onLayoutChange={(layout) => {
                        updateCanvasLayout(layout);
                    }}
                    rowHeight={rowHeight}
                    onResize={handleItemResize}
                    onResizeStop={handleItemResizeStop}
                >
                    {canvasItems.map(item => {
                        // Check if this item is being resized
                        const isResizing = resizingItem && resizingItem.i === item.i;
                        const dims = isResizing ? { w: resizingItem.w, h: resizingItem.h } : undefined;

                        return (
                            <div key={item.i}>
                                <CanvasItemWrapper
                                    item={item}
                                    resizingDimensions={dims}
                                />
                            </div>
                        );
                    })}
                </GridEngine>

                {/* Empty State */}
                {canvasItems.length === 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground pointer-events-none z-0">
                        <p>Canvas is empty.</p>
                        <p className="text-sm">Use the Dynamic Island to add windows.</p>
                    </div>
                )}
            </div>
        </ScrollArea>
    );
}
