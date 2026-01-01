/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../../src/store/useUIStore';

describe('useUIStore', () => {
    beforeEach(() => {
        // Reset store to initial state
        useUIStore.setState({
            theme: 'dark',
            isPanelCollapsed: false,
            modals: {
                history: false,
                tutorial: false,
                favorites: false,
                feedback: false,
                about: false,
                privacy: false,
            },
            masterVolume: 100,
            masterMuted: false,
        });
    });

    it('should toggle theme', () => {
        expect(useUIStore.getState().theme).toBe('dark');
        useUIStore.getState().toggleTheme();
        expect(useUIStore.getState().theme).toBe('light');
        useUIStore.getState().toggleTheme();
        expect(useUIStore.getState().theme).toBe('dark');
    });

    it('should toggle panel collapse', () => {
        expect(useUIStore.getState().isPanelCollapsed).toBe(false);
        useUIStore.getState().togglePanelCollapsed();
        expect(useUIStore.getState().isPanelCollapsed).toBe(true);
    });

    it('should open and close modals', () => {
        expect(useUIStore.getState().modals.favorites).toBe(false);

        useUIStore.getState().openModal('favorites');
        expect(useUIStore.getState().modals.favorites).toBe(true);

        useUIStore.getState().closeModal('favorites');
        expect(useUIStore.getState().modals.favorites).toBe(false);
    });

    it('should update master volume', () => {
        useUIStore.getState().setMasterVolume(50);
        expect(useUIStore.getState().masterVolume).toBe(50);

        useUIStore.getState().setMasterVolume((prev) => prev + 10);
        expect(useUIStore.getState().masterVolume).toBe(60);
    });

    it('should update master muted', () => {
        expect(useUIStore.getState().masterMuted).toBe(false);
        useUIStore.getState().setMasterMuted(true);
        expect(useUIStore.getState().masterMuted).toBe(true);
    });
});
