// Twitch login 不分大小寫：收藏網址 twitch.tv/Shroud 曾因 key 大小寫不一致而永遠顯示未開台
import { describe, it, expect, vi } from 'vitest';
import { TwitchService } from '../../../src/features/twitch/TwitchService';

function makeService(streams: Array<{ user_login: string }>) {
    const get = vi.fn(async () => ({
        data: streams.map(s => ({ ...s, title: 't', game_name: 'g', viewer_count: 1, started_at: '', thumbnail_url: '' })),
    }));
    const service = new TwitchService(
        { resolve: () => ({ clientId: 'test-client' }) } as any,
        {} as any,
        { get } as any,
        {} as any,
    );
    return { service, get };
}

describe('TwitchService.checkMultipleChannelsLiveStatus 大小寫', () => {
    it('輸入含大寫 → 結果 key 是小寫，直播中的頻道不會被預設離線蓋掉', async () => {
        const { service } = makeService([{ user_login: 'shroud' }]);
        const res = await service.checkMultipleChannelsLiveStatus(['Shroud', 'Offline_One']);
        expect(res.shroud?.isLive).toBe(true);
        expect(res.offline_one?.isLive).toBe(false);
        expect(res).not.toHaveProperty('Shroud');
    });

    it('大小寫不同的同一頻道只查一次', async () => {
        const { service, get } = makeService([]);
        await service.checkMultipleChannelsLiveStatus(['Shroud', 'shroud', 'SHROUD']);
        expect(get).toHaveBeenCalledTimes(1);
        const qs = new URLSearchParams((get.mock.calls[0] as any[])[0].split('?')[1]);
        expect(qs.getAll('user_login')).toEqual(['shroud']);
    });
});
