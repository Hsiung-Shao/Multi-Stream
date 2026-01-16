import { renderHook } from '@testing-library/react';
import { useChatResizer } from '../../src/hooks/useChatResizer';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('useChatResizer', () => {
    let resizerRef: any;
    let containerRef: any;
    let resizerElement: HTMLElement;
    let containerElement: HTMLElement;

    beforeEach(() => {
        resizerElement = document.createElement('div');
        containerElement = document.createElement('div');
        resizerRef = { current: resizerElement };
        containerRef = { current: containerElement };

        // Mock offsetWidth
        Object.defineProperty(containerElement, 'offsetWidth', {
            configurable: true,
            value: 350
        });
    });

    it('should initialize with default width', () => {
        renderHook(() => useChatResizer(resizerRef, containerRef, 'left'));
        expect(containerElement.style.width).toBe('350px');
        expect(resizerElement.style.right).toBe('350px');
    });

    it('should handle resizing', () => {
        renderHook(() => useChatResizer(resizerRef, containerRef, 'left', 200, 600, 350));

        // Simulate mousedown
        const mousedown = new MouseEvent('mousedown', { clientX: 1000 });
        resizerElement.dispatchEvent(mousedown);

        expect(document.body.style.cursor).toBe('col-resize');
        expect(resizerElement.classList.contains('resizing')).toBe(true);

        // Simulate mousemove (move left by 50px -> increases width by 50px since direction is 'left')
        const mousemove = new MouseEvent('mousemove', { clientX: 950 });
        document.dispatchEvent(mousemove);

        expect(containerElement.style.width).toBe('400px'); // 350 + 50
    });

    it('should stop resizing on mouseup', () => {
        renderHook(() => useChatResizer(resizerRef, containerRef, 'left'));

        const mousedown = new MouseEvent('mousedown', { clientX: 1000 });
        resizerElement.dispatchEvent(mousedown);

        expect(resizerElement.classList.contains('resizing')).toBe(true);

        const mouseup = new MouseEvent('mouseup');
        document.dispatchEvent(mouseup);

        expect(resizerElement.classList.contains('resizing')).toBe(false);
        expect(document.body.style.cursor).toBe('');
    });

    it('should respect min/max constraints', () => {
        renderHook(() => useChatResizer(resizerRef, containerRef, 'left', 200, 600, 350));

        const mousedown = new MouseEvent('mousedown', { clientX: 1000 });
        resizerElement.dispatchEvent(mousedown);

        // Move extremely left (large width increase) to hit max 600
        // diff = 1000 - 500 = 500. New width = 350 + 500 = 850 > 600. Should cap at 600.
        const mousemove = new MouseEvent('mousemove', { clientX: 500 });
        document.dispatchEvent(mousemove);

        expect(containerElement.style.width).toBe('600px');
    });
});
