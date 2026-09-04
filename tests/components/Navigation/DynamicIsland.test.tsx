import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DynamicIsland } from '../../../src/components/Navigation/DynamicIsland';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { useStreamStore } from '../../../src/store/useStreamStore';
import { useUIStore } from '../../../src/store/useUIStore';
import * as fullscreenUtils from '../../../src/utils/fullscreenUtils';
import { favoritesService } from '../../../src/features/favorites/FavoritesService';
import i18n from '../../../src/i18n/i18n';

// 用真的 i18n 但鎖定 zh-TW:jsdom 的 navigator.language 是 en-US,LanguageDetector 會解析成英文,
// 這裡的斷言全部對著 zh-TW 的實際文案(src/i18n/locales/zh-TW/*),文案改了測試就該紅。
beforeAll(async () => {
    await i18n.changeLanguage('zh-TW');
});

vi.mock('../../../src/store/useStreamStore');
vi.mock('../../../src/store/useUIStore');
vi.mock('../../../src/utils/fullscreenUtils');
vi.mock('../../../src/features/favorites/FavoritesService', () => ({
    favoritesService: {
        addFavorite: vi.fn(),
    }
}));

// 子面板各自有測試,這裡只留動態島本體的按鈕與行為
vi.mock('../../../src/components/Navigation/MediaControlPanel', () => ({ MediaControlPanel: () => <div data-testid="media-control" /> }));
vi.mock('../../../src/components/Navigation/IslandSearch', () => ({ IslandSearch: () => <div data-testid="island-search" /> }));
vi.mock('../../../src/components/Navigation/IslandFavoritesMenu', () => ({ IslandFavoritesMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../../src/components/Navigation/IslandLayoutPicker', () => ({ IslandLayoutPicker: () => <div data-testid="layout-picker" /> }));

type Selector<S> = (s: S) => unknown;

describe('DynamicIsland', () => {
    const mockAddEmptyGroup = vi.fn();
    const mockClearCanvasItems = vi.fn();
    const mockAddCanvasItem = vi.fn();
    const mockSetPage = vi.fn();
    const mockOpenModal = vi.fn();

    const mockStreams = (streams: unknown[]) => {
        (useStreamStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: Selector<unknown>) => selector({
            streams,
            clearCanvasItems: mockClearCanvasItems,
            addEmptyGroup: mockAddEmptyGroup,
            addCanvasItem: mockAddCanvasItem,
        }));
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockStreams([]);
        (useUIStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: Selector<unknown>) => selector({
            setPage: mockSetPage,
            openModal: mockOpenModal,
        }));
        (fullscreenUtils.getFullscreenElement as ReturnType<typeof vi.fn>).mockReturnValue(null);
        (fullscreenUtils.requestFullscreen as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        (fullscreenUtils.exitFullscreen as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        (fullscreenUtils.onFullscreenChange as ReturnType<typeof vi.fn>).mockReturnValue(() => {});
    });

    it('renders all main control buttons with zh-TW labels', () => {
        render(<DynamicIsland />);

        for (const title of [
            '新增視窗', '佈局設定', '媒體控制', '收藏清單', '一鍵收藏當前畫布',
            '分享畫布', '全螢幕', '清空畫面', '返回首頁', '全域設定',
        ]) {
            expect(screen.getByTitle(title)).toBeInTheDocument();
        }
    });

    it('opens the add menu and adds an empty group', async () => {
        render(<DynamicIsland />);

        // Radix DropdownMenu 的 trigger 靠 pointerdown / 鍵盤開啟,不是 click
        const addBtn = screen.getByTitle('新增視窗');
        fireEvent.keyDown(addBtn, { key: 'Enter' });

        const addGroupItem = await screen.findByText('新增組合');
        fireEvent.click(addGroupItem);

        expect(mockAddEmptyGroup).toHaveBeenCalled();
    });

    it('adds a stream window and a chat window from the add menu', async () => {
        render(<DynamicIsland />);
        fireEvent.keyDown(screen.getByTitle('新增視窗'), { key: 'Enter' });
        fireEvent.click(await screen.findByText('新增串流視窗'));
        expect(mockAddCanvasItem).toHaveBeenCalledWith('stream', null);

        fireEvent.keyDown(screen.getByTitle('新增視窗'), { key: 'Enter' });
        fireEvent.click(await screen.findByText('新增聊天室窗'));
        expect(mockAddCanvasItem).toHaveBeenCalledWith('chat', null);
    });

    it('requests fullscreen when not already fullscreen', () => {
        render(<DynamicIsland />);
        fireEvent.click(screen.getByTitle('全螢幕'));
        expect(fullscreenUtils.requestFullscreen).toHaveBeenCalledWith(document.documentElement);
    });

    it('exits fullscreen when already fullscreen', () => {
        (fullscreenUtils.getFullscreenElement as ReturnType<typeof vi.fn>).mockReturnValue(document.documentElement);
        render(<DynamicIsland />);
        // 已全螢幕時按鈕文案是「退出全螢幕」,但 isFullscreen state 由 onFullscreenChange 驅動,初始仍為 false
        fireEvent.click(screen.getByTitle('全螢幕'));
        expect(fullscreenUtils.exitFullscreen).toHaveBeenCalled();
        expect(fullscreenUtils.requestFullscreen).not.toHaveBeenCalled();
    });

    it('asks for confirmation before clearing the canvas', async () => {
        render(<DynamicIsland />);
        fireEvent.click(screen.getByTitle('清空畫面'));

        expect(await screen.findByText('確定要清空所有視窗嗎？')).toBeInTheDocument();
        expect(mockClearCanvasItems).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText('確認'));
        expect(mockClearCanvasItems).toHaveBeenCalled();
    });

    it('does not clear when the dialog is cancelled', async () => {
        render(<DynamicIsland />);
        fireEvent.click(screen.getByTitle('清空畫面'));
        await screen.findByText('確定要清空所有視窗嗎？');

        fireEvent.click(screen.getByText('取消'));
        expect(mockClearCanvasItems).not.toHaveBeenCalled();
    });

    it('quick-saves every stream on the canvas as a favourite', async () => {
        mockStreams([
            { id: 1, platform: 'twitch', channelId: 'shroud' },
            { id: 2, platform: 'youtube', channelId: 'UC123', videoId: 'abc' },
        ]);

        render(<DynamicIsland />);
        fireEvent.click(screen.getByTitle('一鍵收藏當前畫布'));

        await waitFor(() => {
            expect(favoritesService.addFavorite).toHaveBeenCalledTimes(2);
        });
        expect(favoritesService.addFavorite).toHaveBeenCalledWith('https://twitch.tv/shroud', 'shroud', null);
        expect(favoritesService.addFavorite).toHaveBeenCalledWith('https://youtube.com/watch?v=abc', 'UC123', null);
    });

    it('does not call the favourites service when the canvas is empty', async () => {
        render(<DynamicIsland />);
        fireEvent.click(screen.getByTitle('一鍵收藏當前畫布'));
        await Promise.resolve();
        expect(favoritesService.addFavorite).not.toHaveBeenCalled();
    });

    it('navigates home and opens global settings', () => {
        render(<DynamicIsland />);
        fireEvent.click(screen.getByTitle('返回首頁'));
        expect(mockSetPage).toHaveBeenCalledWith('home');

        fireEvent.click(screen.getByTitle('全域設定'));
        expect(mockOpenModal).toHaveBeenCalledWith('favorites', 'global_settings');
    });
});
