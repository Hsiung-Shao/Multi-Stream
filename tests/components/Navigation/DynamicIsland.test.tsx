import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DynamicIsland } from '../../../src/components/Navigation/DynamicIsland';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStreamStore } from '../../../src/store/useStreamStore';
import { useUIStore } from '../../../src/store/useUIStore';
import * as fullscreenUtils from '../../../src/utils/fullscreenUtils';
import { favoritesService } from '../../../src/features/favorites/FavoritesService';

// Mock stores
vi.mock('../../../src/store/useStreamStore');
vi.mock('../../../src/store/useUIStore');

// Mock dependencies
vi.mock('../../../src/utils/fullscreenUtils');

vi.mock('../../../src/features/favorites/FavoritesService', () => ({
    favoritesService: {
        addFavorite: vi.fn(),
    }
}));

// Mock child components to isolate DynamicIsland logic
vi.mock('../../../src/components/Navigation/MediaControlPanel', () => ({ MediaControlPanel: () => <div data-testid="media-control" /> }));
vi.mock('../../../src/components/Navigation/IslandSearch', () => ({ IslandSearch: () => <div data-testid="island-search" /> }));
vi.mock('../../../src/components/Navigation/IslandFavoritesMenu', () => ({ IslandFavoritesMenu: ({ children }: any) => <div>{children}</div> }));
vi.mock('../../../src/components/Navigation/IslandLayoutPicker', () => ({ IslandLayoutPicker: () => <div data-testid="layout-picker" /> }));

describe('DynamicIsland', () => {
    const mockAddEmptyGroup = vi.fn();
    const mockClearCanvasItems = vi.fn();
    const mockAddCanvasItem = vi.fn();
    const mockSetPage = vi.fn();
    const mockOpenModal = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        (useStreamStore as any).mockImplementation((selector: any) => selector({
            streams: [],
            clearCanvasItems: mockClearCanvasItems,
            addEmptyGroup: mockAddEmptyGroup,
            addCanvasItem: mockAddCanvasItem
        }));

        (useUIStore as any).mockImplementation((selector: any) => selector({
            setPage: mockSetPage,
            openModal: mockOpenModal,
        }));

        (fullscreenUtils.getFullscreenElement as any).mockReturnValue(null);
    });

    it('should render all main control buttons', () => {
        render(<DynamicIsland />);

        expect(screen.getByTitle('新增視窗')).toBeInTheDocument();
        expect(screen.getByTitle('布局設定')).toBeInTheDocument();
        expect(screen.getByTitle('媒體控制')).toBeInTheDocument();
        expect(screen.getByTitle('收藏清單')).toBeInTheDocument();
        expect(screen.getByTitle('一鍵收藏當前畫布')).toBeInTheDocument();
        expect(screen.getByTitle('全螢幕')).toBeInTheDocument();
        expect(screen.getByTitle('清空畫面')).toBeInTheDocument();
        expect(screen.getByTitle('返回首頁')).toBeInTheDocument();
        expect(screen.getByTitle('設定')).toBeInTheDocument();
    });

    it('should open dropdown and add empty group', async () => {
        render(<DynamicIsland />);

        const addBtn = screen.getByTitle('新增視窗');
        fireEvent.click(addBtn); // Opens dropdown

        // Dropdown content might be rendered in a portal. 
        // We look for text '新增組合'.
        const addGroupItem = await screen.findByText('新增組合');
        fireEvent.click(addGroupItem);

        expect(mockAddEmptyGroup).toHaveBeenCalled();
    });

    it('should toggle fullscreen', async () => {
        render(<DynamicIsland />);

        const fsBtn = screen.getByTitle('全螢幕');
        fireEvent.click(fsBtn);

        expect(fullscreenUtils.requestFullscreen).toHaveBeenCalled();
    });

    it('should show clear canvas confirmation dialog', async () => {
        render(<DynamicIsland />);

        const clearBtn = screen.getByTitle('清空畫面');
        fireEvent.click(clearBtn);

        // Wait for dialog
        expect(await screen.findByText('確定要清空所有視窗嗎？')).toBeInTheDocument();

        const confirmBtn = screen.getByText('確定清空');
        fireEvent.click(confirmBtn);

        // Dialog close animation might delay call? No, usually synchonous in test unless animation mocked.
        // Alert Dialog Action onClick calls the function.
        expect(mockClearCanvasItems).toHaveBeenCalled();
    });

    it('should perform quick save', async () => {
        // Mock existing streams
        (useStreamStore as any).mockImplementation((selector: any) => selector({
            streams: [{ id: 1, platform: 'twitch', channelId: 'shroud' }],
            clearCanvasItems: mockClearCanvasItems,
            addEmptyGroup: mockAddEmptyGroup,
            addCanvasItem: mockAddCanvasItem
        }));

        render(<DynamicIsland />);
        const saveBtn = screen.getByTitle('一鍵收藏當前畫布');
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(favoritesService.addFavorite).toHaveBeenCalled();
        });
    });
});
