import { useState, useCallback, useRef, useEffect } from 'react';

const BOTTOM_THRESHOLD = 80; // px from bottom edge to trigger show
const HIDE_DELAY = 500; // ms delay before hiding after leaving

interface UseDynamicIslandProps {
    idleTime?: number; // kept for API compatibility, no longer used
}

export const useDynamicIsland = (_props?: UseDynamicIslandProps) => {
    const [isCollapsed, setIsCollapsed] = useState(true); // default hidden
    const isHoveredRef = useRef(false);
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
            if (!isHoveredRef.current) {
                setIsCollapsed(true);
            }
        }, HIDE_DELAY);
    }, [clearHideTimer]);

    // Global mousemove: show only when cursor is near bottom
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const isNearBottom = e.clientY >= window.innerHeight - BOTTOM_THRESHOLD;

            if (isNearBottom) {
                clearHideTimer();
                setIsCollapsed(false);
            } else if (!isHoveredRef.current) {
                // Cursor left bottom zone and not hovering toolbar
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

    return {
        isCollapsed,
        handlers: {
            onMouseEnter: handleMouseEnter,
            onMouseLeave: handleMouseLeave,
        },
    };
};
