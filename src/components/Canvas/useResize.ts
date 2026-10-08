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

/** 四個角加四條邊；字母代表會移動的那一側（n 上、s 下、w 左、e 右） */
export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';
export const RESIZE_DIRECTIONS: readonly ResizeCorner[] = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];

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
    /** 尺寸限制（格數）。預覽與落地用同一組值，放開時才不會彈回（見 sizeLimits.ts） */
    minGridW?: number;
    minGridH?: number;
    maxGridW?: number;
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
        maxGridW = Infinity,
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
        minGridW, minGridH, maxGridW, onResizeEnd, onResizePreview,
    });
    latestRef.current = {
        cellWidth, cellHeight, currentWidth, currentHeight, currentX, currentY,
        minGridW, minGridH, maxGridW, onResizeEnd, onResizePreview,
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
                const st = resizeState.current;
                const corner = st.corner;
                const movesW = corner.includes('w'), movesE = corner.includes('e');
                const movesN = corner.includes('n'), movesS = corner.includes('s');

                // 以「邊」為單位計算與對齊：只有被拖的那一側會動，另一側固定不動。
                // （舊版分別對齊 x 與寬度，拖左側時右緣會跟著四捨五入漂移一格）
                const axis = (
                    start: number, size: number, delta: number, movesStart: boolean, movesEnd: boolean,
                    cell: number, minCells: number, maxCells: number, boundCells: number,
                ) => {
                    // 畫布會往下長（超過 24 列）：原本就在界外的視窗以它自己的邊為界，不會被算成負尺寸
                    const bound = Math.max(boundCells * cell, start + size);
                    let lo = start, hi = start + size;
                    if (movesStart) lo = Math.max(0, snapToGrid(lo + delta, cell));
                    if (movesEnd) hi = Math.min(bound, snapToGrid(hi + delta, cell));
                    // 尺寸限制在跟手預覽時就套用（與落地時一致），被拖的那一側停在極限上
                    const minPx = minCells * cell;
                    const maxPx = Math.min(maxCells * cell, bound);
                    const len = Math.max(minPx, Math.min(maxPx, hi - lo));
                    if (movesStart) lo = Math.max(0, hi - len);
                    else if (movesEnd) hi = Math.min(bound, lo + len);
                    return { pos: lo, size: movesStart || movesEnd ? hi - lo : size };
                };

                const h = axis(st.startPosX, st.startWidth, clientX - st.startX, movesW, movesE,
                    g.cellWidth, g.minGridW, g.maxGridW, GRID_COLS);
                const v = axis(st.startPosY, st.startHeight, clientY - st.startY, movesN, movesS,
                    g.cellHeight, g.minGridH, Infinity, GRID_ROWS);
                const newX = h.pos, newWidth = h.size, newY = v.pos, newHeight = v.size;

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

            // 由 lostpointercapture 進來時 capture 已經沒了
            try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* 已釋放 */ }

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
            onPointerCancel: handlePointerUp,
            // capture 意外遺失（例如在跨網域 iframe 上放開滑鼠）時也要收尾，否則會卡在縮放狀態、
            // 內容層維持 pointer-events:none。正常放開時 isResizing 已是 false，這裡直接略過。
            onLostPointerCapture: handlePointerUp,
        };
    }, [nodeRef, sizeLabelRef]);

    const cornerHandlers = useMemo(
        () => Object.fromEntries(RESIZE_DIRECTIONS.map(d => [d, createCornerHandlers(d)])) as Record<ResizeCorner, ReturnType<typeof createCornerHandlers>>,
        [createCornerHandlers],
    );

    return {
        isResizing,
        cornerHandlers
    };
}
