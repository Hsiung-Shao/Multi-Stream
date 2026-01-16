import { useState, useEffect, useCallback, useRef } from 'react';

interface UseDynamicIslandProps {
    idleTime?: number; // Time in ms before auto-hiding
}

export const useDynamicIsland = ({ idleTime = 15000 }: UseDynamicIslandProps = {}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const resetTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
        setIsCollapsed(false);

        // Only set auto-hide timer if not currently hovered
        if (!isHovered) {
            timerRef.current = setTimeout(() => {
                setIsCollapsed(true);
            }, idleTime);
        }
    }, [idleTime, isHovered]);

    // Setup global mouse listener to reset timer on activity
    useEffect(() => {
        const handleMouseMove = () => {
            resetTimer();
        };

        const handleKeyDown = () => {
            resetTimer();
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('keydown', handleKeyDown);

        // Initial timer
        resetTimer();

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('keydown', handleKeyDown);
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [resetTimer]);

    // Handle hover state changes
    const handleMouseEnter = () => {
        setIsHovered(true);
        setIsCollapsed(false);
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
    };

    const handleMouseLeave = () => {
        setIsHovered(false);
        resetTimer();
    };

    return {
        isCollapsed,
        handlers: {
            onMouseEnter: handleMouseEnter,
            onMouseLeave: handleMouseLeave
        }
    };
};
