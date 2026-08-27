/**
 * useResize hook - High performance resize handling from all 4 corners
 * Uses Pointer Events + requestAnimationFrame for smooth resizing
 *
 * 效能取向：與 useDrag 同一套分工——縮放過程中的 transform / width / height 與
 * 「W × H」指示器都直接寫 DOM，不進 React state。進 state 的只有 isResizing（起訖各一次）。
 * 鄰居讓位預覽仍走 onResizePreview 回呼，但那條路徑在 DraggableWindow 已用格線粒度去重。
 */

import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import { snapToGrid, GRID_COLS, GRID_ROWS } from './gridConfig';

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

interface ResizeState {
    isResizing: boolean;
    corner: ResizeCorner;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startPosX: number;
    startPosY: number;
}

/** 非縮放狀態下視窗使用的 transition，收尾時要先寫回它才有「滑到定位」的手感 */
const IDLE_TRANSITION = 'transform 0.15s ease-out, width 0.15s ease-out, height 0.15s ease-out';

interface UseResizeOptions {
    cellWidth: number;
    cellHeight: number;
    currentWidth: number;
    currentHeight: number;
    currentX: number;
    currentY: number;
    minGridW?: number;
    minGridH?: number;
    onResizeEnd: (x: number, y: number, width: number, height: number) => void;
    /** 拖曳過程中回報目前尺寸，供上層預覽鄰居讓位後的位置 */
    onResizePreview?: (x: number, y: number, width: number, height: number) => void;
    /** 被縮放的視窗元素；縮放中直接寫它的 transform / width / height */
    nodeRef: RefObject<HTMLElement | null>;
    /** 中央的「W × H」指示器；縮放中直接寫它的 textContent */
    sizeLabelRef: RefObject<HTMLElement | null>;
}

export function useResize(options: UseResizeOptions) {
    const {
        cellWidth,
        cellHeight,
        currentWidth,
        currentHeight,
        currentX,
        currentY,
        minGridW = 4,
        minGridH = 3,
        onResizeEnd,
        onResizePreview,
        nodeRef,
        sizeLabelRef,
    } = options;

    const [isResizing, setIsResizing] = useState(false);

    const resizeState = useRef<ResizeState>({
        isResizing: false,
        corner: 'se',
        startX: 0,
        startY: 0,
        startWidth: 0,
        startHeight: 0,
        startPosX: 0,
        startPosY: 0
    });
    const rafRef = useRef<number | undefined>(undefined);
    /** 縮放中最新的幾何值；放開時用它通知上層（不像舊版讀 state 可能落後一幀） */
    const liveRef = useRef({ x: currentX, y: currentY, width: currentWidth, height: currentHeight });

    // 幾何與回呼放 ref，讓 cornerHandlers 維持穩定身分
    const latestRef = useRef({
        cellWidth, cellHeight, currentWidth, currentHeight, currentX, currentY,
        minGridW, minGridH, onResizeEnd, onResizePreview,
    });
    latestRef.current = {
        cellWidth, cellHeight, currentWidth, currentHeight, currentX, currentY,
        minGridW, minGridH, onResizeEnd, onResizePreview,
    };

    // Create handler for specific corner
    const createCornerHandlers = useCallback((corner: ResizeCorner) => {
        const handlePointerDown = (e: React.PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();

            (e.target as HTMLElement).setPointerCapture(e.pointerId);

            const g = latestRef.current;
            resizeState.current = {
                isResizing: true,
                corner,
                startX: e.clientX,
                startY: e.clientY,
                startWidth: g.currentWidth,
                startHeight: g.currentHeight,
                startPosX: g.currentX,
                startPosY: g.currentY
            };
            liveRef.current = { x: g.currentX, y: g.currentY, width: g.currentWidth, height: g.currentHeight };

            setIsResizing(true);
        };

        const handlePointerMove = (e: React.PointerEvent) => {
            if (!resizeState.current.isResizing) return;

            e.preventDefault();

            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }

            const clientX = e.clientX;
            const clientY = e.clientY;

            rafRef.current = requestAnimationFrame(() => {
                const g = latestRef.current;
                const deltaX = clientX - resizeState.current.startX;
                const deltaY = clientY - resizeState.current.startY;
                const corner = resizeState.current.corner;

                let newWidth = resizeState.current.startWidth;
                let newHeight = resizeState.current.startHeight;
                let newX = resizeState.current.startPosX;
                let newY = resizeState.current.startPosY;

                // Calculate new dimensions based on corner
                if (corner === 'se') {
                    newWidth += deltaX;
                    newHeight += deltaY;
                } else if (corner === 'sw') {
                    newWidth -= deltaX;
                    newX += deltaX;
                    newHeight += deltaY;
                } else if (corner === 'ne') {
                    newWidth += deltaX;
                    newHeight -= deltaY;
                    newY += deltaY;
                } else if (corner === 'nw') {
                    newWidth -= deltaX;
                    newX += deltaX;
                    newHeight -= deltaY;
                    newY += deltaY;
                }

                // Snap to grid
                newWidth = snapToGrid(newWidth, g.cellWidth);
                newHeight = snapToGrid(newHeight, g.cellHeight);
                newX = snapToGrid(newX, g.cellWidth);
                newY = snapToGrid(newY, g.cellHeight);

                // Enforce minimums
                const minWidth = g.minGridW * g.cellWidth;
                const minHeight = g.minGridH * g.cellHeight;

                // For corners that move position, prevent going below minimum
                if (corner === 'nw' || corner === 'sw') {
                    const maxX = resizeState.current.startPosX + resizeState.current.startWidth - minWidth;
                    if (newX > maxX) {
                        newX = maxX;
                        newWidth = minWidth;
                    }
                }
                if (corner === 'nw' || corner === 'ne') {
                    const maxY = resizeState.current.startPosY + resizeState.current.startHeight - minHeight;
                    if (newY > maxY) {
                        newY = maxY;
                        newHeight = minHeight;
                    }
                }

                newWidth = Math.max(minWidth, newWidth);
                newHeight = Math.max(minHeight, newHeight);

                // Clamp position to grid bounds
                newX = Math.max(0, newX);
                newY = Math.max(0, newY);

                // Clamp size to not exceed grid bounds
                const maxWidth = (GRID_COLS * g.cellWidth) - newX;
                const maxHeight = (GRID_ROWS * g.cellHeight) - newY;
                newWidth = Math.min(newWidth, maxWidth);
                newHeight = Math.min(newHeight, maxHeight);

                // 這裡刻意不再偵測與鄰居的碰撞。舊版一碰到就整個 return，視窗完全不動也沒有
                // 任何回饋；在滿版格線佈局下所有格子彼此緊貼，等於永遠拉不大。
                // 讓位改由上層的 resolvePushResize 解算，這裡只負責跟手與夾住畫布邊界。
                const node = nodeRef.current;
                if (node) {
                    node.style.transform = `translate(${newX}px, ${newY}px)`;
                    node.style.width = `${newWidth}px`;
                    node.style.height = `${newHeight}px`;
                }
                const label = sizeLabelRef.current;
                if (label) {
                    label.textContent = `${Math.round(newWidth / g.cellWidth)} × ${Math.round(newHeight / g.cellHeight)}`;
                }

                liveRef.current = { x: newX, y: newY, width: newWidth, height: newHeight };
                g.onResizePreview?.(newX, newY, newWidth, newHeight);
            });
        };

        const handlePointerUp = (e: React.PointerEvent) => {
            if (!resizeState.current.isResizing) return;

            e.preventDefault();

            (e.target as HTMLElement).releasePointerCapture(e.pointerId);

            resizeState.current.isResizing = false;

            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = undefined;
            }

            const { x, y, width, height } = liveRef.current;

            // 收尾：先寫回非縮放狀態的 transition，再落到最終幾何 → 保留原本的過場動畫。
            // React 隨後 re-render（可能帶著推擠修正後的值）會覆寫同一批屬性。
            const node = nodeRef.current;
            if (node) {
                node.style.transition = IDLE_TRANSITION;
                node.style.transform = `translate(${x}px, ${y}px)`;
                node.style.width = `${width}px`;
                node.style.height = `${height}px`;
            }

            setIsResizing(false);
            latestRef.current.onResizeEnd(x, y, width, height);
        };

        return {
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: handlePointerUp,
            onPointerCancel: handlePointerUp
        };
    }, [nodeRef, sizeLabelRef]);

    const cornerHandlers = useMemo(() => ({
        nw: createCornerHandlers('nw'),
        ne: createCornerHandlers('ne'),
        sw: createCornerHandlers('sw'),
        se: createCornerHandlers('se')
    }), [createCornerHandlers]);

    return {
        isResizing,
        cornerHandlers
    };
}
