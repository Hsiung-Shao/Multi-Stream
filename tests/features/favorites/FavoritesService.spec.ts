import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FavoritesService } from '../../../src/features/favorites/FavoritesService';
import { FavoritesRepository } from '../../../src/features/favorites/FavoritesRepository';
import { CategoryRepository } from '../../../src/features/favorites/CategoryRepository';

// Mock dependencies
vi.mock('../../../src/features/favorites/FavoritesRepository');
vi.mock('../../../src/features/favorites/CategoryRepository');

// Mock youtubeApi
vi.mock('../../../src/utils/youtubeApi', () => ({
    youtubeApi: {
        getChannelIdFromVideoId: vi.fn().mockResolvedValue('UC123'),
        getChannelTitleFromChannelId: vi.fn().mockResolvedValue('Test Channel'),
        checkChannelLiveStatus: vi.fn().mockResolvedValue({ isLive: false })
    }
}));

// Mock window for event tests
global.window = {
    dispatchEvent: vi.fn(),
    CustomEvent: class CustomEvent {
        type: string;
        detail: any;
        constructor(type: string, detail: any) {
            this.type = type;
            this.detail = detail.detail;
        }
    }
} as any;

describe('FavoritesService Parity', () => {
    let service: FavoritesService;
    let mockFavRepo: any;
    let mockCatRepo: any;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Setup mock implementations
        FavoritesRepository.prototype.getList = vi.fn().mockReturnValue([]);
        FavoritesRepository.prototype.add = vi.fn();
        FavoritesRepository.prototype.update = vi.fn().mockReturnValue(true);
        FavoritesRepository.prototype.remove = vi.fn().mockReturnValue({ id: '1', name: 'Test' });

        mockFavRepo = FavoritesRepository.prototype;
        mockCatRepo = CategoryRepository.prototype;

        service = new FavoritesService();
        // Inject mocks
        (service as any).favRepo = new FavoritesRepository();
        (service as any).catRepo = new CategoryRepository();
    });

    describe('addFavorite (Legacy Parity)', () => {
        it('should correctly parse Twitch URL', async () => {
            const url = 'https://www.twitch.tv/shroud';

            // Mock getList to return empty so no duplicate
            vi.spyOn((service as any).favRepo, 'getList').mockReturnValue([]);

            const result = await service.addFavorite(url);

            expect(result.success).toBe(true);
            expect(result.item).toBeDefined();
            expect(result.item?.platform).toBe('twitch');
            expect(result.item?.channelId).toBe('shroud');
            expect(result.item?.name).toBe('shroud'); // Default name logic
        });

        it('should correctly parse YouTube URL (v param)', async () => {
            const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

            vi.spyOn((service as any).favRepo, 'getList').mockReturnValue([]);

            const result = await service.addFavorite(url);

            expect(result.success).toBe(true);
            expect(result.item?.platform).toBe('youtube');
            expect(result.item?.videoId).toBe('dQw4w9WgXcQ');
            // Mocked implementation returns 'UC123'
            expect(result.item?.channelId).toBe('UC123');
            // Normalized URL expectation
            expect(result.item?.url).toBe('https://www.youtube.com/channel/UC123/live');
        });

        it('should detect duplicates by exact URL', async () => {
            const url = 'https://twitch.tv/duplicate';

            // Mock existing item
            vi.spyOn((service as any).favRepo, 'getList').mockReturnValue([
                { id: '1', url: 'https://twitch.tv/duplicate', platform: 'twitch', addedAt: '' }
            ]);

            const result = await service.addFavorite(url);

            expect(result.success).toBe(false);
            expect(result.message).toBe('streamAlreadyInFavorites');
        });

        it('should detect Twitch duplicates by channelId', async () => {
            const url = 'https://www.twitch.tv/shroud';

            // Mock existing item with same channelId but different URL formatting potentially
            vi.spyOn((service as any).favRepo, 'getList').mockReturnValue([
                { id: '1', url: 'https://twitch.tv/shroud', platform: 'twitch', channelId: 'shroud', addedAt: '' }
            ]);

            const result = await service.addFavorite(url);

            expect(result.success).toBe(false);
            expect(result.message).toBe('streamAlreadyInFavorites');
        });

        it('should detect YouTube duplicates by channelId if provided', async () => {
            // Mock scenario where user adds by URL but we know it matches a channelId
            const url = 'https://youtube.com/channel/UC123';

            vi.spyOn((service as any).favRepo, 'getList').mockReturnValue([
                { id: '1', url: '...', platform: 'youtube', channelId: 'UC123', addedAt: '' }
            ]);

            // Logic in new service relies on providedChannelId OR RegEx match.
            // Test RegEx match capability
            const result = await service.addFavorite(url);

            // The service implementation of duplicate check regex:
            // urlChannelMatch = url.match(...); itemChannelMatch = item.url.match(...)
            // This needs to hold true.
            expect(result.success).toBe(false);
        });
    });

    describe('Event Emission', () => {
        it('should dispatch favoritesUpdated event on add', async () => {
            const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
            vi.spyOn((service as any).favRepo, 'getList').mockReturnValue([]);

            await service.addFavorite('https://twitch.tv/new');

            expect(dispatchSpy).toHaveBeenCalled();
            const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
            expect(event.type).toBe('favoritesUpdated');
            expect(event.detail.action).toBe('add');
        });
    });
});
