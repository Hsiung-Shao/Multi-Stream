// 開台週表頁：預設只顯示 TW、直播中／接下來（時間軸）／剛結束三段、收藏範圍、勾選一鍵多開
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../src/i18n/i18n';
import { makeSnapshot, NOW } from '../features/schedule/fixtures';

// vi.mock 會被提到檔案最上方：mock 內用到的變數要用 vi.hoisted 宣告
const h = vi.hoisted(() => ({
    fetchSnapshot: vi.fn(),
    track: { scheduleFilterChange: vi.fn(), scheduleOpenMulti: vi.fn(), scheduleWatch: vi.fn() },
    fetchAgencyRoster: vi.fn(),
    addStream: vi.fn(async (_url: string, _opts?: unknown) => ({ success: true })),
    canvas: { streams: [] as unknown[] },
}));
vi.mock('../../src/features/schedule/snapshotSource', () => ({ fetchSnapshot: () => h.fetchSnapshot() }));
vi.mock('../../src/utils/analytics', () => ({ logEvent: vi.fn(), track: h.track }));
vi.mock('../../src/features/schedule/rosterSource', async (orig) => ({
    ...(await orig<typeof import('../../src/features/schedule/rosterSource')>()),
    fetchAgencyRoster: (agency: string) => h.fetchAgencyRoster(agency),
}));
// 全站搜尋框會打 Twitch／YouTube API：換成只顯示帶入字的替身
vi.mock('../../src/components/StreamSearchBox', () => ({
    StreamSearchBox: ({ initialQuery, initialPlatform }: { initialQuery?: string; initialPlatform?: string }) => (
        <div data-testid="global-search">{`${initialPlatform}:${initialQuery}`}</div>
    ),
}));
vi.mock('../../src/store/useStreamStore', () => ({
    useStreamStore: Object.assign(
        (selector: (s: { streams: unknown[] }) => unknown) => selector({ streams: h.canvas.streams }),
        { getState: () => ({ streams: h.canvas.streams, addStream: h.addStream }) },
    ),
}));
const { fetchSnapshot, track, addStream } = h;

import { SchedulePage } from '../../src/components/Pages/SchedulePage';
import { favoritesService } from '../../src/features/favorites/FavoritesService';
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

    it('團名在 Twitch 與 YouTube 的卡片上都顯示（直播中、接下來）', async () => {
        renderPage();
        await screen.findByText('台一 Twitch');
        // 台一的直播是 Twitch、待機室是 YouTube，團體是同一位實況主的
        expect(within(section(/直播中/)).getByText('子午計畫')).toBeInTheDocument();
        expect(within(section(/接下來/)).getAllByText(/子午計畫/).length).toBeGreaterThan(0);
    });

    it('所屬選了某家企業勢：顯示成員名冊（直播中標示、已畢業收合）；搜尋時隱藏', async () => {
        const { buildRoster } = await import('../../src/features/schedule/rosterSource');
        h.fetchAgencyRoster.mockResolvedValue(
            buildRoster('子午計畫', [{ id: 'g', name: '子午計畫', parent_id: null }], [
                { id: 'v1', name: '台一', img_url: null, slug: 'taione', activity: 'active', debut_date: '2021-01-01', group_id: 'g' },
                { id: 'old', name: '已畢業的人', img_url: null, slug: 'oldone', activity: 'graduate', debut_date: '2020-01-01', graduated_at: '2023-06-30', group_id: 'g' },
            ]),
        );
        localStorage.setItem('schedule-filters-v1', JSON.stringify({ group: '子午計畫' }));
        renderPage();
        await screen.findByText('台一 Twitch');
        const roster = await screen.findByRole('region', { name: /子午計畫 成員/ });
        expect(h.fetchAgencyRoster).toHaveBeenCalledWith('子午計畫');
        expect(within(roster).getByText('現役 1 位 · 已畢業 1 位')).toBeInTheDocument();
        expect(within(roster).getByRole('link', { name: /台一/ })).toHaveAttribute('href', '/schedule/taione');
        expect(within(roster).getByText('直播中')).toBeInTheDocument(); // 台一正在 Twitch 直播
        expect(within(roster).queryByText('已畢業的人')).not.toBeInTheDocument();
        fireEvent.click(within(roster).getByRole('button', { name: '顯示已畢業 1 位' }));
        expect(within(roster).getByText('已畢業的人')).toBeInTheDocument();
        fireEvent.change(screen.getByRole('searchbox', { name: '搜尋週表' }), { target: { value: '台一' } });
        await waitFor(() => expect(screen.queryByRole('region', { name: /子午計畫 成員/ })).not.toBeInTheDocument());
    });

    it('點直播中的卡片：加入畫布（附聊天室）並切到畫布，不開原平台', async () => {
        renderPage();
        await screen.findByText('台一 Twitch');
        const live = section(/直播中/);
        fireEvent.click(within(live).getByRole('button', { name: '在畫布觀看 台一' }));
        await waitFor(() => expect(addStream).toHaveBeenCalledTimes(1));
        expect(addStream).toHaveBeenCalledWith('TaiOne', { withChat: true, withStream: true, displayName: '台一' });
        await waitFor(() => expect(useUIStore.getState().page).toBe('canvas'));
        expect(track.scheduleWatch).toHaveBeenCalledWith('twitch', 'live', 'board', 'added');
        // 原平台改成小圖示外部連結
        const original = within(live).getByRole('link', { name: '在 Twitch 開啟' });
        expect(original).toHaveAttribute('href', 'https://www.twitch.tv/TaiOne');
        expect(original).toHaveAttribute('target', '_blank');
    });

    it('點「接下來」的一列：YouTube 待機室加入畫布', async () => {
        renderPage();
        await screen.findByText('台一 Twitch');
        fireEvent.click(within(section(/接下來/)).getByRole('button', { name: /晚上雜談/ }));
        await waitFor(() => expect(addStream).toHaveBeenCalledWith('https://www.youtube.com/watch?v=TaiOneWait1', expect.objectContaining({ withChat: true })));
    });

    it('已經在畫布上：不重複加入，直接切到畫布', async () => {
        h.canvas.streams = [{ platform: 'twitch', channelId: 'taione', videoId: '' }];
        renderPage();
        await screen.findByText('台一 Twitch');
        fireEvent.click(within(section(/直播中/)).getByRole('button', { name: '在畫布觀看 台一' }));
        await waitFor(() => expect(useUIStore.getState().page).toBe('canvas'));
        expect(addStream).not.toHaveBeenCalled();
    });

    it('store 回報已存在（網址形式不同的同一路）：當成已在畫布，直接切過去', async () => {
        addStream.mockResolvedValueOnce({ success: false, message: '此串流已存在', streamId: 7 } as unknown as { success: boolean });
        renderPage();
        await screen.findByText('台一 Twitch');
        fireEvent.click(within(section(/直播中/)).getByRole('button', { name: '在畫布觀看 台一' }));
        await waitFor(() => expect(useUIStore.getState().page).toBe('canvas'));
        expect(track.scheduleWatch).toHaveBeenCalledWith('twitch', 'live', 'board', 'switched');
    });

    it('畫布已滿：不加入、不切頁', async () => {
        h.canvas.streams = Array.from({ length: 16 }, () => ({ platform: 'youtube', channelId: 'x', videoId: 'y' }));
        renderPage();
        await screen.findByText('台一 Twitch');
        fireEvent.click(within(section(/直播中/)).getByRole('button', { name: '在畫布觀看 台一' }));
        await waitFor(() => expect(track.scheduleWatch).toHaveBeenCalledWith('twitch', 'live', 'board', 'full'));
        expect(addStream).not.toHaveBeenCalled();
        expect(useUIStore.getState().page).toBe('schedule');
    });

    it('搜尋：即時篩選、不受預設地區限制、列出實況主捷徑', async () => {
        renderPage();
        await screen.findByText('台一 Twitch');
        fireEvent.change(screen.getByRole('searchbox', { name: '搜尋週表' }), { target: { value: '日三' } });
        // 日三是 JP，預設只看 TW 時原本看不到；搜尋時不套地區
        expect(await screen.findByText('日三直播')).toBeInTheDocument();
        expect(screen.queryByText('台一 Twitch')).not.toBeInTheDocument();
        // 地區膠囊在搜尋時停用
        expect(screen.getByRole('radio', { name: '台灣' })).toBeDisabled();
        // 實況主捷徑：只列有個人頁的人（日三在測試資料裡沒有 slug）
        expect(screen.queryByRole('navigation', { name: '實況主' })).not.toBeInTheDocument();
        fireEvent.change(screen.getByRole('searchbox', { name: '搜尋週表' }), { target: { value: '台一' } });
        const people = await screen.findByRole('navigation', { name: '實況主' });
        expect(within(people).getByRole('link', { name: '台一' })).toHaveAttribute('href', '/schedule/taione');
    });

    it('搜尋標題也會命中；週表上找不到時改用全站搜尋（預設搜 YouTube）', async () => {
        renderPage();
        await screen.findByText('台一 Twitch');
        const box = screen.getByRole('searchbox', { name: '搜尋週表' });
        fireEvent.change(box, { target: { value: '歌回' } });
        expect(await within(section(/接下來/)).findByText('歌回')).toBeInTheDocument();
        fireEvent.change(box, { target: { value: '完全不存在的人' } });
        expect(await screen.findByText('週表上找不到「完全不存在的人」')).toBeInTheDocument();
        expect(screen.getByTestId('global-search')).toHaveTextContent('youtube:完全不存在的人');
        fireEvent.keyDown(box, { key: 'Escape' });
        expect(await screen.findByText('台一 Twitch')).toBeInTheDocument();
    });

    it('在「我的收藏」範圍搜尋找不到時，可以一鍵改在全部範圍搜尋', async () => {
        renderPage();
        await screen.findByText('台一 Twitch');
        fireEvent.click(screen.getByRole('radio', { name: '我的收藏' }));
        fireEvent.change(screen.getByRole('searchbox', { name: '搜尋週表' }), { target: { value: '台一' } });
        fireEvent.click(await screen.findByRole('button', { name: '改在全部範圍與平台搜尋' }));
        expect(await screen.findByText('台一 Twitch')).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: '我的收藏' })).toHaveAttribute('aria-checked', 'false');
    });

    it('愛心：未收藏時加入（YouTube 優先），不觸發在畫布觀看', async () => {
        const add = vi.spyOn(favoritesService, 'addFavorite').mockResolvedValue({ success: true, message: 'addedToFavorites' });
        renderPage();
        await screen.findByText('台一 Twitch');
        const heart = within(section(/直播中/)).getByRole('button', { name: '收藏 台一' });
        expect(heart).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(heart);
        await waitFor(() => expect(add).toHaveBeenCalledWith('https://www.youtube.com/channel/UC0000000000000000000001', '台一', null, 'UC0000000000000000000001'));
        expect(addStream).not.toHaveBeenCalled();
        add.mockRestore();
    });

    it('愛心：已收藏時顯示已收藏，再點一次兩個平台的收藏都移除', async () => {
        seedFavorites([
            { id: 'a', url: 'https://www.youtube.com/channel/UC0000000000000000000001', name: '台一', platform: 'youtube', channelId: 'UC0000000000000000000001', addedAt: '2026-01-01' },
            { id: 'b', url: 'https://www.twitch.tv/taione', name: '台一', platform: 'twitch', channelId: 'taione', addedAt: '2026-01-01' },
            { id: 'c', url: 'https://www.youtube.com/channel/UC-other', name: '別人', platform: 'youtube', channelId: 'UC-other', addedAt: '2026-01-01' },
        ]);
        const remove = vi.spyOn(favoritesService, 'removeFavorite');
        renderPage();
        await screen.findByText('台一 Twitch');
        const heart = within(section(/直播中/)).getByRole('button', { name: '取消收藏 台一' });
        expect(heart).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(heart);
        await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
        expect(remove.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
        remove.mockRestore();
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
