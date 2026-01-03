import { useMemo } from 'react';
import RGL, { Responsive, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// --- Vite/ESM Compatibility Fix ---
// Safely get Responsive component.
// In some environments, specific named exports work better.
const ResponsiveGridLayout = Responsive || (RGL as any).Responsive;

interface GridEngineProps {
    className?: string;
    items: any[];
    children: React.ReactNode;
    onLayoutChange: (layout: Layout[]) => void;

    // Config
    cols?: number;
    rowHeight?: number;
    width: number; // Mandatory now
    isDraggable?: boolean;
    isResizable?: boolean;
}

export function GridEngine({
    className,
    items,
    children,
    onLayoutChange,
    cols = 24,
    rowHeight = 30,
    width,
    isDraggable = true,
    isResizable = true
}: GridEngineProps) {

    // Construct the layouts object RGL expects
    const layouts = useMemo(() => {
        const layout = items.map(item => ({
            i: item.i,
            x: item.layout.x,
            y: item.layout.y,
            w: item.layout.w,
            h: item.layout.h,
            minW: 2,
            minH: 2
        })) as Layout[];
        return { lg: layout, md: layout, sm: layout, xs: layout, xxs: layout };
    }, [items]);

    return (
        <div className={`w-full min-h-screen ${className || ''}`}>
            <ResponsiveGridLayout
                className="layout"
                layouts={layouts}
                width={width} // Explicit width passed from parent
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: cols, md: cols, sm: cols, xs: cols, xxs: cols }}
                rowHeight={rowHeight} // Dynamic row height

                // Interaction
                isDraggable={isDraggable}
                isResizable={isResizable}
                draggableHandle=".grid-item-drag-handle"

                // Behavior
                compactType="vertical" // Enforce gravity/snapping upwards
                preventCollision={false} // Allow pushing items

                // Event Callbacks
                onLayoutChange={(currentLayout: any) => {
                    // Responsive RGL returns (layout, layouts). We just want the current layout.
                    onLayoutChange(currentLayout);
                }}

                // Visuals
                margin={[0, 0]} // Zero margin to match visual grid
                containerPadding={[0, 0]}
                resizeHandles={['se']} // Standard corner resize
            >
                {children}
            </ResponsiveGridLayout>
        </div>
    );
}
