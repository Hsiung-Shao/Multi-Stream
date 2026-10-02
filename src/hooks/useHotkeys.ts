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
        hoveredWindowId,
        hoveredCanvasItemId,
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
        // 桌機畫布的播放器只看各路的 isMuted(見 CanvasStreamContent 的 effectiveMuted),
        // 所以只翻 masterMuted 旗標不會真的靜音——必須跟著呼叫 setAllMuted,
        // 與 MediaControlPanel 的 applyMasterMute 走同一條路。
        if (e.ctrlKey && key === 'm') {
            e.preventDefault();
            const next = !useUIStore.getState().masterMuted;
            setMasterMuted(next);
            useStreamStore.getState().setAllMuted(next);
            return;
        }

        // Layout Switching: Alt + 1-6, 9
        // 套用動態島布局清單「僅串流」分頁裡同路數的版型（對應見 templateIdForLayoutType）；7、8 沒有對應快捷鍵
        if (e.altKey && !e.ctrlKey && !e.shiftKey) {
            // 先看實體鍵位：Mac 的 Option+數字 e.key 是特殊符號（Option+2 = ™），只靠 e.key 收不到數字
            const digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code)?.[1];
            const num = parseInt(digit ?? e.key);
            if (!isNaN(num)) {
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
            // 用「視窗身分」而非串流身分：一路串流可能同時有畫面視窗與聊天室視窗，
            // 用串流身分會兩個一起放大。
            if (key === 't') {
                e.preventDefault();
                const target = hoveredCanvasItemId ?? hoveredWindowId;
                setTheaterWindowId(theaterWindowId === target ? null : target);
                return;
            }
        }

    }, [
        toggleHotkeyHelp, setSearchFocused, setMasterMuted,
        setLayout, streams, updateStream, removeStream, hoveredWindowId, hoveredCanvasItemId, setHoveredWindowId,
        theaterWindowId, setTheaterWindowId
    ]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
};
