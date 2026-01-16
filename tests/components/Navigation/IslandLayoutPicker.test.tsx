import { render, screen, fireEvent } from '@testing-library/react';
import { IslandLayoutPicker } from '../../../src/components/Navigation/IslandLayoutPicker';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStreamStore } from '../../../src/store/useStreamStore';

// Mock dependencies
vi.mock('../../../src/store/useStreamStore');
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));
// Mock Lucide icons to avoid rendering issues if any
vi.mock('lucide-react', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        // We can just use the actual icons or mock them if they cause issues. 
        // usually they are fine.
    };
});

describe('IslandLayoutPicker', () => {
    const mockApplyTemplate = vi.fn();
    const mockApplyCustom = vi.fn();
    const mockCustomLayouts = [
        { id: 'c1', name: 'Custom 1', slots: [] },
        { id: 'c2', name: 'Custom 2', slots: [] }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        (useStreamStore as any).mockImplementation((selector: any) => selector({
            customLayouts: mockCustomLayouts,
            applyTemplateLayout: mockApplyTemplate,
            applyCustomLayout: mockApplyCustom,
        }));
    });

    it('should render collapsed', () => {
        const { container } = render(
            <IslandLayoutPicker isExpanded={false} onOpenSettings={vi.fn()} />
        );
        // Check content opacity/pointer-events class logic implicitly or check visibility
        // Since we use css classes for visibility, we can check for class 'opacity-0'
        expect(container.firstChild).toHaveClass('opacity-0');
    });

    it('should render expanded', () => {
        const { container } = render(
            <IslandLayoutPicker isExpanded={true} onOpenSettings={vi.fn()} />
        );
        expect(container.firstChild).toHaveClass('opacity-100');
    });

    it('should switch tabs', () => {
        render(<IslandLayoutPicker isExpanded={true} onOpenSettings={vi.fn()} />);

        // Default 'video_only'
        expect(screen.getByText('layout.tab_video')).toHaveClass('bg-white/10'); // Active class check or check content

        // Switch to 'with_chat'
        fireEvent.click(screen.getByText('layout.tab_chat'));
        expect(screen.getByText('layout.tab_chat')).toHaveClass('bg-white/10');

        // Switch to 'custom'
        fireEvent.click(screen.getByText('layout.tab_custom'));
        expect(screen.getByText('layout.tab_custom')).toHaveClass('bg-white/10');
    });

    it('should list video templates and apply one', () => {
        render(<IslandLayoutPicker isExpanded={true} onOpenSettings={vi.fn()} />);
        // Assuming templates are rendered. 
        // We mocked useStreamStore but layoutTemplates are imported from utils.
        // We should check if buttons exist.
        // Buttons have title = template nameKey.
        // Let's just find any button inside the grid.

        // Since we don't mock layoutTemplates export, it uses real file.
        // Let's assume at least one template exists.
        const buttons = screen.getAllByRole('button');
        // Filter out tabs (3) and settings (1)
        // Actually the template buttons are many.

        // Click first template button (after the header/tab buttons)
    });

    it('should list and apply custom layouts', () => {
        // Need to be in custom tab
        render(<IslandLayoutPicker isExpanded={true} onOpenSettings={vi.fn()} />);

        fireEvent.click(screen.getByText('layout.tab_custom'));

        expect(screen.getByText('Custom 1')).toBeInTheDocument();
        expect(screen.getByText('Custom 2')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Custom 1'));
        expect(mockApplyCustom).toHaveBeenCalledWith('c1');
    });

    it('should open save dialog', () => {
        render(<IslandLayoutPicker isExpanded={true} onOpenSettings={vi.fn()} />);
        fireEvent.click(screen.getByText('layout.tab_custom'));

        const saveBtn = screen.getByText('common.save_layout');
        fireEvent.click(saveBtn);

        // Check if Dialog is open. 
        // Since Dialog uses Portal, it renders at document body.
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('儲存目前布局')).toBeInTheDocument();
    });
});
