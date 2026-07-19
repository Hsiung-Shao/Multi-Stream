import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasStreamContent } from '../../src/components/Pages/CanvasStreamContent';
import type { WindowRenderProps } from '../../src/components/Canvas';
import type { StreamData } from '../../src/utils/streamUtils';

vi.mock('../../src/components/StreamChat', () => ({
    StreamChat: () => <div data-testid="stream-chat">Stream Chat Content</div>,
}));

vi.mock('../../src/components/Canvas/WindowParts/StreamIframe', () => ({
    StreamIframe: () => <div data-testid="stream-iframe">Stream Iframe Content</div>,
}));

const stream: StreamData = {
    id: 1,
    platform: 'twitch',
    channelId: 'test_channel',
    videoId: '',
    originalUrl: 'https://twitch.tv/test_channel',
    volume: 100,
    chatVisible: true,
    isMuted: false,
    displayName: 'Test Channel',
};

const renderProps: WindowRenderProps = {
    dragHandlers: {
        onPointerDown: vi.fn(),
        onPointerMove: vi.fn(),
        onPointerUp: vi.fn(),
        onPointerCancel: vi.fn(),
    },
    isDragging: false,
    isResizing: false,
    gridW: 4,
    gridH: 6,
    onRemove: vi.fn(),
};

describe('CanvasStreamContent', () => {
    it('does not overlay the toolbar on top of chat iframe content', () => {
        render(<CanvasStreamContent stream={stream} windowType="chat" renderProps={renderProps} />);

        const toolbar = screen.getByText('Test Channel').closest('[data-window-toolbar]');

        expect(screen.getByTestId('stream-chat')).toBeInTheDocument();
        expect(toolbar).toHaveAttribute('data-window-toolbar', 'chat');
        expect(toolbar).not.toHaveClass('absolute');
        expect(toolbar).toHaveClass('relative');
    });

    it('keeps stream controls floating over video windows', () => {
        render(<CanvasStreamContent stream={stream} windowType="stream" renderProps={renderProps} />);

        const toolbar = screen.getByText('Test Channel').closest('[data-window-toolbar]');

        expect(screen.getByTestId('stream-iframe')).toBeInTheDocument();
        expect(toolbar).toHaveAttribute('data-window-toolbar', 'stream');
        expect(toolbar).toHaveClass('absolute');
    });
});
