import { useState, useCallback, useRef, useEffect } from 'react';

const BOTTOM_THRESHOLD = 80; // px from bottom edge to trigger show
const HIDE_DELAY = 2000; // ms delay before hiding after leaving

interface UseDynamicIslandProps {
    idleTime?: number; // kept for API compatibility, no longer used
}

export const useDynamicIsland = (_props?: UseDynamicIslandProps) => {
    const [isCollapsed, setIsCollapsed] = useState(true); // default hidden
    const isHoveredRef = useRef(false);
    // 「使用中」釘住:有任一彈出 UI 開啟 / 搜尋框聚焦時為 true,期間不自動隱藏
    const isPinnedRef = useRef(false);
    const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

    const clearHideTimer = useCallback(() => {
        if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
    }, []);

    const scheduleHide = useCallback(() => {
        clearHideTimer();
        hideTimerRef.current = setTimeout(() => {
            hideTimerRef.current = null;
            if (!isHoveredRef.current && !isPinnedRef.current) {
                setIsCollapsed(true);
            }
        }, HIDE_DELAY);
    }, [clearHideTimer]);

    // Global mousemove: show only when cursor is near bottom
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isPinnedRef.current) return; // 使用中:不因滑鼠離開底部而隱藏

            const isNearBottom = e.clientY >= window.innerHeight - BOTTOM_THRESHOLD;

            if (isNearBottom) {
                clearHideTimer();
                setIsCollapsed(false);
            } else if (!isHoveredRef.current && !hideTimerRef.current) {
                // 離開底部區且未 hover:只排一次倒數,持續移動不重置(離開後固定 HIDE_DELAY 隱藏)
                scheduleHide();
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            clearHideTimer();
        };
    }, [clearHideTimer, scheduleHide]);

    // Toolbar hover handlers
    const handleMouseEnter = () => {
        isHoveredRef.current = true;
        clearHideTimer();
        setIsCollapsed(false);
    };

    const handleMouseLeave = () => {
        isHoveredRef.current = false;
        scheduleHide();
    };

    // 由外部彙整「是否正在使用」(彈出 UI 開啟 / 搜尋聚焦)→ 釘住或解除釘住
    const setPinned = useCallback((pinned: boolean) => {
        isPinnedRef.current = pinned;
        if (pinned) {
            clearHideTimer();
            setIsCollapsed(false);
        } else if (!isHoveredRef.current) {
            // 解除釘住時若滑鼠仍在島上,交給 onMouseLeave 之後再排倒數(語意對齊,避免冗餘排程)
            scheduleHide();
        }
    }, [clearHideTimer, scheduleHide]);

    return {
        isCollapsed,
        setPinned,
        handlers: {
            onMouseEnter: handleMouseEnter,
            onMouseLeave: handleMouseLeave,
        },
    };
};
