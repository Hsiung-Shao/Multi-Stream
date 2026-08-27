/**
 * DraggableWindow - High performance draggable and resizable window
 * Uses CSS Transform for GPU acceleration
 * Features smooth dragging with ghost preview at snap position
 * Supports resizing from all 4 corners
 *
 * HEADERLESS VERSION - drag handlers are passed to children via render props
 *
 * 效能約束（改動前請先讀）：
 * 1. 這個元件是 memo 的，但只有「所有 prop 都維持穩定身分」時才擋得住重繪。
 *    上層 SimpleCanvas 的每一個回呼都必須是穩定的，不可以在 map 裡寫 inline 箭頭。
 * 2. renderProps 必須是 useMemo 出來的：它是內容子樹（CanvasStreamContent /
 *    EmptyWindowContent）唯一的 prop，一旦逐次 render 就是新物件，內容的 memo 全部失效，
 *    拖曳時每一幀都會重新協調所有播放器容器。
 * 3. 拖曳／縮放中的幾何變化由 useDrag / useResize 直接寫 DOM，不進 state。
 *    這裡 render 出來的 transform / width / height 一律取自 pixelPos（props 推導），
 *    互動期間它不變，React 不會碰 DOM，手寫的值不會被蓋掉。
 */

import { memo, useCallback, useMemo, useRef, ReactNode, useEffect } from 'react';
import { useDrag } from './useDrag';
import { useResize } from './useResize';
import { GridConfig, PixelPosition } from './gridConfig';
import { cn } from '../ui/utils';

export interface CanvasWindow {
    id: string;
    gridX: number;
    gridY: number;
    gridW: number;
    gridH: number;
    contentId?: number;
    type: 'stream' | 'chat';
}

export interface DragHandlers {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
}

export interface WindowRenderProps {
    dragHandlers: DragHandlers;
    isDragging: boolean;
    isResizing: boolean;
    /** 已落地的格線尺寸（縮放進行中不會逐格更新——那會讓內容子樹跟著重繪） */
    gridW: number;
    gridH: number;
    onRemove: () => void;
}

interface DraggableWindowProps {
    window: CanvasWindow;
    gridConfig: GridConfig;
    /** 內容渲染函式；必須是穩定身分（見檔頭效能約束 1） */
    renderContent: (window: CanvasWindow, renderProps: WindowRenderProps) => ReactNode;
    onPositionChange: (id: string, gridX: number, gridY: number, collisionId?: string | null) => void;
    onSizeChange: (id: string, gridX: number, gridY: number, gridW: number, gridH: number) => void;
    onRemove: (id: string) => void;
    onSwapHover: (sourceId: string, targetId: string | null) => void;
    checkDragCollision: (id: string, x: number, y: number, width: number, height: number, screenX?: number, screenY?: number) => string | null;
    /** resize 拖曳中回報目前格線尺寸，讓上層算出鄰居的讓位預覽 */
    onSizePreview?: (id: string, gridX: number, gridY: number, gridW: number, gridH: number) => void;
    /** 本視窗被推擠後的預期落點（像素）。resize 進行中才有值，用來畫 ghost */
    ghostRect?: PixelPosition | null;
    isSwapTarget?: boolean;
    isTheaterMode?: boolean;
    /** 滑鼠進出視窗；傳 null 代表離開。上層必須給穩定身分的函式 */
    onHoverChange?: (hoveredId: string | null) => void;
}

export const DraggableWindow = memo(function DraggableWindow({
    window,
    gridConfig,
    renderContent,
    onPositionChange,
    onSizeChange,
    onRemove,
    onSwapHover,
    checkDragCollision,
    onSizePreview,
    ghostRect,
    isSwapTarget,
    isTheaterMode,
    onHoverChange
}: DraggableWindowProps) {
    const { cellWidth, cellHeight } = gridConfig;

    // 互動期間直接被寫 style 的三個元素
    const nodeRef = useRef<HTMLDivElement>(null);
    const dragGhostRef = useRef<HTMLDivElement>(null);
    const sizeLabelRef = useRef<HTMLDivElement>(null);

    // Calculate pixel position from grid position
    const pixelPos: PixelPosition = useMemo(() => ({
        x: window.gridX * cellWidth,
        y: window.gridY * cellHeight,
        width: window.gridW * cellWidth,
        height: window.gridH * cellHeight
    }), [window.gridX, window.gridY, window.gridW, window.gridH, cellWidth, cellHeight]);

    // Drag collision checker (returns collision ID or null)
    const dragCollisionCheck = useCallback((x: number, y: number, screenX?: number, screenY?: number) => {
        return checkDragCollision(window.id, x, y, pixelPos.width, pixelPos.height, screenX, screenY);
    }, [window.id, pixelPos.width, pixelPos.height, checkDragCollision]);

    // resize 過程中回報格線尺寸給上層算讓位預覽。
    // 由於已 snap 到格線，實際變動遠少於 pointermove 次數，這裡再去重一次，
    // 避免每一幀都觸發上層 setState 而重繪整個畫布。
    const lastPreviewRef = useRef('');
    const handleResizePreview = useCallback((x: number, y: number, width: number, height: number) => {
        if (!onSizePreview) return;
        const gridX = Math.round(x / cellWidth);
        const gridY = Math.round(y / cellHeight);
        const gridW = Math.round(width / cellWidth);
        const gridH = Math.round(height / cellHeight);
        const key = `${gridX},${gridY},${gridW},${gridH}`;
        if (key === lastPreviewRef.current) return;
        lastPreviewRef.current = key;
        onSizePreview(window.id, gridX, gridY, gridW, gridH);
    }, [window.id, cellWidth, cellHeight, onSizePreview]);

    // Handle drag end - convert pixels back to grid
    const handleDragEnd = useCallback((x: number, y: number, collisionId: string | null) => {
        const gridX = Math.round(x / cellWidth);
        const gridY = Math.round(y / cellHeight);

        onPositionChange(window.id, gridX, gridY, collisionId);
        // Clear swap hover
        onSwapHover(window.id, null);
    }, [window.id, cellWidth, cellHeight, onPositionChange, onSwapHover]);

    // Handle resize end - convert pixels back to grid (now includes position)
    const handleResizeEnd = useCallback((x: number, y: number, width: number, height: number) => {
        const gridX = Math.round(x / cellWidth);
        const gridY = Math.round(y / cellHeight);
        const gridW = Math.round(width / cellWidth);
        const gridH = Math.round(height / cellHeight);
        lastPreviewRef.current = '';
        onSizeChange(window.id, gridX, gridY, gridW, gridH);
    }, [window.id, cellWidth, cellHeight, onSizeChange]);

    // Drag hook - 幾何直接寫 DOM，只回報 isDragging 與 collisionId
    const { collisionId, isDragging, dragHandlers } = useDrag({
        cellWidth,
        cellHeight,
        currentX: pixelPos.x,
        currentY: pixelPos.y,
        width: pixelPos.width,
        height: pixelPos.height,
        onDragEnd: handleDragEnd,
        checkCollision: dragCollisionCheck,
        maxRows: 1000, // Allow dragging beyond current bounds to trigger expansion
        nodeRef,
        ghostRef: dragGhostRef,
    });

    // Notify parent of swap hover state
    useEffect(() => {
        if (isDragging) {
            onSwapHover(window.id, collisionId);
        }
    }, [collisionId, isDragging, window.id, onSwapHover]);

    // Resize hook - 四角把手；幾何同樣直接寫 DOM
    const { isResizing, cornerHandlers } = useResize({
        cellWidth,
        cellHeight,
        currentWidth: pixelPos.width,
        currentHeight: pixelPos.height,
        currentX: pixelPos.x,
        currentY: pixelPos.y,
        onResizeEnd: handleResizeEnd,
        onResizePreview: handleResizePreview,
        nodeRef,
        sizeLabelRef,
    });

    // Handle remove
    const handleRemove = useCallback(() => {
        onRemove(window.id);
    }, [window.id, onRemove]);

    const handleMouseEnter = useCallback(() => {
        onHoverChange?.(window.contentId ? window.contentId.toString() : window.id);
    }, [onHoverChange, window.contentId, window.id]);

    const handleMouseLeave = useCallback(() => {
        onHoverChange?.(null);
    }, [onHoverChange]);

    // Render props for children —— 必須 memo（見檔頭效能約束 2）
    const renderProps: WindowRenderProps = useMemo(() => ({
        dragHandlers,
        isDragging,
        isResizing,
        gridW: window.gridW,
        gridH: window.gridH,
        onRemove: handleRemove
    }), [dragHandlers, isDragging, isResizing, window.gridW, window.gridH, handleRemove]);

    const renderedChildren = renderContent(window, renderProps);

    // Corner handle base styles
    const cornerHandleClass = cn(
        "absolute w-4 h-4 z-10",
        "opacity-0 group-hover:opacity-100 transition-opacity",
        "hover:bg-blue-500/30",
        isResizing && "opacity-100 bg-blue-500/50"
    );

    return (
        <>
            {/* Ghost Preview - shows where window will land */}
            {isDragging && (
                <div
                    ref={dragGhostRef}
                    className="absolute rounded-lg border-2 border-dashed border-purple-400/60 bg-purple-500/10 pointer-events-none"
                    style={{
                        transform: `translate(${pixelPos.x}px, ${pixelPos.y}px)`,
                        width: pixelPos.width,
                        height: pixelPos.height,
                        transition: 'transform 0.1s ease-out'
                    }}
                />
            )}

            {/* 讓位預覽：鄰居正在被推擠時，先畫出它將落到的位置。
                拖曳過程中不真的搬動 iframe——每一幀重排多個直播播放器會嚴重掉幀，
                所以只畫輪廓，放開滑鼠才落地。 */}
            {ghostRect && (
                <div
                    className="absolute rounded-lg border-2 border-dashed border-blue-400/50 bg-blue-500/10 pointer-events-none z-40"
                    style={{
                        transform: `translate(${ghostRect.x}px, ${ghostRect.y}px)`,
                        width: ghostRect.width,
                        height: ghostRect.height,
                        transition: 'transform 0.1s ease-out, width 0.1s ease-out, height 0.1s ease-out'
                    }}
                />
            )}

            {/* Actual Window - NO INTERNAL HEADER */}
            <div
                ref={nodeRef}
                className={cn(
                    "absolute rounded-lg overflow-hidden border border-white/10 bg-slate-900/95",
                    "shadow-lg group",
                    isDragging && "shadow-2xl border-purple-500/50 z-50 opacity-90",
                    isResizing && "border-blue-500/50 z-50",
                    isSwapTarget && "ring-2 ring-green-500 ring-offset-2 ring-offset-slate-950",
                    isTheaterMode && "z-[100] border-purple-500 shadow-2xl"
                )}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                style={isTheaterMode ? {
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    transform: 'none',
                    zIndex: 100,
                } : {
                    transform: `translate(${pixelPos.x}px, ${pixelPos.y}px)`,
                    width: pixelPos.width,
                    height: pixelPos.height,
                    willChange: isDragging || isResizing ? 'transform, width, height' : 'auto',
                    contain: 'layout style paint',
                    transition: (isDragging || isResizing) ? 'none' : 'transform 0.15s ease-out, width 0.15s ease-out, height 0.15s ease-out'
                }}
            >
                {/* Content fills entire window */}
                <div
                    className="w-full h-full overflow-hidden"
                    style={{ pointerEvents: isDragging || isResizing ? 'none' : 'auto' }}
                >
                    {renderedChildren}
                </div>

                {/* Four Corner Resize Handles */}
                {/* NW - Top Left */}
                <div
                    className={cn(cornerHandleClass, "top-0 left-0 cursor-nw-resize")}
                    {...cornerHandlers.nw}
                >
                    <div className="absolute top-0.5 left-0.5 w-2 h-2 border-l-2 border-t-2 border-white/40" />
                </div>

                {/* NE - Top Right */}
                <div
                    className={cn(cornerHandleClass, "top-0 right-0 cursor-ne-resize")}
                    {...cornerHandlers.ne}
                >
                    <div className="absolute top-0.5 right-0.5 w-2 h-2 border-r-2 border-t-2 border-white/40" />
                </div>

                {/* SW - Bottom Left */}
                <div
                    className={cn(cornerHandleClass, "bottom-0 left-0 cursor-sw-resize")}
                    {...cornerHandlers.sw}
                >
                    <div className="absolute bottom-0.5 left-0.5 w-2 h-2 border-l-2 border-b-2 border-white/40" />
                </div>

                {/* SE - Bottom Right */}
                <div
                    className={cn(cornerHandleClass, "bottom-0 right-0 cursor-se-resize")}
                    {...cornerHandlers.se}
                >
                    <div className="absolute bottom-0.5 right-0.5 w-2 h-2 border-r-2 border-b-2 border-white/40" />
                </div>

                {/* Size indicator during resize —— 文字由 useResize 直接寫，不走 state */}
                {isResizing && (
                    <div
                        ref={sizeLabelRef}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 text-white text-xs px-3 py-1.5 rounded z-20"
                    >
                        {window.gridW} × {window.gridH}
                    </div>
                )}
            </div>
        </>
    );
});
