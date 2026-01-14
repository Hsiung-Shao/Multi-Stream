import { useEffect, useCallback } from 'react';
import { useUIStore } from '../store/useUIStore';
import { useStreamStore } from '../store/useStreamStore';
import { LayoutType } from '../utils/layoutUtils';

export const useHotkeys = () => {
    // Stores
    const {
        toggleHotkeyHelp,
        setSearchFocused,
        setMasterMuted,
        togglePanelCollapsed,
        hoveredWindowId,
        setHoveredWindowId,
        theaterWindowId,
        setTheaterWindowId
    } = useUIStore();

    const {
        setLayout,
        streams,
        updateStream,
        removeStream
    } = useStreamStore();

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Ignore if input is focused (except specifically allowed keys like Escape)
        const activeElement = document.activeElement;
        const isInputActive = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.getAttribute('contenteditable') === 'true'
        );

        if (isInputActive) {
            if (e.key === 'Escape') {
                (activeElement as HTMLElement).blur();
            }
            return;
        }

        const key = e.key.toLowerCase();
        // const code = e.code; // Unused

        // Global Shortcuts

        // Help: Ctrl + /
        if (e.ctrlKey && e.key === '/') {
            e.preventDefault();
            toggleHotkeyHelp();
            return;
        }

        // Search: Ctrl + K or Alt + S
        if ((e.ctrlKey && key === 'k') || (e.altKey && key === 's')) {
            e.preventDefault();
            setSearchFocused(true);
            return;
        }

        // Quick Save: Ctrl + S
        if (e.ctrlKey && key === 's') {
            e.preventDefault();
            useUIStore.getState().openModal('favorites', 'layouts');
            return;
        }

        // Master Mute: Ctrl + M
        if (e.ctrlKey && key === 'm') {
            e.preventDefault();
            setMasterMuted((prev) => !prev);
            return;
        }

        // Focus Mode / Toggle UI: Shift + F
        if (e.shiftKey && key === 'f') {
            e.preventDefault();
            togglePanelCollapsed();
            return;
        }

        // Layout Switching: Alt + 1-9
        if (e.altKey && !e.ctrlKey && !e.shiftKey) {
            const num = parseInt(e.key);
            if (!isNaN(num)) {
                // Map keys 1-9 to specific LayoutTypes
                // Valid types: 1, 2, 3, 4, 5, 6, 9
                // Key 1 -> Type 1
                // Key 2 -> Type 2
                // Key 3 -> Type 3
                // Key 4 -> Type 4
                // Key 5 -> Type 5
                // Key 6 -> Type 6
                // Key 9 -> Type 9
                // Key 7, 8 -> Ignore or map to something else? Ignoring for now.

                let targetLayout: LayoutType | null = null;

                if ([1, 2, 3, 4, 5, 6, 9].includes(num)) {
                    targetLayout = num as LayoutType;
                }

                if (targetLayout) {
                    e.preventDefault();
                    setLayout(targetLayout);
                }
                return;
            }
        }

        // Window Specific Shortcuts (Context Sensitive)

        // Theater Mode Global Exit (Escape)
        // If Theater Mode is active, Escape key exits it.
        // This is important because the "hoveredWindowId" can be tricky in fullscreens.
        if (theaterWindowId && e.key === 'Escape') {
            e.preventDefault();
            setTheaterWindowId(null);
            return;
        }

        // Hover Context Actions
        if (hoveredWindowId) {
            // Reload: R
            if (key === 'r') {
                window.dispatchEvent(new CustomEvent(`stream-reload-${hoveredWindowId}`));
                return;
            }

            // Mute: M
            if (key === 'm') {
                const targetStream = streams.find(s => s.id.toString() === hoveredWindowId);
                if (targetStream) {
                    updateStream(targetStream.id, { isMuted: !targetStream.isMuted });
                }
                return;
            }

            // Remove: Delete / Backspace
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const targetStream = streams.find(s => s.id.toString() === hoveredWindowId);
                if (targetStream) {
                    removeStream(targetStream.id);
                    setHoveredWindowId(null);
                }
                return;
            }

            // Fullscreen: F (Browser Fullscreen)
            if (key === 'f') {
                const el = document.getElementById(`stream-container-${hoveredWindowId}`);
                if (el) {
                    if (!document.fullscreenElement) {
                        el.requestFullscreen().catch(err => console.error(err));
                    } else {
                        document.exitFullscreen();
                    }
                }
                return;
            }

            // Theater Mode: T (App Logic Fullscreen)
            if (key === 't') {
                e.preventDefault();
                // Toggle logic
                if (theaterWindowId === hoveredWindowId) {
                    setTheaterWindowId(null);
                } else {
                    setTheaterWindowId(hoveredWindowId);
                }
                return;
            }
        }

    }, [
        toggleHotkeyHelp, setSearchFocused, setMasterMuted, togglePanelCollapsed,
        setLayout, streams, updateStream, removeStream, hoveredWindowId, setHoveredWindowId,
        theaterWindowId, setTheaterWindowId
    ]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
};
