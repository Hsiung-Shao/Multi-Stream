// 週表卡片的三個新動作背後的純函式：搜尋比對、實況主捷徑、已在畫布上、收藏目標與比對
import { describe, it, expect } from 'vitest';
import { favoriteChannelKey, filterStreams, isFavoriteChannel, listMatchingChannels, matchesQuery, normalizeQuery, toFavoriteKeys } from '../../../src/features/schedule/filters';
import { isOnCanvas } from '../../../src/features/schedule/useWatchOnCanvas';
import { favoriteTarget, favoritesOf } from '../../../src/features/schedule/useFavoriteChannel';
import { DEFAULT_FILTERS } from '../../../src/features/schedule/types';
import { makeSnapshot } from './fixtures';

const noFav = toFavoriteKeys([]);

describe('搜尋', () => {
    it('normalizeQuery：全半形、大小寫、空白', () => {
        expect(normalizeQuery('  ＴａｉＯｎｅ ')).toBe('taione');
    });

    it('matchesQuery：名字、團體、所屬、slug、標題、分類都算；空字串全中', () => {
        const ch = { name: '台一', nationality: 'TW', group: '子午計畫', agency: '子午計畫', slug: 'taione' };
        const s = { vtuber_id: 'v1', platform: 'youtube' as const, external_id: 'x', source: 'yt_waiting_room', status: 'scheduled', title: '晚上雜談', category: 'Just Chatting' };
        for (const q of ['台一', '子午', 'taione', '雜談', 'just chat']) expect(matchesQuery(ch, s, normalizeQuery(q))).toBe(true);
        expect(matchesQuery(ch, s, normalizeQuery('不相干'))).toBe(false);
        expect(matchesQuery(undefined, s, '')).toBe(true);
    });

    it('有搜尋字時不套地區與所屬篩選，平台篩選照套', () => {
        const snap = makeSnapshot();
        // 預設只看 TW：日三（JP）平常看不到，搜尋時看得到
        expect(filterStreams(snap, 'live', DEFAULT_FILTERS, noFav).map((s) => s.vtuber_id)).toEqual(['v1']);
        expect(filterStreams(snap, 'live', DEFAULT_FILTERS, noFav, '日三').map((s) => s.vtuber_id)).toEqual(['v3']);
        expect(filterStreams(snap, 'live', { ...DEFAULT_FILTERS, group: '子午計畫' }, noFav, '日三').map((s) => s.vtuber_id)).toEqual(['v3']);
        expect(filterStreams(snap, 'live', { ...DEFAULT_FILTERS, platform: 'twitch' }, noFav, '日三')).toEqual([]);
    });

    it('listMatchingChannels：名字開頭符合的排前面，上限可調', () => {
        const snap = makeSnapshot();
        snap.channels.v5 = { name: '小台一', nationality: 'TW', slug: 'xiao' };
        expect(listMatchingChannels(snap, '台一').map((p) => p.id)).toEqual(['v1', 'v5']);
        expect(listMatchingChannels(snap, '台', 1)).toHaveLength(1);
        expect(listMatchingChannels(snap, '  ')).toEqual([]);
    });
});

describe('isOnCanvas', () => {
    const ch = { name: '台一', nationality: 'TW', twitch: 'TaiOne' };
    it('YouTube 比影片 ID；Twitch 比 login（不分大小寫）', () => {
        expect(isOnCanvas({ platform: 'youtube', external_id: 'VID' }, ch, [{ platform: 'youtube', channelId: 'UC', videoId: 'VID' }])).toBe(true);
        expect(isOnCanvas({ platform: 'youtube', external_id: 'VID' }, ch, [{ platform: 'youtube', channelId: 'UC', videoId: 'OTHER' }])).toBe(false);
        expect(isOnCanvas({ platform: 'twitch', external_id: '123' }, ch, [{ platform: 'twitch', channelId: 'taione', videoId: '' }])).toBe(true);
        expect(isOnCanvas({ platform: 'twitch', external_id: '123' }, { name: 'x', nationality: 'TW' }, [{ platform: 'twitch', channelId: 'taione', videoId: '' }])).toBe(false);
    });

    it('YouTube 直播中：畫布上從頻道網址加入（沒有 videoId）的同頻道也算；待機室不算', () => {
        const yt = { name: '台一', nationality: 'TW', youtube: 'UC1' };
        const canvas = [{ platform: 'youtube' as const, channelId: 'UC1', videoId: '' }];
        expect(isOnCanvas({ platform: 'youtube', external_id: 'LIVE1', status: 'live' }, yt, canvas)).toBe(true);
        expect(isOnCanvas({ platform: 'youtube', external_id: 'WAIT1', status: 'scheduled' }, yt, canvas)).toBe(false);
    });
});

describe('收藏', () => {
    it('favoriteTarget：YouTube 優先，否則 Twitch（login 小寫），都沒有回 null', () => {
        expect(favoriteTarget({ name: 'a', nationality: 'TW', youtube: 'UC1', twitch: 'One' })).toEqual({ url: 'https://www.youtube.com/channel/UC1', channelId: 'UC1' });
        expect(favoriteTarget({ name: 'a', nationality: 'TW', twitch: 'One' })).toEqual({ url: 'https://www.twitch.tv/one', channelId: 'one' });
        expect(favoriteTarget({ name: 'a', nationality: 'TW' })).toBeNull();
    });

    it('favoriteChannelKey：沒有 channelId 的舊資料從網址取；愛心顯示與切換判斷一致', () => {
        expect(favoriteChannelKey({ platform: 'twitch', url: 'https://www.twitch.tv/TaiOne' })).toEqual({ platform: 'twitch', id: 'taione' });
        expect(favoriteChannelKey({ platform: 'youtube', url: 'https://www.youtube.com/channel/UCabc_-1/live' })).toEqual({ platform: 'youtube', id: 'UCabc_-1' });
        expect(favoriteChannelKey({ platform: 'other', channelId: 'x' })).toBeNull();
        const legacy = [{ id: 'x', platform: 'twitch', url: 'https://www.twitch.tv/taione' }];
        const ch = { name: '台一', nationality: 'TW', twitch: 'TaiOne' };
        expect(isFavoriteChannel(ch, toFavoriteKeys(legacy))).toBe(true);
        expect(favoritesOf(ch, legacy).map((f) => f.id)).toEqual(['x']);
    });

    it('favoritesOf：兩個平台都找得到；Twitch 沒有 channelId 時從網址取 login', () => {
        const ch = { name: 'a', nationality: 'TW', youtube: 'UC1', twitch: 'One' };
        const list = [
            { id: '1', platform: 'youtube', channelId: 'UC1' },
            { id: '2', platform: 'twitch', url: 'https://www.twitch.tv/ONE' },
            { id: '3', platform: 'twitch', channelId: 'two' },
            { id: '4', platform: 'youtube', channelId: 'UC2' },
        ];
        expect(favoritesOf(ch, list).map((f) => f.id)).toEqual(['1', '2']);
    });
});
