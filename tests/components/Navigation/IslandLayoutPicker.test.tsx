import { render, screen, fireEvent } from '@testing-library/react';
import { IslandLayoutPicker } from '../../../src/components/Navigation/IslandLayoutPicker';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStreamStore } from '../../../src/store/useStreamStore';
import { layoutTemplates } from '../../../src/utils/layoutPresets';

vi.mock('../../../src/store/useStreamStore');

// t 回傳 key 本身,斷言就對著 key 寫。
// initReactI18next 必須存在:元件的 import 鏈會走到 src/i18n/i18n.ts,那裡 .use(initReactI18next)。
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
    initReactI18next: { type: '3rdParty', init: () => {} },
}));

describe('IslandLayoutPicker', () => {
    const mockApplyTemplate = vi.fn();
    const mockApplyCustom = vi.fn();
    const mockCustomLayouts = [
        { id: 'c1', name: 'Custom 1', slots: [], createdAt: 1 },
        { id: 'c2', name: 'Custom 2', slots: [], createdAt: 2 },
    ];

    const mockStore = (customLayouts = mockCustomLayouts) => {
        (useStreamStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (s: unknown) => unknown) => selector({
            customLayouts,
            applyTemplateLayout: mockApplyTemplate,
            applyCustomLayout: mockApplyCustom,
            saveCustomLayout: vi.fn(),
        }));
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockStore();
    });

    it('renders collapsed', () => {
        const { container } = render(
            <IslandLayoutPicker isExpanded={false} onOpenSettings={vi.fn()} />
        );
        expect(container.firstChild).toHaveClass('opacity-0');
        expect(container.firstChild).toHaveClass('pointer-events-none');
    });

    it('renders expanded', () => {
        const { container } = render(
            <IslandLayoutPicker isExpanded={true} onOpenSettings={vi.fn()} />
        );
        expect(container.firstChild).toHaveClass('opacity-100');
    });

    it('inline variant drops the popover positioning', () => {
        const { container } = render(
            <IslandLayoutPicker isExpanded={false} onOpenSettings={vi.fn()} variant="inline" />
        );
        expect(container.firstChild).not.toHaveClass('absolute');
        expect(container.firstChild).not.toHaveClass('opacity-0');
    });

    it('switches tabs', () => {
        render(<IslandLayoutPicker isExpanded={true} onOpenSettings={vi.fn()} />);
        const video = screen.getByText('layout.tab_video');
        const chat = screen.getByText('layout.tab_chat');
        const custom = screen.getByText('layout.tab_custom');

        // 非作用中的分頁帶 text-gray-400,作用中的沒有(作用中改用 inline accent style)
        expect(video).not.toHaveClass('text-gray-400');
        expect(chat).toHaveClass('text-gray-400');

        fireEvent.click(chat);
        expect(chat).not.toHaveClass('text-gray-400');
        expect(video).toHaveClass('text-gray-400');

        fireEvent.click(custom);
        expect(custom).not.toHaveClass('text-gray-400');
        expect(chat).toHaveClass('text-gray-400');
    });

    it('lists video templates and applies the clicked one', () => {
        render(<IslandLayoutPicker isExpanded={true} onOpenSettings={vi.fn()} />);
        const videoTemplates = layoutTemplates.filter(t => t.type === 'video_only');
        expect(videoTemplates.length).toBeGreaterThan(0);

        for (const tpl of videoTemplates) {
            expect(screen.getByTitle(tpl.nameKey)).toBeInTheDocument();
        }
        fireEvent.click(screen.getByTitle(videoTemplates[0].nameKey));
        expect(mockApplyTemplate).toHaveBeenCalledWith(videoTemplates[0].id);
    });

    it('lists chat templates on the chat tab', () => {
        render(<IslandLayoutPicker isExpanded={true} onOpenSettings={vi.fn()} />);
        fireEvent.click(screen.getByText('layout.tab_chat'));
        const chatTemplates = layoutTemplates.filter(t => t.type === 'with_chat');
        expect(chatTemplates.length).toBeGreaterThan(0);
        fireEvent.click(screen.getByTitle(chatTemplates[0].nameKey));
        expect(mockApplyTemplate).toHaveBeenCalledWith(chatTemplates[0].id);
    });

    it('lists and applies custom layouts', () => {
        render(<IslandLayoutPicker isExpanded={true} onOpenSettings={vi.fn()} />);
        fireEvent.click(screen.getByText('layout.tab_custom'));

        expect(screen.getByText('Custom 1')).toBeInTheDocument();
        expect(screen.getByText('Custom 2')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument(); // 數量徽章

        fireEvent.click(screen.getByText('Custom 1'));
        expect(mockApplyCustom).toHaveBeenCalledWith('c1');
    });

    it('shows the empty state when there are no custom layouts', () => {
        mockStore([]);
        render(<IslandLayoutPicker isExpanded={true} onOpenSettings={vi.fn()} />);
        fireEvent.click(screen.getByText('layout.tab_custom'));
        expect(screen.getByText('尚無自定布局')).toBeInTheDocument();
    });

    it('opens the save dialog and reports it upward', () => {
        const onSaveDialogOpenChange = vi.fn();
        render(
            <IslandLayoutPicker isExpanded={true} onOpenSettings={vi.fn()} onSaveDialogOpenChange={onSaveDialogOpenChange} />
        );
        fireEvent.click(screen.getByText('layout.tab_custom'));
        fireEvent.click(screen.getByText('common.save_layout'));

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('儲存目前布局')).toBeInTheDocument();
        // 動態島靠這個訊號在 dialog 開啟期間維持釘住
        expect(onSaveDialogOpenChange).toHaveBeenCalledWith(true);
    });

    it('calls onOpenSettings from the manage button', () => {
        const onOpenSettings = vi.fn();
        render(<IslandLayoutPicker isExpanded={true} onOpenSettings={onOpenSettings} />);
        fireEvent.click(screen.getByText('common.manage'));
        expect(onOpenSettings).toHaveBeenCalled();
    });
});
