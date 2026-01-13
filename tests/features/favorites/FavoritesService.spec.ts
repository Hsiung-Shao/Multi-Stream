import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FavoritesService } from '../../../src/features/favorites/FavoritesService';
import { FavoritesRepository } from '../../../src/features/favorites/FavoritesRepository';
import { CategoryRepository } from '../../../src/features/favorites/CategoryRepository';
import { backupService } from '../../../src/features/backup';

// Mock dependencies
vi.mock('../../../src/features/favorites/FavoritesRepository');
vi.mock('../../../src/features/favorites/CategoryRepository');

// Mock backupService
vi.mock('../../../src/features/backup', () => ({
    backupService: {
        scheduleBackup: vi.fn(),
    }
}));

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

describe('FavoritesService Full Coverage', () => {
    let service: FavoritesService;
    let mockFavRepo: any;
    let mockCatRepo: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup mock implementations
        FavoritesRepository.prototype.getList = vi.fn().mockReturnValue([]);
        FavoritesRepository.prototype.add = vi.fn();
        FavoritesRepository.prototype.update = vi.fn().mockReturnValue(true);
        FavoritesRepository.prototype.remove = vi.fn().mockReturnValue({ id: '1', name: 'Test' });
        FavoritesRepository.prototype.saveList = vi.fn();
        FavoritesRepository.prototype.uncategorize = vi.fn();

        CategoryRepository.prototype.getList = vi.fn().mockReturnValue([]);
        CategoryRepository.prototype.add = vi.fn().mockReturnValue({ success: true, id: 'c1' });
        CategoryRepository.prototype.update = vi.fn().mockReturnValue(true);
        CategoryRepository.prototype.remove = vi.fn().mockReturnValue({ success: true });
        CategoryRepository.prototype.saveList = vi.fn();

        mockFavRepo = FavoritesRepository.prototype;
        mockCatRepo = CategoryRepository.prototype;

        service = new FavoritesService();
        // Inject mocks (private access)
        (service as any).favRepo = new FavoritesRepository();
        (service as any).catRepo = new CategoryRepository();
    });

    // --- Favorite CRUD ---
    describe('Favorites CRUD', () => {
        it('should add a favorite', async () => {
            const result = await service.addFavorite('https://twitch.tv/tests', 'Test');
            expect(result.success).toBe(true);
            expect(backupService.scheduleBackup).toHaveBeenCalled();
            expect(window.dispatchEvent).toHaveBeenCalledWith(expect.any(CustomEvent));
        });

        it('should update a favorite', () => {
            // Mock exist
            vi.spyOn((service as any).favRepo, 'getList').mockReturnValue([{ id: '1', name: 'Old' }]);

            const result = service.updateFavorite('1', { name: 'New' });
            expect(result.success).toBe(true);
            expect(backupService.scheduleBackup).toHaveBeenCalled();
        });

        it('should remove a favorite', () => {
            const result = service.removeFavorite('1');
            expect(result.success).toBe(true);
            expect(backupService.scheduleBackup).toHaveBeenCalled();
        });

        it('should save favorites list (Import/Bulk)', () => {
            const list: any[] = [{ id: '1', name: 'Imp' }];
            service.saveFavorites(list);
            expect(mockFavRepo.saveList).toHaveBeenCalledWith(list);
            // Verify event emission
            expect(window.dispatchEvent).toHaveBeenCalled();
        });
    });

    // --- Category CRUD ---
    describe('Category CRUD', () => {
        it('should add a category', () => {
            service.addCategory('Cat1');
            expect(mockCatRepo.add).toHaveBeenCalledWith('Cat1');
            expect(backupService.scheduleBackup).toHaveBeenCalled();
        });

        it('should update a category', () => {
            service.updateCategory('c1', 'CatUpdated');
            expect(mockCatRepo.update).toHaveBeenCalledWith('c1', 'CatUpdated');
            expect(backupService.scheduleBackup).toHaveBeenCalled();
        });

        it('should remove a category and cascade uncategorize', () => {
            service.removeCategory('c1');
            expect(mockCatRepo.remove).toHaveBeenCalledWith('c1');
            expect(mockFavRepo.uncategorize).toHaveBeenCalledWith('c1');
            expect(backupService.scheduleBackup).toHaveBeenCalled();
        });

        it('should save categories list', () => {
            const list: any[] = [{ id: 'c1', name: 'C' }];
            service.saveCategories(list);
            expect(mockCatRepo.saveList).toHaveBeenCalledWith(list);
            expect(backupService.scheduleBackup).toHaveBeenCalled();
        });
    });

    // --- Duplicate Logic (Retaining original tests) ---
    describe('Duplicate Detection', () => {
        it('should detect boolean duplicate status', () => {
            vi.spyOn((service as any).favRepo, 'getList').mockReturnValue([{ url: 'https://twitch.tv/dup', platform: 'twitch' }]);
            expect(service.isDuplicate('https://twitch.tv/dup')).toBe(true);
            expect(service.isDuplicate('https://twitch.tv/ok')).toBe(false);
        });
    });
});
