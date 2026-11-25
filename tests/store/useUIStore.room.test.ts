// 房間模式相關設定：切換後要寫進 localStorage.userSettings（重新整理後還在）
import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../../src/store/useUIStore';

const saved = () => JSON.parse(localStorage.getItem('userSettings') ?? '{}');

describe('useUIStore 房間模式設定', () => {
    beforeEach(() => {
        localStorage.clear();
        useUIStore.setState({ islandStyle: 'original', roomMode: 'stage', audioFollowsFocus: true, roomPromptSeen: false });
    });

    it('setIslandStyle("room") 後狀態與 userSettings 都是 room', () => {
        useUIStore.getState().setIslandStyle('room');
        expect(useUIStore.getState().islandStyle).toBe('room');
        expect(saved().islandStyle).toBe('room');
    });

    it('setRoomPromptSeen(true) 寫進 userSettings.roomPromptSeen', () => {
        useUIStore.getState().setRoomPromptSeen(true);
        expect(useUIStore.getState().roomPromptSeen).toBe(true);
        expect(saved().roomPromptSeen).toBe(true);
    });

    it('setAudioFollowsFocus(false) 寫進 userSettings.audioFollowsFocus', () => {
        useUIStore.getState().setAudioFollowsFocus(false);
        expect(useUIStore.getState().audioFollowsFocus).toBe(false);
        expect(saved().audioFollowsFocus).toBe(false);
    });

    it('setRoomMode("grid") 寫進 userSettings.roomMode', () => {
        useUIStore.getState().setRoomMode('grid');
        expect(useUIStore.getState().roomMode).toBe('grid');
        expect(saved().roomMode).toBe('grid');
    });

    it('多個設定連續寫入時彼此不覆蓋', () => {
        const s = useUIStore.getState();
        s.setIslandStyle('room');
        s.setRoomMode('grid');
        s.setRoomPromptSeen(true);
        expect(saved()).toMatchObject({ islandStyle: 'room', roomMode: 'grid', roomPromptSeen: true });
    });
});
