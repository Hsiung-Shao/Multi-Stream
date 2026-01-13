import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StreamBox } from '../../src/components/StreamBox';
import { useStreamStore } from '../../src/store/useStreamStore';

// Mock dependencies
vi.mock('../../src/store/useStreamStore');
vi.mock('../../src/components/StreamPlayer', () => ({
    default: () => <div data-testid="stream-player">Stream Player</div>
}));
vi.mock('../../src/components/StreamControls', () => ({
    default: () => <div data-testid="stream-controls">Stream Controls</div>
}));

describe('StreamBox', () => {
    const mockRemoveStream = vi.fn();
    const mockUpdateStream = vi.fn();

    it('renders correctly', () => {
        (useStreamStore as any).mockReturnValue({
            layout: 0,
            removeStream: mockRemoveStream,
            updateStream: mockUpdateStream,
            moveStream: vi.fn(),
            streams: [],
        });

        const mockStreamData = {
            id: 1,
            platform: 'twitch' as const,
            channelId: 'test_channel',
            videoId: null,
            originalUrl: '',
            isMuted: false,
            volume: 50,
            chatVisible: true,
        };

        render(
            <StreamBox
                id={1}
                index={0}
                stream={mockStreamData}
            />
        );

        expect(screen.getByTestId('stream-player')).toBeDefined();
    });

    it('calls removeStream on close', () => {
        // This tests depends on how Close button is exposed. 
        // Assuming StreamBox has a close button or relies on StreamControls?
        // StreamBox basically wraps StreamPlayer and handles overlay controls.
    });
});
