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
import { calculateGridConfig, GridConfig, GRID_COLS, GRID_ROWS, PixelPosition } from './gridConfig';
import { checkCollision, checkPointCollision, Rect } from './collision';
import { resolvePushResize } from './pushResize';
import { cn } from '../ui/utils';
import { ScrollArea } from '../ui/scroll-area';
import { calculateRequiredRows } from '../../utils/layoutEngine';
import { useUIStore } from '../../store/useUIStore';
import { resizeLimitsOf, MIN_CHAT_COLS, MAX_CHAT_COLS } from './sizeLimits';

// 尺寸限制與縮放預覽共用同一份（見 sizeLimits.ts）；NewCanvasPage 從這裡取用
export { limitsOf } from './sizeLimits';

/** calculateRequiredRows 只看 layout，其餘欄位純粹是型別佔位 */
const toLayoutItems = (windows: CanvasWindow[]) => windows.map(w => ({
    i: w.id,
    type: 'stream' as const,
    contentId: null,
    layout: { x: w.gridX, y: w.gridY, w: w.gridW, h: w.gridH }
}));

/**
 * 視窗的 DOM 順序一律依 id 排，不跟 windows 陣列順序走。
 * 切版面（模板、自訂佈局、Alt+數字切版型）只要改變陣列順序，
 * React 就會用 insertBefore 搬動既有節點；瀏覽器搬動含 iframe 的節點會讓 iframe 整個重載，
 * Twitch 播放器回到網址上的 muted=true，而 StreamIframe 手上的 player 物件從此失聯——
 * UI 顯示未靜音、按鈕也救不回來（2026-09 production 以直播中頻道實測重現）。
 * 視窗的疊放層級由 z-index（拖曳/縮放 z-50、劇院模式 z-[100]）決定，不依賴 DOM 順序，所以可以固定。
 * 依 id 排序後，新增只插入新節點、刪除只移除節點，既有 iframe 永遠不會被搬動。
 */
export const stableRenderOrder = (windows: CanvasWindow[]): CanvasWindow[] =>
    [...windows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/**
 * 這次縮放是不是「調整右側聊天室欄寬」。必須同時滿足：
 *   - 畫面是「串流在左、聊天室在右側滿高一欄」：所有聊天室同一欄（x、寬相同）、貼齊右緣、
 *     從第 0 列起無縫接滿至少一個畫面高（24 列），而且每一路串流都完全在聊天室欄左邊
 *   - 只有左緣移動（右緣前後都貼齊畫布、上下不變、寬度有變）
 *   - 新寬度在聊天室欄寬範圍（3～8）內：落地交給 setChatColumnWidth，它會夾進這個範圍，
 *     範圍外的寬度走這裡就會「預覽 9 欄、放開彈回 8 欄」
 * 這種情況改由上層重排（串流依比例重新填滿左側），不走推擠——推擠只會讓緊鄰的串流讓位，排不出整齊的版面。
 * 其餘情況（右側也有直播的自訂排法、貼右緣的半高聊天室、比上限寬的舊聊天室）都走一般縮放，
 * 否則拉一下聊天室左緣就會把使用者排好的整頁重排掉。
 */
export function isChatColumnResize(
    windows: readonly CanvasWindow[], id: string, gridX: number, gridY: number, gridW: number, gridH: number,
): boolean {
    const before = windows.find(w => w.id === id);
    if (!before || before.type !== 'chat') return false;
    if (before.gridX + before.gridW !== GRID_COLS || gridX + gridW !== GRID_COLS) return false;
    if (before.gridY !== gridY || before.gridH !== gridH || before.gridW === gridW) return false;
    if (gridW < MIN_CHAT_COLS || gridW > MAX_CHAT_COLS) return false;

    const chats = windows.filter(w => w.type === 'chat');
    if (!chats.every(w => w.gridX === before.gridX && w.gridW === before.gridW)) return false;
    if (!windows.every(w => w.type === 'chat' || w.gridX + w.gridW <= before.gridX)) return false;

    // 滿高：聊天室由上到下首尾相接、從第 0 列起至少接滿一整個畫面高（24 列）。
    // 不要求接到「所有視窗的最下緣」：畫布往下長（串流超過 24 列，例如舊版排出的長版面）時，
    // generateColumnLayout 產生的聊天室欄仍是 0～24 列，那樣比會把真正的欄寬調整誤判成一般縮放。
    // 聊天室多到自己超過 24 列（每個至少 6 列）時，首尾相接的條件照樣成立。
    let edge = 0;
    for (const c of [...chats].sort((a, b) => a.gridY - b.gridY)) {
        if (c.gridY !== edge) return false;
        edge += c.gridH;
    }
    return edge >= GRID_ROWS;
}

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
    /** 拖曳右側聊天室欄的左緣：回報新的欄寬（格數），由上層重排。不必是穩定身分（從 ref 讀） */
    onChatColumnResize?: (cols: number) => void;
    className?: string;
}

export const SimpleCanvas = memo(function SimpleCanvas({
    windows,
    onWindowUpdate,
    onWindowRemove,
    renderContent,
    onChatColumnResize,
    className
}: SimpleCanvasProps) {
    // Grid configuration - recalculates on resize
    const [gridConfig, setGridConfig] = useState<GridConfig>(() =>
        calculateGridConfig(window.innerWidth, window.innerHeight, calculateRequiredRows(toLayoutItems(windows)))
    );

    const theaterWindowId = useUIStore(s => s.theaterWindowId);

    // Swap mode state (Drag based)
    const [dragSwapTargetId, setDragSwapTargetId] = useState<string | null>(null);
    // 正在拖曳的視窗：其他視窗據此顯示「可放在這裡交換」（只在拖曳開始／結束各變一次）
    const [draggingWindowId, setDraggingWindowId] = useState<string | null>(null);

    // resize 過程中鄰居的讓位預覽（只畫輪廓，放開才落地）
    const [resizeGhosts, setResizeGhosts] = useState<Record<string, PixelPosition> | null>(null);

    // Container ref for pointer collision tracking
    const containerRef = useRef<HTMLDivElement>(null);

    // 最新值放 ref，讓下面所有回呼都能維持空 deps（見檔頭效能約束）
    const windowsRef = useRef(windows);
    windowsRef.current = windows;
    const onWindowUpdateRef = useRef(onWindowUpdate);
    onWindowUpdateRef.current = onWindowUpdate;
    const onChatColumnResizeRef = useRef(onChatColumnResize);
    onChatColumnResizeRef.current = onChatColumnResize;

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

    // 渲染順序固定依 id（元素身分不變，DraggableWindow 的 memo 不受影響）
    const renderOrder = useMemo(() => stableRenderOrder(windows), [windows]);

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
        const { minW, minH, maxW } = resizeLimitsOf(w);
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
                // 鄰居被壓縮的下限同樣取 resizeLimitsOf：已比 6×6 小的格子不會因為被推而先被撐大
                minSize: resizeLimitsOf,
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
                useUIStore.getState().recordCanvasManipulation();
                return;
            }
        }

        // NO COLLISION (or simple move)
        const updated = current.map(w =>
            w.id === id ? { ...w, gridX, gridY } : w
        );
        onWindowUpdateRef.current(updated);
        setDragSwapTargetId(null);
        // 點工具列按鈕也會走一次拖曳起落（位置不變），那不算使用者學會了拖曳
        if (source.gridX !== gridX || source.gridY !== gridY) useUIStore.getState().recordCanvasManipulation();
    }, []);

    // resize 拖曳中：算出鄰居讓位後的位置，但只拿來畫 ghost
    const handleSizePreview = useCallback((id: string, gridX: number, gridY: number, gridW: number, gridH: number) => {
        // 調整聊天室欄寬：放開後整個重排，推擠算出的讓位輪廓不代表最終結果，不畫
        if (onChatColumnResizeRef.current && isChatColumnResize(windowsRef.current, id, gridX, gridY, gridW, gridH)) {
            setResizeGhosts(null);
            return;
        }
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
        const before = windowsRef.current.find(w => w.id === id);
        // 只是點了一下縮放角（位置尺寸都沒變）：什麼都不做，不跑推擠／連鎖填補，也不夾尺寸。
        // 縮放角與工具列的拖曳把手相鄰，使用者常常只是想點工具列。
        if (before && before.gridX === gridX && before.gridY === gridY && before.gridW === gridW && before.gridH === gridH) return;
        const onChatColumn = onChatColumnResizeRef.current;
        if (onChatColumn && isChatColumnResize(windowsRef.current, id, gridX, gridY, gridW, gridH)) {
            onChatColumn(gridW);
            useUIStore.getState().recordCanvasManipulation();
            return;
        }
        const solved = solveResize(id, gridX, gridY, gridW, gridH);
        if (!solved) return;
        onWindowUpdateRef.current(solved.windows);
        useUIStore.getState().recordCanvasManipulation();
    }, [solveResize]);

    const handleHoverChange = useCallback((hoveredId: string | null, canvasItemId: string | null) => {
        useUIStore.getState().setHoveredWindowId(hoveredId, canvasItemId);
    }, []);

    // 只標示同類型的落點：串流換到滿高 4 欄的聊天室上會變成細長條，不主動邀請使用者這樣做
    const draggingType = draggingWindowId ? (windows.find(w => w.id === draggingWindowId)?.type ?? null) : null;

    const handleDragStateChange = useCallback((id: string, dragging: boolean) => {
        setDraggingWindowId(prev => (dragging ? id : prev === id ? null : prev));
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
                {/* Windows（DOM 順序固定依 id，見 stableRenderOrder） */}
                {renderOrder.map(w => (
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
                        onDragStateChange={handleDragStateChange}
                        isSwapCandidate={draggingType !== null && draggingWindowId !== w.id && w.type === draggingType}
                    />
                ))}
            </div>
        </ScrollArea>
    );
});

export type { CanvasWindow };
