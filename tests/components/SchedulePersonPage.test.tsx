// 個人週表頁：頭部資訊、直播中一鍵在畫布觀看（YouTube 優先）、合併標籤、週表預告、noindex、404
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../src/i18n/i18n';
import type { SchedulePerson } from '../../src/features/schedule/personSource';

const NOW = Date.parse('2026-09-29T04:00:00Z'); // 台北 12:00

const h = vi.hoisted(() => ({
    fetchPerson: vi.fn(),
    track: { scheduleFilterChange: vi.fn(), scheduleOpenMulti: vi.fn(), scheduleWatch: vi.fn() },
    addStream: vi.fn(async (_url: string, _opts?: unknown) => ({ success: true })),
}));
vi.mock('../../src/features/schedule/personSource', () => ({ fetchPerson: (slug: string) => h.fetchPerson(slug) }));
vi.mock('../../src/utils/analytics', () => ({ logEvent: vi.fn(), track: h.track }));
vi.mock('../../src/store/useStreamStore', () => ({
    useStreamStore: Object.assign(
        (selector: (s: { streams: unknown[] }) => unknown) => selector({ streams: [] }),
        { getState: () => ({ streams: [], addStream: h.addStream }) },
    ),
}));

import { SchedulePersonPage } from '../../src/components/Pages/SchedulePersonPage';
import { useUIStore } from '../../src/store/useUIStore';

function person(overrides: Partial<SchedulePerson> = {}): SchedulePerson {
    return {
        id: 'v1',
        indexable: true,
        channel: { name: '台一', nationality: 'TW', group: '子午計畫', slug: 'taione', youtube: 'UC0000000000000000000001', twitch: 'taione' },
        live: [{
            vtuber_id: 'v1', platform: 'youtube', external_id: 'TaiOneLive01', source: 'yt_waiting_room', status: 'live', title: '同步雜談',
            actual_start: '2026-09-29T03:00:00Z',
            // 同時併入 Twitch 直播與 Twitch 週表：標籤只出現一次
            also: [{ platform: 'twitch', external_id: '999', source: 'twitch_live' }, { platform: 'twitch', external_id: 'seg-0', source: 'twitch_schedule' }],
        }],
        upcoming: [
            { vtuber_id: 'v1', platform: 'twitch', external_id: 'seg-1', source: 'twitch_schedule', status: 'scheduled', category: 'Just Chatting', scheduled_start: '2026-09-29T12:00:00Z' },
        ],
        recent: [
            { vtuber_id: 'v1', platform: 'youtube', external_id: 'TaiOneEnded', source: 'yt_waiting_room', status: 'ended', title: '昨晚歌回', actual_end: '2026-09-28T16:00:00Z' },
        ],
        ...overrides,
    };
}

function renderPage(slug = 'taione') {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <SchedulePersonPage slug={slug} />
        </QueryClientProvider>,
    );
}

const robots = () => document.querySelector('meta[name="robots"]')?.getAttribute('content');

describe('SchedulePersonPage', () => {
    beforeEach(async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        await i18n.changeLanguage('zh-TW');
        vi.clearAllMocks();
        useUIStore.setState({ page: 'schedule:taione' });
        h.fetchPerson.mockResolvedValue(person());
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('頭部：名字、團體與地區、頻道連結；title 帶名字、可索引', async () => {
        renderPage();
        expect(await screen.findByRole('heading', { level: 1, name: '台一' })).toBeInTheDocument();
        expect(screen.getByText('子午計畫 · 台灣')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /YouTube 頻道/ })).toHaveAttribute('href', 'https://www.youtube.com/channel/UC0000000000000000000001');
        expect(screen.getByRole('link', { name: /Twitch 頻道/ })).toHaveAttribute('href', 'https://www.twitch.tv/taione');
        expect(document.title).toBe('台一 開台時間與直播週表 - MultiStream Hub');
        expect(robots()).toMatch(/^index/);
        expect(h.fetchPerson).toHaveBeenCalledWith('taione');
    });

    it('直播中：合併卡標「也在 Twitch」，一鍵在畫布觀看加的是 YouTube 並切到畫布', async () => {
        renderPage();
        const live = await screen.findByRole('region', { name: /正在直播/ });
        expect(within(live).getByText('也在 Twitch')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '在畫布觀看' }));
        await waitFor(() => expect(h.addStream).toHaveBeenCalledTimes(1));
        expect(h.addStream.mock.calls[0][0]).toBe('https://www.youtube.com/watch?v=TaiOneLive01');
        await waitFor(() => expect(useUIStore.getState().page).toBe('canvas'));
        expect(h.track.scheduleWatch).toHaveBeenCalledWith('youtube', 'live', 'person', 'added');
    });

    it('接下來：Twitch 週表段標「週表預告」，沒有標題時顯示分類；名字不再連回自己', async () => {
        renderPage();
        const upcoming = await screen.findByRole('region', { name: /接下來 7 天/ });
        expect(within(upcoming).getByText('週表預告')).toBeInTheDocument();
        expect(within(upcoming).getByText('Just Chatting')).toBeInTheDocument();
        expect(document.querySelector('main a[href="/schedule/taione"]')).toBeNull();
        expect(within(screen.getByRole('region', { name: /最近 30 天/ })).getByText('昨晚歌回')).toBeInTheDocument();
    });

    it('不活躍：noindex，沒有場次時顯示說明', async () => {
        h.fetchPerson.mockResolvedValue(person({ indexable: false, live: [], upcoming: [], recent: [] }));
        renderPage();
        expect(await screen.findByText('最近沒有這位實況主的直播或排程。')).toBeInTheDocument();
        expect(robots()).toMatch(/^noindex/);
        expect(screen.queryByRole('button', { name: /在畫布觀看/ })).not.toBeInTheDocument();
    });

    it('查無此人：404 樣式、noindex、連回週表', async () => {
        h.fetchPerson.mockResolvedValue(null);
        renderPage('nobody');
        expect(await screen.findByRole('heading', { level: 1, name: '找不到這位實況主' })).toBeInTheDocument();
        expect(robots()).toMatch(/^noindex/);
        expect(screen.getByRole('link', { name: '回到開台週表' })).toHaveAttribute('href', '/schedule');
    });
});
