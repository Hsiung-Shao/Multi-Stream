// 開台週表頁：預設只顯示 TW、直播中／接下來（時間軸）／剛結束三段、收藏範圍、勾選一鍵多開
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../src/i18n/i18n';
import { makeSnapshot, NOW } from '../features/schedule/fixtures';

// vi.mock 會被提到檔案最上方：mock 內用到的變數要用 vi.hoisted 宣告
const h = vi.hoisted(() => ({
    fetchSnapshot: vi.fn(),
    track: { scheduleFilterChange: vi.fn(), scheduleOpenMulti: vi.fn() },
    addStream: vi.fn(async (_url: string, _opts?: unknown) => ({ success: true })),
    canvas: { streams: [] as unknown[] },
}));
vi.mock('../../src/features/schedule/snapshotSource', () => ({ fetchSnapshot: () => h.fetchSnapshot() }));
vi.mock('../../src/utils/analytics', () => ({ logEvent: vi.fn(), track: h.track }));
vi.mock('../../src/store/useStreamStore', () => ({
    useStreamStore: Object.assign(
        (selector: (s: { streams: unknown[] }) => unknown) => selector({ streams: h.canvas.streams }),
        { getState: () => ({ streams: h.canvas.streams, addStream: h.addStream }) },
    ),
}));
const { fetchSnapshot, track, addStream } = h;

import { SchedulePage } from '../../src/components/Pages/SchedulePage';
import { useUIStore } from '../../src/store/useUIStore';

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <SchedulePage />
        </QueryClientProvider>,
    );
}

const seedFavorites = (list: object[]) => localStorage.setItem('favoriteStreams', JSON.stringify(list));
const section = (name: RegExp) => screen.getByRole('region', { name });

describe('SchedulePage', () => {
    beforeEach(async () => {
        // 只假造 Date（不動計時器，TanStack Query 與 waitFor 照常運作）：時間軸的「今天」固定在 fixture 那天
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        await i18n.changeLanguage('zh-TW');
        localStorage.clear();
        vi.clearAllMocks();
        h.canvas.streams = [];
        fetchSnapshot.mockResolvedValue(makeSnapshot());
        useUIStore.setState({ page: 'schedule' });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('先顯示載入中，snapshot 回來後三段都出現，預設只列 TW', async () => {
        renderPage();
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('台灣 VTuber 開台週表');
        expect(screen.getByLabelText('載入週表中…')).toBeInTheDocument();
        await screen.findByText('台一 Twitch');
        expect(screen.queryByText('日三直播')).not.toBeInTheDocument(); // JP 被預設篩掉
        expect(screen.queryByText('馬四')).not.toBeInTheDocument(); // MY
        expect(screen.getByRole('heading', { name: /直播中/ })).toHaveTextContent('1');
        expect(screen.getByRole('heading', { name: /接下來/ })).toHaveTextContent('3');
        expect(within(section(/剛結束/)).getByText(/昨晚/)).toBeInTheDocument();
    });

    it('接下來：預設今天的時間軸，切到明天看得到隔天的場次；剛結束不能勾選', async () => {
        renderPage();
        await screen.findByText('台一 Twitch');
        const upcoming = section(/接下來/);
        expect(within(upcoming).getByText('晚上雜談')).toBeInTheDocument();
        expect(within(upcoming).getByText('歌回')).toBeInTheDocument();
        expect(within(upcoming).queryByText('早安')).not.toBeInTheDocument();
        fireEvent.click(within(upcoming).getByRole('tab', { name: /明天/ }));
        expect(await within(upcoming).findByText('早安')).toBeInTheDocument();
        expect(within(section(/剛結束/)).queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('名字連到個人週表頁（沒有 slug 的不連）；合併場次標「也在 Twitch」', async () => {
        renderPage();
        await screen.findByText('台一 Twitch');
        const upcoming = section(/接下來/);
        const nameLink = within(section(/直播中/)).getByRole('link', { name: '台一' });
        expect(nameLink).toHaveAttribute('href', '/schedule/taione');
        expect(within(upcoming).getByText('也在 Twitch')).toBeInTheDocument();
        expect(within(upcoming).queryByRole('link', { name: '台二' })).not.toBeInTheDocument();
        fireEvent.click(nameLink);
        expect(useUIStore.getState().page).toBe('schedule:taione');
    });

    it('收藏範圍：沒收藏時顯示引導', async () => {
        renderPage();
        await screen.findByText('台一 Twitch');
        fireEvent.click(screen.getByRole('radio', { name: '我的收藏' }));
        expect(await screen.findByText('你的收藏裡還沒有週表上的實況主')).toBeInTheDocument();
    });

    it('收藏了日本的實況主，收藏範圍會顯示他（不受預設 TW 影響）', async () => {
        seedFavorites([{ id: 'f1', url: 'https://www.youtube.com/channel/UC0000000000000000000003/live', name: '日三', platform: 'youtube', channelId: 'UC0000000000000000000003', addedAt: '2026-01-01' }]);
        renderPage();
        await screen.findByText('台一 Twitch');
        fireEvent.click(screen.getByRole('radio', { name: '我的收藏' }));
        expect(await screen.findByText('日三直播')).toBeInTheDocument();
        expect(screen.queryByText('台一 Twitch')).not.toBeInTheDocument();
    });

    it('勾選直播中一位、再用「全選」勾同一小時的兩位，依序加入畫布並切到畫布', async () => {
        renderPage();
        await screen.findByText('台一 Twitch');
        fireEvent.click(within(section(/直播中/)).getByRole('checkbox', { name: '選取 台一' }));
        fireEvent.click(within(section(/接下來/)).getByRole('button', { name: '全選 2 位' }));
        const bar = screen.getByRole('region', { name: /已選/ });
        expect(within(bar).getByText('已選 3 位')).toBeInTheDocument();
        fireEvent.click(within(bar).getByRole('button', { name: /在畫布同時觀看/ }));
        await waitFor(() => expect(addStream).toHaveBeenCalledTimes(3));
        expect(addStream.mock.calls.map((c) => c[0])).toEqual([
            'TaiOne',
            'https://www.youtube.com/watch?v=TaiOneWait1',
            'https://www.youtube.com/watch?v=TaiTwoWait1',
        ]);
        await waitFor(() => expect(useUIStore.getState().page).toBe('canvas'));
        expect(track.scheduleOpenMulti).toHaveBeenCalledWith(3, 3, 'mixed', 'all');
    });

    it('畫布剩餘路數不足時提示並停用按鈕', async () => {
        h.canvas.streams = Array.from({ length: 16 }, () => ({}));
        renderPage();
        await screen.findByText('台一 Twitch');
        fireEvent.click(within(section(/直播中/)).getByRole('checkbox', { name: '選取 台一' }));
        expect(screen.getByText('畫布最多 16 路，目前還能加 0 路')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /在畫布同時觀看/ })).toBeDisabled();
    });

    it('載入失敗顯示錯誤與重試', async () => {
        fetchSnapshot.mockRejectedValue(new Error('down'));
        renderPage();
        // useScheduleSnapshot 會先重試一次（約 1 秒）才進入錯誤狀態
        expect(await screen.findByText('週表暫時無法載入', {}, { timeout: 4000 })).toBeInTheDocument();
        fetchSnapshot.mockResolvedValue(makeSnapshot());
        fireEvent.click(screen.getByRole('button', { name: /重試/ }));
        expect(await screen.findByText('台一 Twitch')).toBeInTheDocument();
    });
});
