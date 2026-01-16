/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStreamStore } from '../../src/store/useStreamStore';
import { apiLoader } from '../../src/utils/apiLoader';
import { favoritesService } from '../../src/features/favorites/FavoritesService';

// Mock dependencies
vi.mock('../../src/utils/apiLoader', () => ({
    apiLoader: {
        loadTwitchDataApi: vi.fn(),
        loadYouTubeDataApi: vi.fn(),
    },
}));

vi.mock('../../src/features/favorites/FavoritesService', () => ({
    favoritesService: {
        getFavorites: vi.fn(() => []),
    },
}));

describe('useStreamStore', () => {
    beforeEach(() => {
        // Reset Store
        useStreamStore.setState({
            streams: [],
            layout: 2,
            chatLayout: 'none',
            canvasItems: []
        });

        // Reset Globals
        (window as any).streamCount = 0;
        (window as any).streamData = {};
        (window as any).twitchApi = {
            searchChannels: vi.fn(),
        };
        (window as any).youtubeApiUtils = {
            getChannelIdFromVideoId: vi.fn(),
        };
    });

    describe('Stream Management', () => {
        it('should add a valid Twitch stream', async () => {
            const url = 'https://www.twitch.tv/shroud';
            const result = await useStreamStore.getState().addStream(url);

            expect(result.success).toBe(true);
            expect(useStreamStore.getState().streams).toHaveLength(1);
            const stream = useStreamStore.getState().streams[0];
            expect(stream.platform).toBe('twitch');
            expect(stream.channelId).toBe('shroud');
        });

        it('should fail with invalid URL', async () => {
            const url = 'https://example.com/foo';
            const result = await useStreamStore.getState().addStream(url);

            expect(result.success).toBe(false);
            expect(useStreamStore.getState().streams).toHaveLength(0);
        });

        it('should remove stream', async () => {
            useStreamStore.setState({
                streams: [
                    { id: 1, platform: 'twitch', channelId: 'a', videoId: '', originalUrl: '', volume: 100, chatVisible: false, isMuted: false },
                    { id: 2, platform: 'twitch', channelId: 'b', videoId: '', originalUrl: '', volume: 100, chatVisible: false, isMuted: false }
                ]
            });

            useStreamStore.getState().removeStream(1);
            expect(useStreamStore.getState().streams).toHaveLength(1);
            expect(useStreamStore.getState().streams[0].id).toBe(2);
        });

        it('should move stream', () => {
            useStreamStore.setState({
                streams: [
                    { id: 1, platform: 'twitch', channelId: '1', videoId: '', originalUrl: '', volume: 0, chatVisible: false, isMuted: false },
                    { id: 2, platform: 'twitch', channelId: '2', videoId: '', originalUrl: '', volume: 0, chatVisible: false, isMuted: false },
                    { id: 3, platform: 'twitch', channelId: '3', videoId: '', originalUrl: '', volume: 0, chatVisible: false, isMuted: false }
                ]
            });

            useStreamStore.getState().moveStream(0, 2);
            const streams = useStreamStore.getState().streams;
            expect(streams[0].id).toBe(2);
            expect(streams[1].id).toBe(3);
            expect(streams[2].id).toBe(1);
        });

        it('should clear canvas items', () => {
            useStreamStore.setState({
                streams: [
                    { id: 1, platform: 'twitch', channelId: '1', videoId: '', originalUrl: '', volume: 0, chatVisible: false, isMuted: false }
                ],
                canvasItems: [
                    { i: '1', type: 'stream', contentId: 1, layout: { x: 0, y: 0, w: 6, h: 6 } }
                ]
            });

            useStreamStore.getState().clearCanvasItems();
            expect(useStreamStore.getState().streams).toHaveLength(0);
            expect(useStreamStore.getState().canvasItems).toHaveLength(0);
        });
    });

    describe('Media Controls (Individual)', () => {
        // Global Volume is in useUIStore now

        it('should update individual stream volume', () => {
            useStreamStore.setState({
                streams: [
                    { id: 1, platform: 'twitch', channelId: '1', videoId: '', originalUrl: '', volume: 50, chatVisible: false, isMuted: false }
                ]
            });

            useStreamStore.getState().updateStream(1, { volume: 100 });
            expect(useStreamStore.getState().streams[0].volume).toBe(100);
        });
    });

    describe('Layout Management', () => {
        it('should change layout', () => {
            useStreamStore.getState().setLayout(4); // Use number for layout type according to updated interface/state?
            // State initial was 2. Use 4.
            expect(useStreamStore.getState().layout).toBe(4);
        });

        it('should change chat layout', () => {
            useStreamStore.getState().setChatLayout('sidebar');
            expect(useStreamStore.getState().chatLayout).toBe('sidebar');
        });
    });
});
