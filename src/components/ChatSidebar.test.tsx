import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChatSidebar } from './ChatSidebar';
import type { StreamData } from '../utils/streamUtils';

// Mock dependencies
vi.mock('./StreamChat', () => ({
    StreamChat: () => <div data-testid="stream-chat">Stream Chat Content</div>,
}));

vi.mock('../utils/chatLayoutUtils', () => ({
    getChatLayoutConfig: (type: string) => {
        if (type === 'none') {
            return { grid: { rows: 0, cols: 0 }, positionKeys: [], videoAreaWidth: 100, chatAreaWidth: 0 };
        }
        if (type === 'single') {
            return { grid: { rows: 1, cols: 1 }, positionKeys: ['position1'], videoAreaWidth: 80, chatAreaWidth: 20 };
        }
        return { grid: { rows: 1, cols: 1 }, positionKeys: ['position1'], videoAreaWidth: 80, chatAreaWidth: 20 };
    },
    CHAT_LAYOUT_CONFIGS: {
        single: { positionKeys: ['position1'] },
        dual: { positionKeys: ['position1', 'position2'] }
    }
}));


const mockStreams: StreamData[] = [
    { id: 1, platform: 'twitch', channelId: 'c1', videoId: '', originalUrl: '', volume: 100, chatVisible: true, isMuted: false, displayName: 'Channel 1' },
    { id: 2, platform: 'youtube', channelId: '', videoId: 'v1', originalUrl: '', volume: 100, chatVisible: true, isMuted: false, displayName: 'Channel 2' }
];

const defaultProps = {
    theme: 'light' as const,
    chatLayoutType: 'single' as const,
    streams: mockStreams,
    navbarHeight: 64
};

describe('ChatSidebar', () => {
    it('renders nothing when chatLayoutType is none', () => {
        const { container } = render(<ChatSidebar {...defaultProps} chatLayoutType="none" />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders sidebar when layout is single', () => {
        render(<ChatSidebar {...defaultProps} />);
        // Should render a select for the first position
        expect(screen.getByText('選擇串流...')).toBeInTheDocument();
    });
});
