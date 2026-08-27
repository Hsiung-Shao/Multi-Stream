/**
 * useDrag hook - High performance drag handling
 * Smooth dragging with ghost preview at snap position
 *
 * 效能取向：拖曳過程中「跟手」與「落點預覽」都直接寫 DOM style，不進 React state。
 * 每秒 60 次的 setState 會讓整個視窗子樹（含播放器容器）逐幀重新協調，串流一多就掉幀。
 * 進 state 的只有兩件事：
 *   - isDragging：一次拖曳只翻轉兩次（起、訖）
 *   - collisionId：換手感的綠框，格線粒度且值相同就不 set
 *
 * 與 React 的分工：視窗的 transform 在 render 時仍由 pixelPos（props 推導）寫出。
 * 拖曳期間 pixelPos 不變 → React 不會碰 DOM 的 transform → 手寫的值不會被蓋掉；
 * 放開後 React 依新座標重寫，兩邊自洽。
 */

import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import { snapToGrid, clampToGridBounds, GRID_COLS, GRID_ROWS } from './gridConfig';

interface DragState {
    isDragging: boolean;
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
}

/** 非拖曳狀態下視窗使用的 transition，收尾時要先寫回它才有「滑進格子」的手感 */
const IDLE_TRANSITION = 'transform 0.15s ease-out, width 0.15s ease-out, height 0.15s ease-out';

export interface UseDragOptions {
    cellWidth: number;
    cellHeight: number;
    currentX: number;
    currentY: number;
    width: number;
    height: number;
    onDragEnd: (x: number, y: number, collisionId: string | null) => void;
    checkCollision?: (x: number, y: number, screenX?: number, screenY?: number) => string | null;
    maxRows?: number; // Add maxRows to support dynamic grid height
    /** 被拖曳的視窗元素；拖曳中直接寫它的 transform */
    nodeRef: RefObject<HTMLElement | null>;
    /** 落點預覽（ghost）元素；拖曳中直接寫它的 transform */
    ghostRef: RefObject<HTMLElement | null>;
}

export function useDrag(options: UseDragOptions) {
    const {
        cellWidth,
        cellHeight,
        currentX,
        currentY,
        width,
        height,
        onDragEnd,
        checkCollision,
        maxRows = GRID_ROWS, // Default to GRID_ROWS if not provided
        nodeRef,
        ghostRef,
    } = options;

    // Collision ID for swap feedback（格線粒度，變了才 set）
    const [collisionId, setCollisionId] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const dragState = useRef<DragState>({
        isDragging: false,
        startX: 0,
        startY: 0,
        startPosX: 0,
        startPosY: 0
    });
    const rafRef = useRef<number | undefined>(undefined);
    /** 最新的落點（格線對齊後的像素座標），放開時要用它通知上層 */
    const snapRef = useRef({ x: currentX, y: currentY });
    const collisionRef = useRef<string | null>(null);

    // 幾何與回呼放 ref：pointermove 的 handler 不必因為它們變動而重建，
    // dragHandlers 才能維持穩定身分（否則 DraggableWindow 的 renderProps 又會逐幀改變）。
    const latestRef = useRef({ cellWidth, cellHeight, width, height, maxRows, currentX, currentY, checkCollision, onDragEnd });
    latestRef.current = { cellWidth, cellHeight, width, height, maxRows, currentX, currentY, checkCollision, onDragEnd };

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Capture pointer for smooth tracking
        (e.target as HTMLElement).setPointerCapture(e.pointerId);

        dragState.current = {
            isDragging: true,
            startX: e.clientX,
            startY: e.clientY,
            startPosX: latestRef.current.currentX,
            startPosY: latestRef.current.currentY
        };
        snapRef.current = { x: latestRef.current.currentX, y: latestRef.current.currentY };
        collisionRef.current = null;

        setCollisionId(null);
        setIsDragging(true);
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragState.current.isDragging) return;

        e.preventDefault();

        // Request animation frame for smooth updates
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
        }

        const clientX = e.clientX;
        const clientY = e.clientY;

        rafRef.current = requestAnimationFrame(() => {
            const geom = latestRef.current;
            const deltaX = clientX - dragState.current.startX;
            const deltaY = clientY - dragState.current.startY;

            // Raw position (follows cursor smoothly)
            const rawX = dragState.current.startPosX + deltaX;
            const rawY = dragState.current.startPosY + deltaY;

            // Snap calculation + clamp（垂直用動態 maxRows，允許拖出目前範圍以觸發擴張）
            const snappedX = clampToGridBounds(snapToGrid(rawX, geom.cellWidth), geom.width, GRID_COLS, geom.cellWidth);
            const snappedY = clampToGridBounds(snapToGrid(rawY, geom.cellHeight), geom.height, geom.maxRows, geom.cellHeight);

            // 跟手與落點預覽：直接寫 DOM
            const node = nodeRef.current;
            if (node) node.style.transform = `translate(${rawX}px, ${rawY}px)`;
            const ghost = ghostRef.current;
            if (ghost) ghost.style.transform = `translate(${snappedX}px, ${snappedY}px)`;

            snapRef.current = { x: snappedX, y: snappedY };

            // Check collision for snap position
            // Modified: We now allow staying in collision state (for swap) and report the collision ID
            const collided = geom.checkCollision
                ? geom.checkCollision(snappedX, snappedY, clientX, clientY)
                : null;
            if (collided !== collisionRef.current) {
                collisionRef.current = collided;
                setCollisionId(collided);
            }
        });
    }, [nodeRef, ghostRef]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!dragState.current.isDragging) return;

        e.preventDefault();

        // Release pointer capture
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);

        dragState.current.isDragging = false;

        // Clean up animation frame（避免已排程的 RAF 在收尾之後又把 transform 寫回去）
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = undefined;
        }

        // snapRef 是 RAF 內剛寫入的值，不像舊版讀 state 那樣可能落後一幀
        const { x, y } = snapRef.current;
        const collided = collisionRef.current;

        // 收尾：先把 transition 寫回非拖曳狀態的值，再落到格線位置 → 保留原本「滑進格子」的動畫。
        // React 隨後 re-render 會寫入同樣（或被推擠修正後）的值，不會互相打架。
        const node = nodeRef.current;
        if (node) {
            node.style.transition = IDLE_TRANSITION;
            node.style.transform = `translate(${x}px, ${y}px)`;
        }

        collisionRef.current = null;
        setCollisionId(null);
        setIsDragging(false);

        // Notify parent of final position AND collision (for swap)
        latestRef.current.onDragEnd(x, y, collided);
    }, [nodeRef]);

    const dragHandlers = useMemo(() => ({
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerUp
    }), [handlePointerDown, handlePointerMove, handlePointerUp]);

    return {
        collisionId,
        isDragging,
        dragHandlers,
    };
}
