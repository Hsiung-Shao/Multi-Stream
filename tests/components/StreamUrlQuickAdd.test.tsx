import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamUrlQuickAdd } from '../../src/components/StreamUrlQuickAdd';

const { mockAddStream, mockSetPage } = vi.hoisted(() => ({
    mockAddStream: vi.fn(),
    mockSetPage: vi.fn(),
}));

vi.mock('../../src/store/useStreamStore', () => ({
    useStreamStore: (selector: (s: { addStream: typeof mockAddStream }) => unknown) =>
        selector({ addStream: mockAddStream }),
}));
vi.mock('../../src/store/useUIStore', () => ({
    useUIStore: (selector: (s: { setPage: typeof mockSetPage }) => unknown) => selector({ setPage: mockSetPage }),
}));

describe('StreamUrlQuickAdd', () => {
    beforeEach(() => {
        mockAddStream.mockReset();
        mockSetPage.mockReset();
    });

    it('成功新增：呼叫 addStream、清空輸入、navigateToCanvas 時導向 canvas', async () => {
        mockAddStream.mockResolvedValue({ success: true, streamId: 1 });
        render(<StreamUrlQuickAdd navigateToCanvas />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'https://twitch.tv/somechannel' } });
        fireEvent.submit(input.closest('form')!);
        await waitFor(() => expect(mockAddStream).toHaveBeenCalledWith('https://twitch.tv/somechannel'));
        await waitFor(() => expect(mockSetPage).toHaveBeenCalledWith('canvas'));
        expect((input as HTMLInputElement).value).toBe('');
    });

    it('不導向模式：成功後不呼叫 setPage', async () => {
        mockAddStream.mockResolvedValue({ success: true });
        render(<StreamUrlQuickAdd />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'somechannel' } });
        fireEvent.submit(input.closest('form')!);
        await waitFor(() => expect(mockAddStream).toHaveBeenCalledWith('somechannel'));
        expect(mockSetPage).not.toHaveBeenCalled();
    });

    it('失敗：顯示 addStream 回傳的 message（role=alert），不導向', async () => {
        mockAddStream.mockResolvedValue({ success: false, message: '找不到頻道' });
        render(<StreamUrlQuickAdd navigateToCanvas />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'bad-input' } });
        fireEvent.submit(input.closest('form')!);
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('找不到頻道'));
        expect(mockSetPage).not.toHaveBeenCalled();
        expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('空輸入：submit 不呼叫 addStream', () => {
        render(<StreamUrlQuickAdd />);
        const input = screen.getByRole('textbox');
        fireEvent.submit(input.closest('form')!);
        expect(mockAddStream).not.toHaveBeenCalled();
    });
});
