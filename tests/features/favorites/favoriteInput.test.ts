// 新增收藏只輸入名稱時，送出前依選擇的平台補成完整網址（原本選了平台也沒用到，存成 'other'）
import { describe, it, expect } from 'vitest';
import { buildFavoriteUrl, needsPlatformChoice, detectFavoritePlatform } from '../../../src/features/favorites/favoriteInput';

describe('favoriteInput', () => {
    it('網址看得出平台 → 不需要選平台，原樣送出', () => {
        expect(detectFavoritePlatform('twitch.tv/shroud').platform).toBe('twitch');
        expect(needsPlatformChoice('https://www.youtube.com/@abc')).toBe(false);
        expect(buildFavoriteUrl(' https://www.twitch.tv/shroud ', 'youtube')).toBe('https://www.twitch.tv/shroud');
    });

    it('只輸入名稱 → 需要選平台', () => {
        expect(needsPlatformChoice('shroud')).toBe(true);
        expect(needsPlatformChoice('@shroud')).toBe(true);
        expect(needsPlatformChoice('')).toBe(false);
    });

    it('只輸入名稱 + 選 Twitch → twitch.tv/<小寫名稱>', () => {
        expect(buildFavoriteUrl('Shroud', 'twitch')).toBe('https://www.twitch.tv/shroud');
        expect(buildFavoriteUrl('@Shroud', 'twitch')).toBe('https://www.twitch.tv/shroud');
    });

    it('只輸入名稱 + 選 YouTube → youtube.com/@<名稱>', () => {
        expect(buildFavoriteUrl('MyChannel', 'youtube')).toBe('https://www.youtube.com/@MyChannel');
        expect(buildFavoriteUrl('@my.channel', 'youtube')).toBe('https://www.youtube.com/@my.channel');
    });

    it('沒選平台 → 原樣送出', () => {
        expect(buildFavoriteUrl('shroud', null)).toBe('shroud');
    });
});
