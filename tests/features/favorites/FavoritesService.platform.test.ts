// 收藏平台判定與 Twitch login 正規化：
// 1. 只輸入名稱 + 選平台 → 要存成對應平台（原本一律存成 'other'，開台偵測略過）
// 2. Twitch 網址含大寫 → channelId 存小寫、重複判斷不分大小寫
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FavoritesService } from '../../../src/features/favorites/FavoritesService';
import { buildFavoriteUrl } from '../../../src/features/favorites/favoriteInput';

vi.mock('../../../src/features/backup', () => ({ backupService: { scheduleBackup: vi.fn() } }));
vi.mock('../../../src/utils/youtubeApi', () => ({
    youtubeApi: {
        resolveChannelByHandle: vi.fn().mockResolvedValue(null),
        checkChannelLiveStatus: vi.fn().mockResolvedValue({ isLive: false }),
        getChannelTitleFromChannelId: vi.fn().mockResolvedValue(null),
    },
}));
vi.mock('../../../src/features/youtube/YouTubeChannelRepository', () => ({
    getCachedChannel: vi.fn().mockResolvedValue(null),
    cacheChannelIfAbsent: vi.fn().mockResolvedValue(undefined),
}));

let list: any[] = [];
let service: FavoritesService;

beforeEach(() => {
    list = [];
    service = new FavoritesService();
    (service as any).favRepo = {
        getList: () => list,
        add: (item: any) => { list.push(item); },
    };
});

describe('只輸入名稱 + 選平台（AddFavoriteDialog → addFavorite）', () => {
    it('選 Twitch → 存成 twitch 平台，有 channelId 可做開台偵測', async () => {
        const result = await service.addFavorite(buildFavoriteUrl('Shroud', 'twitch'));
        expect(result.item?.platform).toBe('twitch');
        expect(result.item?.channelId).toBe('shroud');
    });

    it('選 YouTube → 存成 youtube 平台（不再是 other）', async () => {
        const result = await service.addFavorite(buildFavoriteUrl('@somechannel', 'youtube'));
        expect(result.item?.platform).toBe('youtube');
    });

    it('沒選平台的裸名稱維持原行為（other）', async () => {
        const result = await service.addFavorite(buildFavoriteUrl('somename', null));
        expect(result.item?.platform).toBe('other');
    });
});

describe('Twitch login 大小寫', () => {
    it('網址含大寫 → channelId 存小寫', async () => {
        const result = await service.addFavorite('https://www.twitch.tv/Shroud', 'Shroud');
        expect(result.item?.channelId).toBe('shroud');
    });

    it('大小寫不同視為同一台（重複）', async () => {
        list.push({ id: 'a', url: 'https://twitch.tv/shroud', platform: 'twitch', channelId: 'shroud' });
        expect(service.isDuplicate('https://www.twitch.tv/Shroud')).toBe(true);
        list[0].channelId = 'Shroud';
        expect(service.isDuplicate('https://www.twitch.tv/shroud')).toBe(true);
    });
});
