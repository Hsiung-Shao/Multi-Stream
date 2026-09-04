import { useEffect, RefObject } from 'react';

export function useChatResizer(
    resizerRef: RefObject<HTMLElement>,
    containerRef: RefObject<HTMLElement>,
    direction: 'left' | 'right' = 'left',
    minWidth: number = 200,
    maxWidth: number = 600,
    defaultWidth: number = 350
) {
    useEffect(() => {
        const resizer = resizerRef.current;
        const container = containerRef.current;
        if (!resizer || !container) return;

        let startX = 0;
        let startWidth = 0;

        const onMouseDown = (e: MouseEvent) => {
            e.preventDefault();
            startX = e.clientX;
            startWidth = container.offsetWidth;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'col-resize';
            resizer.classList.add('resizing');
        };

        const onMouseMove = (e: MouseEvent) => {
            e.preventDefault();
            const dx = e.clientX - startX;
            let newWidth = startWidth;

            if (direction === 'left') {
                // Resizer is on the left of container (container is on right)
                // Moving left (negative dx) increases width
                newWidth = startWidth - dx;
            } else {
                // Resizer is on right
                newWidth = startWidth + dx;
            }

            if (newWidth < minWidth) newWidth = minWidth;
            if (newWidth > maxWidth) newWidth = maxWidth;

            container.style.width = `${newWidth}px`;

            // Update resizer position if it's absolute
            // If resizer is inside container, it moves with it. 
            // If it's outside or absolute relative to parent, we might need to move it.
            // But typically resizer is part of the layout or positioned by CSS relative to container edge.
            // 目前唯一使用者(MobileWatchPage)的 resizer 是 absolute。

            // Legacy behavior: setupChatResizer usually updated style.right of resizer if separate?
            // 舊版桌機串流框(已移除)初始寫 style={{ right: '350px' }},此處沿用同一慣例。
            // We should update the resizer's style.right to match width if it's "left" resize for a "right" docked chat.
            if (direction === 'left') {
                resizer.style.right = `${newWidth}px`;
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            resizer.classList.remove('resizing');
        };

        resizer.addEventListener('mousedown', onMouseDown);

        // Set initial position
        if (direction === 'left') {
            resizer.style.right = `${container.style.width || defaultWidth}px`;
            if (!container.style.width) container.style.width = `${defaultWidth}px`;
        }

        return () => {
            resizer.removeEventListener('mousedown', onMouseDown);
        };
    }, [resizerRef, containerRef, direction, minWidth, maxWidth, defaultWidth]);
}
