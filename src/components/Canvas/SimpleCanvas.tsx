/**
 * SimpleCanvas - High performance canvas container
 * 24x24 grid that perfectly fits the viewport
 *
 * 效能約束（改動前請先讀）：
 * 傳給 DraggableWindow 的每一個 prop 都必須是穩定身分，否則它的 memo 形同虛設——
 * 拖曳／縮放時本元件會 setState（dragSwapTargetId / resizeGhosts），一旦 memo 失效，
 * 畫布上「所有」視窗與其內容子樹（含每個播放器容器）都會跟著重繪。
 * 因此：
 *   - 依賴 windows / gridConfig 的回呼一律讀 ref，deps 保持空陣列
 *   - map 裡不可以寫 inline 箭頭（onMouseEnter、children render-prop 都曾經是破口）
 *   - gridConfig 用值比較，算出來一樣就沿用舊物件
 */

import { memo, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { DraggableWindow, CanvasWindow, WindowRenderProps } from './DraggableWindow';
import { calculateGridConfig, GridConfig, GRID_COLS, PixelPosition } from './gridConfig';
import { checkCollision, checkPointCollision, Rect } from './collision';
import { resolvePushResize } from './pushResize';
import { cn } from '../ui/utils';
import { ScrollArea } from '../ui/scroll-area';
import { calculateRequiredRows } from '../../utils/layoutEngine';
import { useUIStore } from '../../store/useUIStore';

/**
 * 各類型視窗的格線尺寸限制。使用者拖出來的尺寸與推擠時能壓縮到的下限都以此為準——
 * 兩者若各寫一份會逐漸漂移，導致推擠算出的佈局在落地時又被夾成另一個值。
 */
const SIZE_LIMITS = {
    stream: { minW: 6, minH: 6, maxW: Infinity },
    chat: { minW: 3, minH: 6, maxW: 4 },
} as const;

export const limitsOf = (w: CanvasWindow) => SIZE_LIMITS[w.type] ?? SIZE_LIMITS.stream;

/** calculateRequiredRows 只看 layout，其餘欄位純粹是型別佔位 */
const toLayoutItems = (windows: CanvasWindow[]) => windows.map(w => ({
    i: w.id,
    type: 'stream' as const,
    contentId: null,
    layout: { x: w.gridX, y: w.gridY, w: w.gridW, h: w.gridH }
}));

/** 值相同就沿用舊物件：GridConfig 是每個視窗的 prop，換一次身分就等於全畫布重繪 */
const sameGrid = (a: GridConfig, b: GridConfig) =>
    a.cols === b.cols && a.rows === b.rows
    && a.cellWidth === b.cellWidth && a.cellHeight === b.cellHeight
    && a.containerWidth === b.containerWidth && a.containerHeight === b.containerHeight;

interface SimpleCanvasProps {
    windows: CanvasWindow[];
    onWindowUpdate: (windows: CanvasWindow[]) => void;
    onWindowRemove: (id: string) => void;
    renderContent: (window: CanvasWindow, renderProps: WindowRenderProps) => ReactNode;
    className?: string;
}

export const SimpleCanvas = memo(function SimpleCanvas({
    windows,
    onWindowUpdate,
    onWindowRemove,
    renderContent,
    className
}: SimpleCanvasProps) {
    // Grid configuration - recalculates on resize
    const [gridConfig, setGridConfig] = useState<GridConfig>(() =>
        calculateGridConfig(window.innerWidth, window.innerHeight, calculateRequiredRows(toLayoutItems(windows)))
    );

    const theaterWindowId = useUIStore(s => s.theaterWindowId);

    // Swap mode state (Drag based)
    const [dragSwapTargetId, setDragSwapTargetId] = useState<string | null>(null);

    // resize 過程中鄰居的讓位預覽（只畫輪廓，放開才落地）
    const [resizeGhosts, setResizeGhosts] = useState<Record<string, PixelPosition> | null>(null);

    // Container ref for pointer collision tracking
    const containerRef = useRef<HTMLDivElement>(null);

    // 最新值放 ref，讓下面所有回呼都能維持空 deps（見檔頭效能約束）
    const windowsRef = useRef(windows);
    windowsRef.current = windows;
    const onWindowUpdateRef = useRef(onWindowUpdate);
    onWindowUpdateRef.current = onWindowUpdate;

    // Handle window resize（監聽只掛一次；視窗清單從 ref 讀）
    useEffect(() => {
        const handleResize = () => {
            const next = calculateGridConfig(
                window.innerWidth,
                window.innerHeight,
                calculateRequiredRows(toLayoutItems(windowsRef.current)),
            );
            setGridConfig(prev => (sameGrid(prev, next) ? prev : next));
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Recalculate grid when windows change (for infinite scrolling)
    useEffect(() => {
        const rows = calculateRequiredRows(toLayoutItems(windows));
        setGridConfig(prev => {
            const next = calculateGridConfig(prev.containerWidth, prev.cellHeight * 24, rows);
            return sameGrid(prev, next) ? prev : next;
        });
    }, [windows]);

    // Convert windows to pixel positions for collision detection
    const windowPositions = useMemo(() => {
        return windows.map(w => ({
            id: w.id,
            position: {
                x: w.gridX * gridConfig.cellWidth,
                y: w.gridY * gridConfig.cellHeight,
                width: w.gridW * gridConfig.cellWidth,
                height: w.gridH * gridConfig.cellHeight
            }
        }));
    }, [windows, gridConfig]);
    const windowPositionsRef = useRef(windowPositions);
    windowPositionsRef.current = windowPositions;
    const gridConfigRef = useRef(gridConfig);
    gridConfigRef.current = gridConfig;

    // Check drag collision - NOW RETURNS ID or NULL
    const checkDragCollision = useCallback((
        id: string,
        x: number,
        y: number,
        width: number,
        height: number,
        screenX?: number,
        screenY?: number
    ): string | null => {
        const positions = windowPositionsRef.current;

        // If screen coordinates are provided (Pointer Mode), use them.
        // containerRef 掛在 ScrollArea 內會長高的那個 div 上，getBoundingClientRect()
        // 已經把捲動位移算進去，所以 clientY - rect.top 就是容器內座標。
        if (screenX !== undefined && screenY !== undefined && containerRef.current) {
            const containerRect = containerRef.current.getBoundingClientRect();
            const pointerContainerX = screenX - containerRect.left;
            const pointerContainerY = screenY - containerRect.top;

            return checkPointCollision(id, pointerContainerX, pointerContainerY, positions);
        }

        // Fallback to Rect Collision (Traditional)
        const rect: Rect = { x, y, width, height };
        return checkCollision(id, rect, positions);
    }, []);

    // 把使用者拖出來的尺寸夾進該類型視窗的合法範圍
    const clampDesired = useCallback((w: CanvasWindow, gridW: number, gridH: number) => {
        const { minW, minH, maxW } = limitsOf(w);
        return { w: Math.max(minW, Math.min(maxW, gridW)), h: Math.max(minH, gridH) };
    }, []);

    const solveResize = useCallback((id: string, gridX: number, gridY: number, gridW: number, gridH: number) => {
        const current = windowsRef.current;
        const target = current.find(w => w.id === id);
        if (!target) return null;
        const size = clampDesired(target, gridW, gridH);
        return resolvePushResize(
            current,
            id,
            { x: gridX, y: gridY, w: size.w, h: size.h },
            {
                gridCols: GRID_COLS,
                minSize: limitsOf,
                // 縮小留下的空白由連鎖填補消化時，優先把空間讓給直播畫面
                prefer: w => (w.type === 'stream' ? 1 : 0),
            },
        );
    }, [clampDesired]);

    // Handle Drag Swap Hover
    const handleSwapHover = useCallback((_sourceId: string, targetId: string | null) => {
        setDragSwapTargetId(targetId);
    }, []);

    // Handle position change (Updated for Smart Swap)
    const handlePositionChange = useCallback((id: string, gridX: number, gridY: number, collisionId?: string | null) => {
        const current = windowsRef.current;

        // 1. Identify Source Window
        const source = current.find(w => w.id === id);
        if (!source) return;

        // Use the reported collisionId from the drag operation if available
        // This ensures consistent behavior with the visual feedback (green ring)
        const targetId = collisionId;

        if (targetId) {
            // SWAP DETECTED
            const target = current.find(w => w.id === targetId);
            if (target) {
                // Perform Swap (Exchange Top-Left coordinates AND Dimensions)
                // This ensures "Content Swap" behavior where the layout grid structure remains unchanged.
                const updated = current.map(w => {
                    if (w.id === id) {
                        // A takes B's position AND size
                        return {
                            ...w,
                            gridX: target.gridX,
                            gridY: target.gridY,
                            gridW: target.gridW,
                            gridH: target.gridH
                        };
                    }
                    if (w.id === targetId) {
                        // B takes A's *original* position AND size
                        return {
                            ...w,
                            gridX: source.gridX,
                            gridY: source.gridY,
                            gridW: source.gridW,
                            gridH: source.gridH
                        };
                    }
                    return w;
                });
                onWindowUpdateRef.current(updated);
                // Clear any drag state
                setDragSwapTargetId(null);
                return;
            }
        }

        // NO COLLISION (or simple move)
        const updated = current.map(w =>
            w.id === id ? { ...w, gridX, gridY } : w
        );
        onWindowUpdateRef.current(updated);
        setDragSwapTargetId(null);
    }, []);

    // resize 拖曳中：算出鄰居讓位後的位置，但只拿來畫 ghost
    const handleSizePreview = useCallback((id: string, gridX: number, gridY: number, gridW: number, gridH: number) => {
        const solved = solveResize(id, gridX, gridY, gridW, gridH);
        if (!solved) return;

        const { cellWidth, cellHeight } = gridConfigRef.current;
        const before = windowsRef.current;
        const ghosts: Record<string, PixelPosition> = {};
        for (const next of solved.windows) {
            if (next.id === id) continue;
            const prev = before.find(w => w.id === next.id);
            if (!prev) continue;
            const moved = prev.gridX !== next.gridX || prev.gridY !== next.gridY
                || prev.gridW !== next.gridW || prev.gridH !== next.gridH;
            if (!moved) continue;
            ghosts[next.id] = {
                x: next.gridX * cellWidth,
                y: next.gridY * cellHeight,
                width: next.gridW * cellWidth,
                height: next.gridH * cellHeight,
            };
        }

        setResizeGhosts(Object.keys(ghosts).length > 0 ? ghosts : null);
    }, [solveResize]);

    // resize 結束：把推擠結果真正落地
    const handleWindowResize = useCallback((id: string, gridX: number, gridY: number, gridW: number, gridH: number) => {
        setResizeGhosts(null);
        const solved = solveResize(id, gridX, gridY, gridW, gridH);
        if (!solved) return;
        onWindowUpdateRef.current(solved.windows);
    }, [solveResize]);

    const handleHoverChange = useCallback((hoveredId: string | null, canvasItemId: string | null) => {
        useUIStore.getState().setHoveredWindowId(hoveredId, canvasItemId);
    }, []);

    return (
        <ScrollArea className={cn("h-full w-full bg-slate-950", className)}>
            <div
                ref={containerRef}
                className="relative"
                style={{
                    width: gridConfig.containerWidth,
                    height: gridConfig.containerHeight,
                    // contain: 'strict', // Contain strict might clip children or affect scrolling?
                    // Grid background
                    backgroundSize: `${gridConfig.cellWidth}px ${gridConfig.cellHeight}px`,
                    backgroundImage: `
                        linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)
                    `
                }}
            >
                {/* Windows */}
                {windows.map(w => (
                    <DraggableWindow
                        key={w.id}
                        window={w}
                        gridConfig={gridConfig}
                        renderContent={renderContent}
                        onPositionChange={handlePositionChange}
                        onSizeChange={handleWindowResize}
                        onSizePreview={handleSizePreview}
                        ghostRect={resizeGhosts?.[w.id] ?? null}
                        onRemove={onWindowRemove}
                        onSwapHover={handleSwapHover}
                        checkDragCollision={checkDragCollision}
                        isSwapTarget={dragSwapTargetId === w.id}
                        isTheaterMode={theaterWindowId === w.id}
                        onHoverChange={handleHoverChange}
                    />
                ))}
            </div>
        </ScrollArea>
    );
});

export type { CanvasWindow };
