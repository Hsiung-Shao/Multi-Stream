import { useEffect, useState } from 'react';
import { useStreamStore } from '../../store/useStreamStore';
import { ScrollArea } from '../ui/scroll-area';
import { CanvasItemWrapper } from './CanvasItemWrapper';
import { GridEngine } from './GridEngine';
import { registerStandardBlocks } from './blocks';

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

    useEffect(() => {
        registerStandardBlocks();
        setMounted(true);

        const handleResize = () => {
            const cols = 24;
            const screenW = window.innerWidth;
            const colW = Math.floor(screenW / cols);
            // Snap container width to exact multiple of colW to avoid subpixel drift
            const snappedContainerW = colW * cols;

            // Switch to 24x24 Grid Logic (Holodex Style)
            // Screen is divided into 24x24 grid.
            // Since screen is 16:9, each grid unit will be 16:9 aspect ratio.
            // rowH = screenH / 24.
            const screenH = window.innerHeight;
            // Subtract topbar height? CanvasContainer often handles full height.
            // Let's use innerHeight to be safe for now, assuming full viewport usage.
            const rHeight = Math.floor(screenH / 24);

            setContainerWidth(snappedContainerW);
            setRowHeight(rHeight);
            setGridSize({ w: colW, h: rHeight });
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [setGridSize]);

    if (!mounted) return null;

    // Visual Grid Background
    const bgSizeW = gridSize.w || 40;
    const bgSizeH = Math.max(gridSize.h || 40, 10); // Safeguard

    const gridStyle = {
        width: `${containerWidth}px`, // Explicit width to match RGL
        backgroundSize: `${bgSizeW}px ${bgSizeH}px`,
        backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
        `
    };

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
                >
                    {canvasItems.map(item => (
                        <div key={item.i}>
                            <CanvasItemWrapper item={item} />
                        </div>
                    ))}
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
