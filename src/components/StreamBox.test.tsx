import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StreamBox } from './StreamBox';
import type { StreamData } from '../utils/streamUtils';

// Mock child components
vi.mock('./Canvas/WindowParts/StreamIframe', () => ({
    StreamIframe: () => <div data-testid="stream-iframe">Stream Iframe</div>,
}));

vi.mock('./Canvas/WindowParts/WindowHeader', () => ({
    WindowHeader: (props: any) => <div data-testid="window-header">{props.title}</div>,
}));

vi.mock('./StreamChat', () => ({
    StreamChat: () => <div data-testid="stream-chat">Stream Chat</div>,
}));

vi.mock('../hooks/useChatResizer', () => ({
    useChatResizer: () => { },
}));

const mockStreamData: StreamData = {
    id: 123,
    platform: 'twitch',
    channelId: 'testchannel',
    isMuted: false,
    volume: 50,
    chatVisible: true,
};

const defaultProps = {
    streamData: mockStreamData,
    theme: 'light' as const,
    onRemove: vi.fn(),
    onReload: vi.fn(),
    onToggleChat: vi.fn(),
    onSeparateChat: vi.fn(),
    onVolumeChange: vi.fn(),
    streamIndex: 0,
};

describe('StreamBox', () => {
    it('renders successfully', () => {
        render(<StreamBox {...defaultProps} />);

        // Check if header renders with correct title (index + 1)
        expect(screen.getByTestId('window-header')).toHaveTextContent('#1');

        // Check if iframe placeholder renders
        expect(screen.getByTestId('stream-iframe')).toBeInTheDocument();

        // Check if chat renders (since chatVisible is true and layout default)
        expect(screen.getByTestId('stream-chat')).toBeInTheDocument();
    });

    it('hides chat when chatVisible is false', () => {
        const props = {
            ...defaultProps,
            streamData: { ...mockStreamData, chatVisible: false },
        };
        render(<StreamBox {...props} />);

        // Chat component might still be in DOM but hidden via CSS or conditionally rendered
        // In StreamBox implementation:
        // <div className={`stream-chat ... ${streamData.chatVisible ... ? '' : 'hidden'}`}>
        // And StreamChat is inside.

        // Let's check if the container has 'hidden' class or style display none.
        // However, testing-library focuses on accessibility/visibility.
        // .toBeVisible() checks opacity/display/visibility/hidden attribute.

        // Note: StreamChat IS rendered inside the div, but the div is hidden.
        // So getByTestId('stream-chat') might return element, but it should not be visible?
        // Actually, expect(screen.getByTestId('stream-chat')).not.toBeVisible() usually works with jsdom/happy-dom if styles are computed.

        const chatElement = screen.getByTestId('stream-chat');
        // We check parent of chat element for hidden class if strict visibility check is flaky in happy-dom
        expect(chatElement.closest('.stream-chat')).toHaveClass('hidden');
    });
});
