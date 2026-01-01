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
            layout: 'grid-2',
            chatLayout: 'none',
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

    it('should add a valid Twitch stream', async () => {
        const url = 'https://www.twitch.tv/shroud';

        const result = await useStreamStore.getState().addStream(url);

        expect(result.success).toBe(true);
        expect(useStreamStore.getState().streams).toHaveLength(1);
        expect(useStreamStore.getState().streams[0].platform).toBe('twitch');
        expect(useStreamStore.getState().streams[0].channelId).toBe('shroud');
    });

    it('should fail with invalid URL', async () => {
        const url = 'https://example.com/foo';
        const result = await useStreamStore.getState().addStream(url);

        expect(result.success).toBe(false);
        expect(useStreamStore.getState().streams).toHaveLength(0);
    });

    it('should search channel if not URL', async () => {
        const query = 'shroud';
        (window as any).twitchApi.searchChannels.mockResolvedValue([
            { url: 'https://www.twitch.tv/shroud', display_name: 'Shroud' }
        ]);

        const result = await useStreamStore.getState().addStream(query);

        expect(apiLoader.loadTwitchDataApi).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(useStreamStore.getState().streams[0].channelId).toBe('shroud');
        expect(useStreamStore.getState().streams[0].displayName).toBe('Shroud');
    });

    it('should remove stream', async () => {
        // Manually set state
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

        // Move index 0 (id:1) to index 2 (end) -> [2, 3, 1]
        useStreamStore.getState().moveStream(0, 2);

        const streams = useStreamStore.getState().streams;
        expect(streams[0].id).toBe(2);
        expect(streams[1].id).toBe(3);
        expect(streams[2].id).toBe(1);
    });
});
