// 開台週表頁：預設只顯示 TW、分頁、收藏範圍、勾選一鍵多開
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../src/i18n/i18n';
import { makeSnapshot } from '../features/schedule/fixtures';

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
const clickTab = (name: RegExp) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });

describe('SchedulePage', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        localStorage.clear();
        vi.clearAllMocks();
        h.canvas.streams = [];
        fetchSnapshot.mockResolvedValue(makeSnapshot());
        useUIStore.setState({ page: 'schedule' });
    });

    it('先顯示載入中，snapshot 回來後預設只列 TW 的直播中場次', async () => {
        renderPage();
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('台灣 VTuber 開台週表');
        expect(screen.getByLabelText('載入週表中…')).toBeInTheDocument();
        await screen.findByText('台一 Twitch');
        expect(screen.queryByText('日三直播')).not.toBeInTheDocument(); // JP 被預設篩掉
        expect(screen.queryByText('馬四')).not.toBeInTheDocument(); // MY
        // 分頁數字：直播中 1、即將開台 3、剛結束 1
        expect(screen.getByRole('tab', { name: /直播中/ })).toHaveTextContent('1');
        expect(screen.getByRole('tab', { name: /即將開台/ })).toHaveTextContent('3');
    });

    it('即將開台是依日分欄的看板；剛結束不能勾選', async () => {
        renderPage();
        await screen.findByText('台一 Twitch');
        clickTab(/即將開台/);
        await screen.findByText('晚上雜談');
        expect(screen.getByText('歌回')).toBeInTheDocument();
        expect(screen.getByText('早安')).toBeInTheDocument();
        clickTab(/剛結束/);
        await screen.findByText('昨晚');
        expect(screen.queryByLabelText('選取 台二')).not.toBeInTheDocument();
    });

    it('收藏範圍：沒收藏時顯示引導；有收藏時不受 TW 預設影響', async () => {
        renderPage();
        await screen.findByText('台一 Twitch');
        fireEvent.click(screen.getByRole('radio', { name: '我的收藏' }));
        expect(await screen.findByText('你的收藏裡還沒有週表上的實況主')).toBeInTheDocument();
    });

    it('收藏了日本的實況主，收藏範圍會顯示他', async () => {
        seedFavorites([{ id: 'f1', url: 'https://www.youtube.com/channel/UC0000000000000000000003/live', name: '日三', platform: 'youtube', channelId: 'UC0000000000000000000003', addedAt: '2026-01-01' }]);
        renderPage();
        await screen.findByText('台一 Twitch');
        fireEvent.click(screen.getByRole('radio', { name: '我的收藏' }));
        expect(await screen.findByText('日三直播')).toBeInTheDocument();
        expect(screen.queryByText('台一 Twitch')).not.toBeInTheDocument();
    });

    it('勾選後「在畫布同時觀看」依序加入並切到畫布', async () => {
        renderPage();
        await screen.findByText('台一 Twitch');
        fireEvent.click(screen.getByLabelText('選取 台一'));
        clickTab(/即將開台/);
        await screen.findByText('晚上雜談');
        // 同一小時（台北 20 點）有兩場：用「選取這個時段」一次勾
        const selectHour = screen.getAllByRole('button', { name: '選取這個時段' });
        fireEvent.click(selectHour[0]);
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
        expect(track.scheduleOpenMulti).toHaveBeenCalledWith(3, 3, 'upcoming', 'all');
    });

    it('畫布剩餘路數不足時提示', async () => {
        h.canvas.streams = Array.from({ length: 16 }, () => ({}));
        renderPage();
        await screen.findByText('台一 Twitch');
        fireEvent.click(screen.getByLabelText('選取 台一'));
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
