import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamBox } from '../../src/components/StreamBox';
import type { StreamData } from '../../src/utils/streamUtils';

// StreamBox 的 props 是 streamData + 一組回呼,不讀任何 store。
// 子元件各自有測試(StreamIframe / StreamChat / WindowHeader),這裡只驗證 StreamBox 的接線:
// 把 streamData 傳給播放器、把工具列的動作轉發成 onRemove / onReload / onToggleChat(id)。
vi.mock('../../src/components/Canvas/WindowParts/StreamIframe', () => ({
    StreamIframe: ({ streamData, volume, isMuted }: { streamData: StreamData; volume: number; isMuted: boolean }) => (
        <div data-testid="stream-iframe" data-channel={streamData.channelId} data-volume={volume} data-muted={String(isMuted)} />
    ),
}));
vi.mock('../../src/components/StreamChat', () => ({
    StreamChat: () => <div data-testid="stream-chat" />,
}));
vi.mock('../../src/components/Canvas/WindowParts/WindowHeader', () => ({
    WindowHeader: ({ title, onRemove, onReload, onToggleChat }: {
        title: string; onRemove: () => void; onReload: () => void; onToggleChat: () => void;
    }) => (
        <div data-testid="window-header">
            <span>{title}</span>
            <button onClick={onRemove}>remove</button>
            <button onClick={onReload}>reload</button>
            <button onClick={onToggleChat}>toggle-chat</button>
        </div>
    ),
}));
vi.mock('../../src/hooks/useChatResizer', () => ({ useChatResizer: vi.fn() }));

const streamData: StreamData = {
    id: 7,
    platform: 'twitch',
    channelId: 'test_channel',
    videoId: '',
    originalUrl: 'https://twitch.tv/test_channel',
    volume: 50,
    chatVisible: true,
    isMuted: false,
};

const renderBox = (overrides: Partial<React.ComponentProps<typeof StreamBox>> = {}) => {
    const props = {
        streamData,
        theme: 'dark' as const,
        onRemove: vi.fn(),
        onReload: vi.fn(),
        onToggleChat: vi.fn(),
        onSeparateChat: vi.fn(),
        ...overrides,
    };
    const utils = render(<StreamBox {...props} />);
    return { ...utils, props };
};

describe('StreamBox', () => {
    beforeEach(() => vi.clearAllMocks());

    it('renders the player for the given stream', () => {
        renderBox();
        const iframe = screen.getByTestId('stream-iframe');
        expect(iframe).toHaveAttribute('data-channel', 'test_channel');
        expect(screen.getByTestId('window-header')).toBeInTheDocument();
        expect(screen.getByText('#1')).toBeInTheDocument();
    });

    it('numbers the window from streamIndex', () => {
        renderBox({ streamIndex: 2 });
        expect(screen.getByText('#3')).toBeInTheDocument();
    });

    it('forwards toolbar actions with the stream id', () => {
        const { props } = renderBox();
        fireEvent.click(screen.getByText('remove'));
        fireEvent.click(screen.getByText('reload'));
        fireEvent.click(screen.getByText('toggle-chat'));
        expect(props.onRemove).toHaveBeenCalledWith(7);
        expect(props.onReload).toHaveBeenCalledWith(7);
        expect(props.onToggleChat).toHaveBeenCalledWith(7);
    });

    it('scales local volume by masterVolume and mutes when master is muted', () => {
        const { unmount } = renderBox({ masterVolume: 50 });
        // 50% × 50 = 25
        expect(screen.getByTestId('stream-iframe')).toHaveAttribute('data-volume', '25');
        expect(screen.getByTestId('stream-iframe')).toHaveAttribute('data-muted', 'false');
        unmount();

        renderBox({ isMasterMuted: true });
        expect(screen.getByTestId('stream-iframe')).toHaveAttribute('data-volume', '0');
        expect(screen.getByTestId('stream-iframe')).toHaveAttribute('data-muted', 'true');
    });
});
