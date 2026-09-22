/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useUIStore } from '../../src/store/useUIStore';

describe('useUIStore', () => {
    beforeEach(() => {
        useUIStore.setState({
            masterVolume: 50,
            masterMuted: false,
            theme: 'dark'
        });
    });

    it('should set master volume', () => {
        useUIStore.getState().setMasterVolume(80);
        expect(useUIStore.getState().masterVolume).toBe(80);
    });

    it('should set master mute', () => {
        useUIStore.getState().setMasterMuted(true);
        expect(useUIStore.getState().masterMuted).toBe(true);

        useUIStore.getState().setMasterMuted(false);
        expect(useUIStore.getState().masterMuted).toBe(false);
    });

    it('should toggle theme', () => {
        useUIStore.setState({ theme: 'dark' });
        useUIStore.getState().toggleTheme();
        expect(useUIStore.getState().theme).toBe('light');

        useUIStore.getState().toggleTheme();
        expect(useUIStore.getState().theme).toBe('dark');
    });

    it('should set layout-related UI flags', () => {
        useUIStore.getState().setCloseWindowMode('empty');
        expect(useUIStore.getState().closeWindowMode).toBe('empty');

        useUIStore.getState().setCloseWindowMode('remove');
        expect(useUIStore.getState().closeWindowMode).toBe('remove');
    });

    it('畫布操作累計 5 次後才收起 hover 說明，並寫入 userSettings', () => {
        useUIStore.setState({ canvasHintsLearned: false });
        for (let i = 0; i < 4; i++) useUIStore.getState().recordCanvasManipulation();
        expect(useUIStore.getState().canvasHintsLearned).toBe(false);
        useUIStore.getState().recordCanvasManipulation();
        expect(useUIStore.getState().canvasHintsLearned).toBe(true);
        expect(JSON.parse(localStorage.getItem('userSettings') || '{}').canvasHintsLearned).toBe(true);
    });
});
