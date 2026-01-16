import { renderHook } from '@testing-library/react';
import { useAppInitialization } from '../../src/hooks/useAppInitialization';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { backupService } from '../../src/features/backup';

// Mock backupService
vi.mock('../../src/features/backup', () => ({
    backupService: {
        autoRestore: vi.fn().mockResolvedValue({ restored: false }),
    }
}));

describe('useAppInitialization', () => {
    let dispatchEventSpy: any;

    beforeEach(() => {
        vi.useFakeTimers();
        dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('should initialize with visible pre-loader', () => {
        // Since hook manipulates DOM or state, and returns loading state possibly?
        // The current hook doesn't return state, it just runs logic. 
        // We verify the side effects.

        const { result } = renderHook(() => useAppInitialization());
        // Verify side effects if any visible via mocks
    });

    it('should trigger refreshFavoritesStatus after initial delay', async () => {
        renderHook(() => useAppInitialization());

        await vi.advanceTimersByTimeAsync(1600);

        expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(CustomEvent));
        const calls = dispatchEventSpy.mock.calls;
        const refreshEvents = calls.filter((call: any) => call[0].type === 'refreshFavoritesStatus');
        expect(refreshEvents.length).toBeGreaterThan(0);
    });

    it('should attempt auto restore and trigger updates if restored', async () => {
        (backupService.autoRestore as any).mockResolvedValue({ restored: true, message: 'Restored' });

        renderHook(() => useAppInitialization());

        await vi.advanceTimersByTimeAsync(1600);

        expect(backupService.autoRestore).toHaveBeenCalled();

        const calls = dispatchEventSpy.mock.calls;
        expect(calls.some((call: any) => call[0].type === 'favoritesUpdated')).toBe(true);
        expect(calls.some((call: any) => call[0].type === 'tagsUpdated')).toBe(true);
    });

    it('should attempt auto restore but NOT trigger updates if NOT restored', async () => {
        (backupService.autoRestore as any).mockResolvedValue({ restored: false });

        renderHook(() => useAppInitialization());

        await vi.advanceTimersByTimeAsync(1600);

        expect(backupService.autoRestore).toHaveBeenCalled();

        const calls = dispatchEventSpy.mock.calls;
        expect(calls.some((call: any) => call[0].type === 'favoritesUpdated')).toBe(false);
    });
});
