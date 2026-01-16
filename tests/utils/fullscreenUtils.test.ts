import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    requestFullscreen,
    exitFullscreen,
    getFullscreenElement,
    onFullscreenChange
} from '../../src/utils/fullscreenUtils';

describe('fullscreenUtils', () => {
    let element: HTMLElement;

    beforeEach(() => {
        element = document.createElement('div');
        // Reset document methods
        (document as any).fullscreenElement = null;
        (document as any).exitFullscreen = undefined;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('requestFullscreen', () => {
        it('should call standard requestFullscreen if available', async () => {
            element.requestFullscreen = vi.fn().mockResolvedValue(undefined);
            await requestFullscreen(element);
            expect(element.requestFullscreen).toHaveBeenCalled();
        });

        it('should call webkitRequestFullscreen if standard not available', async () => {
            (element as any).requestFullscreen = undefined;
            (element as any).webkitRequestFullscreen = vi.fn().mockResolvedValue(undefined); // Safari/Chrome old
            await requestFullscreen(element);
            expect((element as any).webkitRequestFullscreen).toHaveBeenCalled();
        });
    });

    describe('exitFullscreen', () => {
        it('should call standard exitFullscreen', async () => {
            document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
            await exitFullscreen();
            expect(document.exitFullscreen).toHaveBeenCalled();
        });
    });

    describe('getFullscreenElement', () => {
        it('should return document.fullscreenElement', () => {
            Object.defineProperty(document, 'fullscreenElement', {
                configurable: true,
                value: element
            });
            expect(getFullscreenElement()).toBe(element);
        });
    });

    describe('onFullscreenChange', () => {
        it('should add event listener', () => {
            const spy = vi.spyOn(document, 'addEventListener');
            const callback = vi.fn();
            onFullscreenChange(callback);

            expect(spy).toHaveBeenCalledWith('fullscreenchange', callback);
            // It might allow multiple listeners for vendor prefixes
            // expect(spy).toHaveBeenCalledTimes(4); // standard, webkit, moz, ms
        });
    });
});
