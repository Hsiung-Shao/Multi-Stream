// 「試試新版畫布」提醒：只在非房間模式且沒看過時出現；按鈕決定切換或不再提醒
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '../../src/i18n/i18n';
import { RoomPrompt } from '../../src/components/Canvas/RoomPrompt';
import { useUIStore } from '../../src/store/useUIStore';
import { track } from '../../src/utils/analytics';

const TITLE = '試試新版畫布';
const SWITCH = '切換到新版';
const DISMISS = '不用了';

describe('RoomPrompt', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        localStorage.clear();
        // 提醒只在畫布導覽看完後出現（review 第 1 輪）
        localStorage.setItem('canvas_tour_done', '1');
        useUIStore.setState({ islandStyle: 'original', roomPromptSeen: false, isCanvasTourOpen: false });
        vi.spyOn(track, 'canvasShellSwitch').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('非房間模式且沒看過時，顯示標題與兩個按鈕', async () => {
        render(<RoomPrompt />);
        expect(await screen.findByText(TITLE)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: SWITCH })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: DISMISS })).toBeInTheDocument();
    });

    it('按「不用了」：標記已看過、提醒消失、外殼不變', async () => {
        render(<RoomPrompt />);
        fireEvent.click(await screen.findByRole('button', { name: DISMISS }));
        expect(useUIStore.getState().roomPromptSeen).toBe(true);
        expect(useUIStore.getState().islandStyle).toBe('original');
        await waitFor(() => expect(screen.queryByText(TITLE)).not.toBeInTheDocument());
        expect(track.canvasShellSwitch).not.toHaveBeenCalled();
    });

    it('按「切換到新版」：外殼變 room、標記已看過、提醒消失', async () => {
        render(<RoomPrompt />);
        fireEvent.click(await screen.findByRole('button', { name: SWITCH }));
        expect(useUIStore.getState().islandStyle).toBe('room');
        expect(useUIStore.getState().roomPromptSeen).toBe(true);
        await waitFor(() => expect(screen.queryByText(TITLE)).not.toBeInTheDocument());
    });

    it('按「切換到新版」：回報 canvasShellSwitch(原外殼, "room", "prompt")', async () => {
        render(<RoomPrompt />);
        fireEvent.click(await screen.findByRole('button', { name: SWITCH }));
        expect(track.canvasShellSwitch).toHaveBeenCalledTimes(1);
        expect(track.canvasShellSwitch).toHaveBeenCalledWith('original', 'room', 'prompt');
    });

    it('原外殼是 edgeDock 時，回報的 from 是 edgeDock', async () => {
        useUIStore.setState({ islandStyle: 'edgeDock' });
        render(<RoomPrompt />);
        fireEvent.click(await screen.findByRole('button', { name: SWITCH }));
        expect(track.canvasShellSwitch).toHaveBeenCalledWith('edgeDock', 'room', 'prompt');
    });

    it('選擇結果寫進 userSettings（重新整理後不再出現）', async () => {
        render(<RoomPrompt />);
        fireEvent.click(await screen.findByRole('button', { name: DISMISS }));
        expect(JSON.parse(localStorage.getItem('userSettings') ?? '{}').roomPromptSeen).toBe(true);
    });

    it('外殼已經是 room 時不顯示（即使沒看過）', async () => {
        useUIStore.setState({ islandStyle: 'room', roomPromptSeen: false });
        render(<RoomPrompt />);
        await new Promise(r => setTimeout(r, 50));
        expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    });

    it('已經看過時不顯示', async () => {
        useUIStore.setState({ islandStyle: 'original', roomPromptSeen: true });
        render(<RoomPrompt />);
        await new Promise(r => setTimeout(r, 50));
        expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    });

    it('畫布導覽還沒看完或正開著時不顯示', async () => {
        localStorage.removeItem('canvas_tour_done');
        const { unmount } = render(<RoomPrompt />);
        await new Promise(r => setTimeout(r, 50));
        expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
        unmount();
        localStorage.setItem('canvas_tour_done', '1');
        useUIStore.setState({ isCanvasTourOpen: true });
        render(<RoomPrompt />);
        await new Promise(r => setTimeout(r, 50));
        expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    });
});
