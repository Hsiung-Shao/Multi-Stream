import { useEffect, useRef } from 'react';

export interface RoomHotkeyHandlers {
    onTogglePalette: () => void;
    onToggleMode: () => void;
    onFocusIndex: (index: number) => void;
}

const isTyping = (el: EventTarget | null) =>
    el instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable || el.getAttribute('contenteditable') === 'true');

/** 房間模式快捷鍵：Ctrl/⌘ K 開關面板（打字中也有效）；G 切舞台／平分、1–9 設焦點（打字中不觸發） */
export function useRoomHotkeys(handlers: RoomHotkeyHandlers, enabled = true): void {
    const ref = useRef(handlers);
    ref.current = handlers;

    useEffect(() => {
        if (!enabled) return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                ref.current.onTogglePalette();
                return;
            }
            if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
            if (e.key === 'g' || e.key === 'G') ref.current.onToggleMode();
            else if (/^[1-9]$/.test(e.key)) ref.current.onFocusIndex(Number(e.key) - 1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [enabled]);
}
