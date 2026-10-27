// 歌曲播放清單頁：殼層標題、目錄載入／空目錄／失敗重試、client 搜尋、播放進佇列、分享連結載入與另存歌單
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../src/i18n/i18n';

vi.mock('../../src/utils/analytics', () => ({ logEvent: vi.fn(), track: {} }));
vi.mock('../../src/utils/apiLoader', () => ({ apiLoader: { loadYouTubePlayerApi: vi.fn(async () => undefined) } }));

import { SongsPage } from '../../src/components/Pages/SongsPage';
import { usePlaylistStore } from '../../src/features/songs/store/usePlaylistStore';

// 用真的 i18n 但鎖定 zh-TW：jsdom 的 navigator.language 是 en-US，斷言對著 zh-TW 實際文案
beforeAll(async () => {
    await i18n.changeLanguage('zh-TW');
});

class FakePlayer {
    static instances: FakePlayer[] = [];
    loadVideoById = vi.fn();
    cueVideoById = vi.fn();
    seekTo = vi.fn();
    playVideo = vi.fn();
    pauseVideo = vi.fn();
    destroy = vi.fn();
    getCurrentTime = () => 0;
    getDuration = () => 0;
    getPlayerState = () => -1;
    constructor(_t: HTMLElement, opts: { events?: { onReady?: (e: { target: FakePlayer }) => void } }) {
        FakePlayer.instances.push(this);
        setTimeout(() => opts.events?.onReady?.({ target: this }), 0);
    }
}

const CATALOG = [
    {
        v: 'aaaaaaaaaaa', t: '十月歌回', d: '2026-10-01T12:00:00Z', vt: { i: 'v1', n: '星川測試', img: null },
        s: [['abcd1234', 10, 200, '夜に駆ける', 'YOASOBI'], ['efgh5678', 200, 400, '紅蓮華', 'LiSA']],
    },
    {
        v: 'bbbbbbbbbbb', t: '耐久歌枠', d: null, vt: { i: 'v2', n: '月見測試', img: null },
        s: [['ijkl9012', 0, 180, '小幸運', '田馥甄']],
    },
];

// v1.3 新格式目錄：片段 8 欄 [code,start,end,歌名,原唱,plays,song_id,version_note]，尾端帶歌曲字典 { songs }
// 歌 1「夜に駆ける」有 3 個版本（星川 2 個、月見 1 個且帶備註「練歌版」），歌 2、歌 3 各 1 個版本
const CATALOG2 = [
    {
        v: 'aaaaaaaaaaa', t: '十月歌回', d: '2026-10-01T12:00:00Z', vt: { i: 'v1', n: '星川測試', img: null },
        s: [['abcd1234', 10, 200, '夜に駆ける', 'YOASOBI', 0, 1, null], ['efgh5678', 200, 400, '紅蓮華', 'LiSA', 0, 2, null]],
    },
    {
        v: 'bbbbbbbbbbb', t: '耐久歌枠', d: '2026-09-15T12:00:00Z', vt: { i: 'v2', n: '月見測試', img: null },
        s: [['ijkl9012', 0, 180, '小幸運', '田馥甄', 0, 3, null], ['mnop3456', 200, 380, '夜に駆ける', 'YOASOBI', 0, 1, '練歌版']],
    },
    {
        v: 'ccccccccccc', t: '九月歌回', d: '2026-09-01T12:00:00Z', vt: { i: 'v1', n: '星川測試', img: null },
        s: [['qrst7890', 0, 150, '夜に駆ける', 'YOASOBI', 0, 1, null]],
    },
    { songs: [[1, '夜に駆ける', 'YOASOBI'], [2, '紅蓮華', 'LiSA'], [3, '小幸運', '田馥甄']] },
];

let fetchMock: ReturnType<typeof vi.fn>;
const jsonRes = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function renderPage(props: Parameters<typeof SongsPage>[0] = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <SongsPage {...props} />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    FakePlayer.instances = [];
    fetchMock = vi.fn(async () => jsonRes(CATALOG));
    vi.stubGlobal('fetch', fetchMock);
    (window as unknown as { YT: unknown }).YT = { Player: FakePlayer };
    usePlaylistStore.setState({ playlists: [] });
});

afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as { YT?: unknown }).YT;
});

describe('SongsPage', () => {
    it('殼層有 h1 與目錄標題，載入完成後列出歌回與歌曲', async () => {
        renderPage();
        expect(screen.getByRole('heading', { level: 1, name: 'VTuber 歌回播放清單' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 2, name: '歌曲目錄' })).toBeInTheDocument();
        expect(await screen.findByText('十月歌回')).toBeInTheDocument();
        expect(screen.getByText('夜に駆ける')).toBeInTheDocument();
        expect(screen.getByText('小幸運')).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledWith('/api/songs/catalog', expect.anything());
    });

    it('依原唱搜尋只留下命中的歌', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        fireEvent.change(screen.getByRole('searchbox', { name: '搜尋 VTuber、歌名或原唱' }), { target: { value: 'lisa' } });
        await waitFor(() => expect(screen.queryByText('夜に駆ける')).toBeNull());
        expect(screen.getByText('紅蓮華')).toBeInTheDocument();
        expect(screen.queryByText('耐久歌枠')).toBeNull();
    });

    it('依 VTuber 名稱搜尋保留整支歌回', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        fireEvent.change(screen.getByRole('searchbox', { name: '搜尋 VTuber、歌名或原唱' }), { target: { value: '月見' } });
        await waitFor(() => expect(screen.queryByText('十月歌回')).toBeNull());
        expect(screen.getByText('小幸運')).toBeInTheDocument();
    });

    it('空目錄顯示尚無歌回', async () => {
        fetchMock.mockImplementation(async () => jsonRes([]));
        renderPage();
        expect(await screen.findByText('目前還沒有歌回，敬請期待。')).toBeInTheDocument();
    });

    it('目錄載入失敗顯示重試，重試成功後出現目錄', async () => {
        // useSongCatalog 自帶重試 1 次（間隔約 1 秒）：前兩次都失敗才會顯示錯誤
        fetchMock.mockImplementationOnce(async () => jsonRes({ ok: false }, 502)).mockImplementationOnce(async () => jsonRes({ ok: false }, 502));
        renderPage();
        expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent('暫時無法載入歌曲目錄');
        fireEvent.click(screen.getByRole('button', { name: '重試' }));
        expect(await screen.findByText('十月歌回')).toBeInTheDocument();
    });

    it('按全部播放後佇列列出該歌回的歌', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        fireEvent.click(screen.getAllByRole('button', { name: '全部播放' })[0]);
        expect(await screen.findByText('共 2 首')).toBeInTheDocument();
        // 目錄、接下來、播放控制底部列各一份；總數 4 是因為右欄「正在播放」與底部播放列都顯示目前歌名
        expect(within(screen.getByRole('region', { name: '歌曲目錄' })).getByText('夜に駆ける')).toBeInTheDocument();
        expect(within(screen.getByRole('region', { name: '接下來' })).getByText('夜に駆ける')).toBeInTheDocument();
        expect(within(screen.getByRole('region', { name: '播放控制' })).getByText('夜に駆ける')).toBeInTheDocument();
        expect(screen.getAllByText('夜に駆ける')).toHaveLength(4);
    });

    it('分享連結載入成佇列、提示找不到的數量並可另存為歌單', async () => {
        const consumed = vi.fn();
        renderPage({ shareCodes: ['ijkl9012', 'zzzz0000', 'abcd1234'], onShareConsumed: consumed });
        const notice = await screen.findByText(/已載入分享的歌單（2 首）/);
        expect(notice).toHaveTextContent('有 1 首已找不到，已略過。');
        expect(consumed).toHaveBeenCalledTimes(1);
        expect(screen.getByText('共 2 首')).toBeInTheDocument();

        fireEvent.click(within(notice.closest('[role="status"]') as HTMLElement).getByRole('button', { name: /另存為歌單/ }));
        const [saved] = usePlaylistStore.getState().playlists;
        expect(saved.name).toBe('朋友分享的歌單');
        expect(saved.codes).toEqual(['ijkl9012', 'abcd1234']);
    });

    it('播放器容器裡沒有其他元素覆蓋', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        const holder = screen.getByTestId('songs-player');
        // 外框只包住播放器掛載點本身
        expect(holder.parentElement?.children).toHaveLength(1);
    });
});

// ---------- v1.2.1：歌曲進度條 ----------
describe('SongsPage 進度條', () => {
    const seekThumb = () => screen.getByRole('slider', { name: '播放進度' });

    it('沒有目前歌曲時進度滑桿停用', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        expect(seekThumb()).toHaveAttribute('data-disabled');
    });

    it('播放第一首後滑桿啟用，範圍是這首的長度（10～200 秒＝190）', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        fireEvent.click(screen.getAllByRole('button', { name: '全部播放' })[0]);
        await screen.findByText('共 2 首');
        expect(seekThumb()).not.toHaveAttribute('data-disabled');
        expect(seekThumb()).toHaveAttribute('aria-valuemin', '0');
        expect(seekThumb()).toHaveAttribute('aria-valuemax', '190');
        expect(seekThumb()).toHaveAttribute('aria-valuenow', '0');
    });

    it('鍵盤調整進度會對播放器 seekTo(start + 秒數)，滑桿隨即顯示新位置', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        fireEvent.click(screen.getAllByRole('button', { name: '全部播放' })[0]);
        await screen.findByText('共 2 首');
        await waitFor(() => expect(FakePlayer.instances[0]?.loadVideoById).toHaveBeenCalled());
        const player = FakePlayer.instances[0];
        player.seekTo.mockClear();

        seekThumb().focus();
        fireEvent.keyDown(seekThumb(), { key: 'ArrowRight' });
        await waitFor(() => expect(player.seekTo).toHaveBeenCalledWith(11, true));
        await waitFor(() => expect(seekThumb()).toHaveAttribute('aria-valuenow', '1'));
    });

    it('分享連結載入後尚未按播放：有目前歌曲但進度滑桿仍停用，按播放後才啟用', async () => {
        renderPage({ shareCodes: ['abcd1234', 'efgh5678'], onShareConsumed: vi.fn() });
        await screen.findByText(/已載入分享的歌單（2 首）/);
        expect(screen.getByText('共 2 首')).toBeInTheDocument();
        expect(seekThumb()).toHaveAttribute('data-disabled');

        fireEvent.click(screen.getByRole('button', { name: '播放', exact: true }));
        await waitFor(() => expect(seekThumb()).not.toHaveAttribute('data-disabled'));
        expect(seekThumb()).toHaveAttribute('aria-valuemax', '190');
    });
});

// ---------- v1.3：A2 三欄控制台（左導覽／中欄三畫面／右欄正在播放／底部播放列） ----------
// 畫面切換會 pushState，每個測試前後都把網址還原成 /songs，避免互相污染
const resetUrl = () => window.history.replaceState(null, '', '/songs');

// Radix Tabs 用 mouseDown 啟動、一般按鈕用 click：兩個都送，兩種實作都能切換
const activate = (el: HTMLElement) => {
    fireEvent.mouseDown(el);
    fireEvent.click(el);
};

describe('SongsPage 三欄控制台', () => {
    beforeEach(resetUrl);
    afterEach(resetUrl);

    // v1.3 改規格：點左欄 VTuber 進該位的個人頁（歌單／歌回兩個分頁），不再就地篩選
    it('T102 點左欄 VTuber 進個人頁：歌單分頁預設選取，切到歌回分頁只剩該位，點「歌回」回完整列表', async () => {
        fetchMock.mockImplementation(async () => jsonRes(CATALOG2));
        renderPage();
        await screen.findByText('十月歌回');
        const nav = screen.getByRole('navigation', { name: '歌單導覽' });
        const group = within(nav).getByRole('group', { name: 'VTuber' });
        expect(await within(group).findByRole('button', { name: '月見測試' })).toBeInTheDocument();

        fireEvent.click(within(group).getByRole('button', { name: '星川測試' }));
        const main = screen.getByRole('main');
        expect(await within(main).findByRole('heading', { level: 2, name: '星川測試' })).toBeInTheDocument();
        const tablist = within(main).getByRole('tablist', { name: 'VTuber 分頁' });
        expect(within(tablist).getByRole('tab', { name: '歌單' })).toHaveAttribute('aria-selected', 'true');
        expect(within(group).getByRole('button', { name: '星川測試' })).toHaveAttribute('aria-current', 'page');
        expect(within(group).getByRole('button', { name: '月見測試' })).not.toHaveAttribute('aria-current');

        activate(within(tablist).getByRole('tab', { name: '歌回' }));
        expect(await within(main).findByText('十月歌回')).toBeInTheDocument();
        expect(within(main).getByText('九月歌回')).toBeInTheDocument();
        expect(within(main).queryByText('耐久歌枠')).toBeNull();

        fireEvent.click(within(nav).getByRole('link', { name: '歌回' }));
        expect(await within(main).findByText('耐久歌枠')).toBeInTheDocument();
        expect(within(main).getByText('十月歌回')).toBeInTheDocument();
        expect(within(main).getByRole('heading', { level: 2, name: '歌曲目錄' })).toBeInTheDocument();
    });

    it('T103 點歌回標題進入詳細畫面：曲目表、聊天提醒，播放後目前那首帶 aria-current', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        const catalog = screen.getByRole('region', { name: '歌曲目錄' });
        fireEvent.click(within(catalog).getByRole('button', { name: '十月歌回' }));

        const main = screen.getByRole('main');
        expect(await within(main).findByRole('heading', { level: 2, name: '十月歌回' })).toBeInTheDocument();
        expect(within(main).getByRole('button', { name: '返回歌回列表' })).toBeInTheDocument();
        expect(within(main).getByRole('note')).toHaveTextContent('直播聊天');

        const table = within(main).getByRole('table');
        const row1 = within(table).getByRole('row', { name: /夜に駆ける/ });
        const row2 = within(table).getByRole('row', { name: /紅蓮華/ });
        expect(row1).toHaveTextContent('YOASOBI');
        expect(row2).toHaveTextContent('LiSA');
        expect(row1).not.toHaveAttribute('aria-current');

        fireEvent.click(within(main).getByRole('button', { name: '播放這場歌回' }));
        await waitFor(() => expect(within(table).getByRole('row', { name: /夜に駆ける/ })).toHaveAttribute('aria-current', 'true'));
        expect(within(table).getByRole('row', { name: /紅蓮華/ })).not.toHaveAttribute('aria-current', 'true');
        expect(await screen.findByText('共 2 首')).toBeInTheDocument();
    });

    it('T104 進詳細畫面後觸發 popstate 回到列表，網址同步為 ?v=', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        const catalog = screen.getByRole('region', { name: '歌曲目錄' });
        fireEvent.click(within(catalog).getByRole('button', { name: '十月歌回' }));
        await screen.findByRole('button', { name: '返回歌回列表' });
        expect(window.location.pathname).toBe('/songs');
        expect(window.location.search).toBe('?v=aaaaaaaaaaa');

        window.history.replaceState(null, '', '/songs');
        window.dispatchEvent(new PopStateEvent('popstate'));

        expect(await screen.findByRole('heading', { level: 2, name: '歌曲目錄' })).toBeInTheDocument();
        expect(screen.queryByRole('table')).toBeNull();
        expect(screen.queryByRole('button', { name: '返回歌回列表' })).toBeNull();
    });

    describe('T105 我的歌單畫面', () => {
        const seedPlaylist = () =>
            usePlaylistStore.setState({
                playlists: [{ id: 'p1', name: '我的收藏', codes: ['abcd1234', 'efgh5678'], createdAt: 1, updatedAt: 1 }],
            });

        const openPlaylists = async () => {
            renderPage();
            await screen.findByText('十月歌回');
            const nav = screen.getByRole('navigation', { name: '歌單導覽' });
            fireEvent.click(within(within(nav).getByRole('group', { name: '我的歌單' })).getByRole('button', { name: '我的收藏' }));
            const main = screen.getByRole('main');
            await within(main).findByRole('heading', { level: 2, name: '我的歌單' });
            return main;
        };

        const openMenu = (main: HTMLElement) => {
            const trigger = within(main).getByRole('button', { name: '歌單選項' });
            trigger.focus();
            fireEvent.keyDown(trigger, { key: 'Enter' });
        };

        it('點左欄歌單進入歌單畫面並可播放歌單', async () => {
            seedPlaylist();
            const main = await openPlaylists();
            fireEvent.click(within(main).getByRole('button', { name: '播放歌單' }));
            expect(await screen.findByText('共 2 首')).toBeInTheDocument();
        });

        it('改名後歌單名稱更新', async () => {
            seedPlaylist();
            const main = await openPlaylists();
            openMenu(main);
            fireEvent.click(await screen.findByRole('menuitem', { name: '改名' }));
            fireEvent.change(within(main).getByRole('textbox', { name: '改名' }), { target: { value: '新名稱' } });
            fireEvent.click(within(main).getByRole('button', { name: '儲存' }));
            expect(usePlaylistStore.getState().playlists[0].name).toBe('新名稱');
        });

        it('刪除要經過確認對話框，確認後歌單被移除', async () => {
            seedPlaylist();
            const main = await openPlaylists();
            openMenu(main);
            fireEvent.click(await screen.findByRole('menuitem', { name: '刪除歌單' }));
            const dialog = await screen.findByRole('alertdialog');
            expect(usePlaylistStore.getState().playlists).toHaveLength(1);
            fireEvent.click(within(dialog).getByRole('button', { name: /刪除/ }));
            await waitFor(() => expect(usePlaylistStore.getState().playlists).toHaveLength(0));
        });
    });

    // v1.3 改規格：篩選改為個人頁的「歌回」分頁；返回單場後回到該分頁而且仍只有這位的歌回
    it('T110 個人頁歌回分頁進單場再按返回歌回列表，回到該位的歌回分頁', async () => {
        fetchMock.mockImplementation(async () => jsonRes(CATALOG2));
        renderPage();
        await screen.findByText('十月歌回');
        const nav = screen.getByRole('navigation', { name: '歌單導覽' });
        fireEvent.click(within(within(nav).getByRole('group', { name: 'VTuber' })).getByRole('button', { name: '星川測試' }));
        const main = screen.getByRole('main');
        const tablist = await within(main).findByRole('tablist', { name: 'VTuber 分頁' });
        activate(within(tablist).getByRole('tab', { name: '歌回' }));
        await waitFor(() => expect(within(main).getByText('九月歌回')).toBeInTheDocument());
        expect(within(main).queryByText('耐久歌枠')).toBeNull();

        fireEvent.click(within(main).getByRole('button', { name: '十月歌回' }));
        fireEvent.click(await screen.findByRole('button', { name: '返回歌回列表' }));

        expect(await within(main).findByRole('heading', { level: 2, name: '星川測試' })).toBeInTheDocument();
        await waitFor(() => expect(within(screen.getByRole('tablist', { name: 'VTuber 分頁' })).getByRole('tab', { name: '歌回' })).toHaveAttribute('aria-selected', 'true'));
        expect(within(main).getByText('十月歌回')).toBeInTheDocument();
        expect(within(main).getByText('九月歌回')).toBeInTheDocument();
        expect(within(main).queryByText('耐久歌枠')).toBeNull();
    });

    it('T107 播放／暫停按鈕與播放進度滑桿全頁只出現在底部播放列', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        fireEvent.click(screen.getAllByRole('button', { name: '全部播放' })[0]);
        await screen.findByText('共 2 首');

        const controls = screen.getByRole('region', { name: '播放控制' });
        const assertOnlyInControls = () => {
            const transport = screen.queryAllByRole('button', { name: /^(播放|暫停)$/ });
            expect(transport.length).toBeGreaterThan(0);
            for (const b of transport) expect(controls.contains(b)).toBe(true);
            const sliders = screen.getAllByRole('slider', { name: '播放進度' });
            expect(sliders).toHaveLength(1);
            expect(controls.contains(sliders[0])).toBe(true);
            const aside = screen.getByRole('complementary', { name: '正在播放' });
            expect(within(aside).queryByRole('button', { name: /^(播放|暫停)$/ })).toBeNull();
            expect(within(aside).queryByRole('slider', { name: '播放進度' })).toBeNull();
        };
        assertOnlyInControls();

        // 進入詳細畫面後也一樣
        const catalog = screen.getByRole('region', { name: '歌曲目錄' });
        fireEvent.click(within(catalog).getByRole('button', { name: '十月歌回' }));
        await screen.findByRole('button', { name: '返回歌回列表' });
        assertOnlyInControls();
        expect(within(screen.getByRole('main')).queryByRole('button', { name: /^(播放|暫停)$/ })).toBeNull();
    });
});

describe('SongsPage 手機版', () => {
    const originalMatchMedia = window.matchMedia;

    beforeEach(() => {
        resetUrl();
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: query === '(width < 64rem)',
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
        window.matchMedia = originalMatchMedia;
        resetUrl();
    });

    it('T109 用 Esc 關閉選單抽屜後焦點回到選單鈕', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        const menuButton = screen.getByRole('button', { name: '選單' });
        fireEvent.click(menuButton);
        const sheet = await screen.findByRole('dialog');
        fireEvent.keyDown(sheet, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '選單' })));
    });

    it('T106 窄螢幕有選單鈕與瀏覽／正在播放兩個分頁，播放器只有一個且不重掛，佇列只在正在播放分頁', async () => {
        renderPage();
        await screen.findByText('十月歌回');

        // 左欄收進 Sheet
        fireEvent.click(screen.getByRole('button', { name: '選單' }));
        const sheet = await screen.findByRole('dialog');
        expect(within(sheet).getByRole('navigation', { name: '歌單導覽' })).toBeInTheDocument();
        fireEvent.keyDown(sheet, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        const tablist = screen.getByRole('tablist');
        const browseTab = within(tablist).getByRole('tab', { name: '瀏覽' });
        const nowTab = within(tablist).getByRole('tab', { name: '正在播放' });

        const holders = screen.getAllByTestId('songs-player');
        expect(holders).toHaveLength(1);
        const holder = holders[0];

        fireEvent.click(screen.getAllByRole('button', { name: '全部播放' })[0]);
        await waitFor(() => expect(FakePlayer.instances.length).toBeGreaterThan(0));

        activate(nowTab);
        expect(await screen.findByRole('heading', { name: '接下來' })).toBeInTheDocument();
        expect(await screen.findByText('共 2 首')).toBeInTheDocument();
        expect(screen.getAllByTestId('songs-player')).toHaveLength(1);
        expect(screen.getByTestId('songs-player')).toBe(holder);

        activate(browseTab);
        await waitFor(() => expect(screen.queryByRole('heading', { name: '接下來' })).toBeNull());
        expect(screen.getAllByTestId('songs-player')).toHaveLength(1);
        expect(screen.getByTestId('songs-player')).toBe(holder);
        expect(holder.isConnected).toBe(true);
    });
});

// ---------- v1.3 回歸：返回鍵、載入失敗直開單場、顯示筆數還原 ----------
// 30 支歌回：偶數編號屬於星川測試(v1)、奇數屬於月見測試(v2)，每頁顯示 20 筆時需要「顯示更多」
const BIG_CATALOG = Array.from({ length: 30 }, (_, i) => ({
    v: `video${String(i).padStart(6, '0')}`,
    t: `歌回${i}`,
    d: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T12:00:00Z`,
    vt: i % 2 === 0 ? { i: 'v1', n: '星川測試', img: null } : { i: 'v2', n: '月見測試', img: null },
    s: [[`seg${String(i).padStart(5, '0')}`, 0, 100, `歌${i}`, '原唱']],
}));
const cardCount = () => screen.queryAllByRole('button', { name: '全部播放' }).length;
// 同一份 30 支歌回的新格式版本（每首歌各自一個 song_id），VTuber 個人頁才有「歌回」分頁可切
const BIG_CATALOG_V2 = [
    ...BIG_CATALOG.map((v, i) => ({ ...v, s: v.s.map((row) => [...row, 0, i + 1, null]) })),
    { songs: BIG_CATALOG.map((v, i) => [i + 1, `歌${i}`, '原唱']) },
];

describe('SongsPage 返回與載入回歸', () => {
    beforeEach(resetUrl);
    afterEach(resetUrl);

    it('T111 從列表進單場後按「返回歌回列表」呼叫 history.back，不再多推一筆', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        fireEvent.click(within(screen.getByRole('region', { name: '歌曲目錄' })).getByRole('button', { name: '十月歌回' }));
        const back = await screen.findByRole('button', { name: '返回歌回列表' });

        // jsdom 的 back 不一定觸發 popstate，這裡只驗證有呼叫
        const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
        const pushSpy = vi.spyOn(window.history, 'pushState');
        try {
            fireEvent.click(back);
            expect(backSpy).toHaveBeenCalledTimes(1);
            expect(pushSpy).not.toHaveBeenCalled();
        } finally {
            backSpy.mockRestore();
            pushSpy.mockRestore();
        }
    });

    it('T111 用 ?v= 直接開單場（頁內沒有上一筆列表）時，返回不呼叫 back，改推 /songs 並回到列表', async () => {
        window.history.replaceState(null, '', '/songs?v=bbbbbbbbbbb');
        renderPage();
        expect(await screen.findByRole('heading', { level: 2, name: '耐久歌枠' })).toBeInTheDocument();

        const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
        const pushSpy = vi.spyOn(window.history, 'pushState');
        try {
            fireEvent.click(screen.getByRole('button', { name: '返回歌回列表' }));
            expect(backSpy).not.toHaveBeenCalled();
            expect(pushSpy).toHaveBeenCalledTimes(1);
            expect(pushSpy.mock.calls[0][2]).toBe('/songs');
            expect(await screen.findByRole('heading', { level: 2, name: '歌曲目錄' })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: '返回歌回列表' })).toBeNull();
        } finally {
            backSpy.mockRestore();
            pushSpy.mockRestore();
        }
    });

    it('T113 目錄載入失敗時直接開單場，顯示錯誤與重試而不是找不到歌回，重試成功後顯示該場', async () => {
        window.history.replaceState(null, '', '/songs?v=aaaaaaaaaaa');
        // useSongCatalog 自帶重試 1 次：前兩次都失敗才會顯示錯誤
        fetchMock.mockImplementationOnce(async () => jsonRes({ ok: false }, 500)).mockImplementationOnce(async () => jsonRes({ ok: false }, 500));
        renderPage();

        expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent('暫時無法載入歌曲目錄');
        expect(screen.queryByText(/找不到/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '重試' }));
        expect(await screen.findByRole('heading', { level: 2, name: '十月歌回' })).toBeInTheDocument();
    });

    describe('T114 篩選切換與返回鍵', () => {
        // 30 支歌回約 1600 個節點，jsdom 在全套平行時單次角色查詢可達數百 ms：放寬等待上限，不改斷言
        const SLOW = { timeout: 5000 };
        beforeEach(() => {
            fetchMock.mockImplementation(async () => jsonRes(BIG_CATALOG_V2));
        });

        const loadMoreAndCount = async () => {
            await screen.findByRole('button', { name: /^顯示更多/ }, SLOW);
            expect(cardCount()).toBe(20);
            fireEvent.click(screen.getByRole('button', { name: /^顯示更多/ }));
            await waitFor(() => expect(cardCount()).toBeGreaterThan(20), SLOW);
            return cardCount();
        };

        const pickVtuber = async () => {
            const nav = screen.getByRole('navigation', { name: '歌單導覽' });
            const group = within(nav).getByRole('group', { name: 'VTuber' });
            fireEvent.click(await within(group).findByRole('button', { name: '星川測試' }, SLOW));
            // v1.3 改規格：點 VTuber 進個人頁，再切到「歌回」分頁才看得到歌回卡片
            activate(await screen.findByRole('tab', { name: '歌回' }, SLOW));
            await waitFor(() => expect(cardCount()).toBe(15), SLOW);
            return nav;
        };

        it('切換篩選後用返回鍵回到原列表，顯示筆數一起還原', async () => {
            renderPage();
            const expanded = await loadMoreAndCount();
            expect(expanded).toBe(30);

            await pickVtuber();
            window.history.replaceState(null, '', '/songs');
            window.dispatchEvent(new PopStateEvent('popstate'));

            await waitFor(() => expect(cardCount()).toBe(expanded), SLOW);
        }, 15000);

        it('點左欄「歌回」連結這種明確切換，回到未篩選列表時從頭開始只顯示 20 筆', async () => {
            renderPage();
            await loadMoreAndCount();
            const nav = await pickVtuber();

            fireEvent.click(within(nav).getByRole('link', { name: '歌回' }));
            await waitFor(() => expect(cardCount()).toBe(20), SLOW);
        }, 15000);
    });
});

describe('SongsPage 手機分頁捲動位置', () => {
    const originalMatchMedia = window.matchMedia;

    beforeEach(() => {
        resetUrl();
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: query === '(width < 64rem)',
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
        window.matchMedia = originalMatchMedia;
        resetUrl();
    });

    // 目前看得到、屬於作用中分頁的捲動區：優先在 tabpanel 內找，沒有 tabpanel 就挑不在隱藏祖先內的第一個
    const activeViewport = (): HTMLElement => {
        const panels = screen.queryAllByRole('tabpanel');
        for (const p of panels) {
            const vp = p.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
            if (vp) return vp;
        }
        const visible = Array.from(document.querySelectorAll<HTMLElement>('[data-radix-scroll-area-viewport]')).filter(
            (el) => !el.closest('[hidden],[aria-hidden="true"],[data-state="inactive"]'),
        );
        if (!visible.length) throw new Error('找不到作用中分頁的捲動區');
        return visible[0];
    };

    it('T112 手機「瀏覽」與「正在播放」兩個分頁各自記住捲動位置', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        const tablist = screen.getByRole('tablist');
        const browseTab = within(tablist).getByRole('tab', { name: '瀏覽' });
        const nowTab = within(tablist).getByRole('tab', { name: '正在播放' });

        const vp = activeViewport();
        vp.scrollTop = 500;
        fireEvent.scroll(vp);
        // 守門：jsdom 真的把值記住了，否則後面的斷言沒有意義
        expect(vp.scrollTop).toBe(500);

        activate(nowTab);
        await waitFor(() => expect(screen.getByRole('heading', { name: '接下來' })).toBeInTheDocument());
        await waitFor(() => expect(activeViewport().scrollTop).toBe(0));

        activate(browseTab);
        await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: '歌曲目錄' })).toBeInTheDocument());
        await waitFor(() => expect(activeViewport().scrollTop).toBe(500));
    });
});

// ---------- v1.3 回歸：真實瀏覽器會依內容高度夾 scrollTop，jsdom 不會 ----------
// 在測試裡模擬夾值：只對 Radix 捲動區生效，設值當下依區內 li 數量決定上限（每個 li 當 100px，可捲 li 數×100−100）
describe('SongsPage 手機分頁捲動還原（模擬瀏覽器夾值）', () => {
    const originalMatchMedia = window.matchMedia;
    const originalDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    const stored = new WeakMap<Element, number>();
    const isViewport = (el: Element) => el.hasAttribute('data-radix-scroll-area-viewport');

    beforeEach(() => {
        resetUrl();
        fetchMock.mockImplementation(async () => jsonRes(BIG_CATALOG));
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: query === '(width < 64rem)',
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })) as unknown as typeof window.matchMedia;
        Object.defineProperty(Element.prototype, 'scrollTop', {
            configurable: true,
            get(this: Element) {
                return isViewport(this) ? (stored.get(this) ?? 0) : (originalDescriptor?.get?.call(this) ?? 0);
            },
            set(this: Element, value: number) {
                if (!isViewport(this)) {
                    originalDescriptor?.set?.call(this, value);
                    return;
                }
                const max = Math.max(0, this.querySelectorAll('li').length * 100 - 100);
                stored.set(this, Math.min(max, Math.max(0, value)));
            },
        });
    });

    afterEach(() => {
        if (originalDescriptor) Object.defineProperty(Element.prototype, 'scrollTop', originalDescriptor);
        window.matchMedia = originalMatchMedia;
        resetUrl();
    });

    const activeViewport = (): HTMLElement => {
        for (const p of screen.queryAllByRole('tabpanel')) {
            const vp = p.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
            if (vp) return vp;
        }
        const visible = Array.from(document.querySelectorAll<HTMLElement>('[data-radix-scroll-area-viewport]')).filter(
            (el) => !el.closest('[hidden],[aria-hidden="true"],[data-state="inactive"]'),
        );
        if (!visible.length) throw new Error('找不到作用中分頁的捲動區');
        return visible[0];
    };

    const tabs = () => {
        const tablist = screen.getByRole('tablist');
        return {
            browse: within(tablist).getByRole('tab', { name: '瀏覽' }),
            now: within(tablist).getByRole('tab', { name: '正在播放' }),
        };
    };

    it('T115-a 切回「瀏覽」時，捲動位置在內容掛上後還原', async () => {
        renderPage();
        await waitFor(() => expect(cardCount()).toBe(20));
        const { browse, now } = tabs();

        activeViewport().scrollTop = 300;
        // 守門：夾值模擬下，列表內容夠長，300 讀得回來
        expect(activeViewport().scrollTop).toBe(300);

        activate(now);
        await waitFor(() => expect(screen.getByRole('heading', { name: '接下來' })).toBeInTheDocument());
        await waitFor(() => expect(activeViewport().scrollTop).toBe(0));

        activate(browse);
        await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: '歌曲目錄' })).toBeInTheDocument());
        await waitFor(() => expect(activeViewport().scrollTop).toBe(300));
    });

    it('T115-b 停在「正在播放」時按返回到記過的列表，切回「瀏覽」並捲回原處', async () => {
        renderPage();
        await waitFor(() => expect(cardCount()).toBe(20));
        const { now } = tabs();

        const listViewport = activeViewport();
        listViewport.scrollTop = 300;
        fireEvent.scroll(listViewport); // 真實瀏覽器捲動時會觸發 scroll 事件
        expect(activeViewport().scrollTop).toBe(300);

        // 進單場（會記下列表位置），再切到「正在播放」
        fireEvent.click(within(screen.getByRole('region', { name: '歌曲目錄' })).getByRole('button', { name: '歌回27' }));
        await screen.findByRole('button', { name: '返回歌回列表' });
        activate(now);
        await waitFor(() => expect(screen.getByRole('heading', { name: '接下來' })).toBeInTheDocument());

        window.history.replaceState(null, '', '/songs');
        window.dispatchEvent(new PopStateEvent('popstate'));

        await waitFor(() => expect(tabs().browse).toHaveAttribute('aria-selected', 'true'));
        await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: '歌曲目錄' })).toBeInTheDocument());
        await waitFor(() => expect(activeViewport().scrollTop).toBe(300));
    });
});

// ---------- v1.3 回歸：旋轉跨斷點後，手機版不可套用過期的瀏覽位置 ----------
describe('SongsPage 跨斷點捲動', () => {
    const originalMatchMedia = window.matchMedia;
    const originalDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    const stored = new WeakMap<Element, number>();
    const isViewport = (el: Element) => el.hasAttribute('data-radix-scroll-area-viewport');
    const NARROW = '(width < 64rem)';
    let narrow = true;
    const listeners = new Map<string, Set<(e: { matches: boolean }) => void>>();

    // 可切換的 matchMedia：訂閱 change（addEventListener 與舊式 addListener 都記錄），切換時呼叫所有 listener
    const setNarrow = async (next: boolean) => {
        narrow = next;
        await act(async () => {
            for (const fn of listeners.get(NARROW) ?? []) fn({ matches: next });
        });
    };

    beforeEach(() => {
        resetUrl();
        narrow = true;
        listeners.clear();
        // 歌回27 有 8 首歌：單場曲目表夠長，過期的 300 在單場畫面不會被內容高度夾掉（真實長歌回的情況）
        const catalog = BIG_CATALOG.map((v) =>
            v.v === 'video000027'
                ? { ...v, s: Array.from({ length: 8 }, (_, k) => [`sg27000${k}`, k * 100, k * 100 + 90, `長歌回第${k}首`, '原唱']) }
                : v,
        );
        fetchMock.mockImplementation(async () => jsonRes(catalog));
        window.matchMedia = vi.fn().mockImplementation((query: string) => {
            const set = listeners.get(query) ?? new Set();
            listeners.set(query, set);
            const add = (_t: string, fn: (e: { matches: boolean }) => void) => set.add(fn);
            const remove = (_t: string, fn: (e: { matches: boolean }) => void) => set.delete(fn);
            return {
                get matches() {
                    return query === NARROW ? narrow : false;
                },
                media: query,
                onchange: null,
                addEventListener: add,
                removeEventListener: remove,
                addListener: (fn: (e: { matches: boolean }) => void) => set.add(fn),
                removeListener: (fn: (e: { matches: boolean }) => void) => set.delete(fn),
                dispatchEvent: vi.fn(),
            };
        }) as unknown as typeof window.matchMedia;
        Object.defineProperty(Element.prototype, 'scrollTop', {
            configurable: true,
            get(this: Element) {
                return isViewport(this) ? (stored.get(this) ?? 0) : (originalDescriptor?.get?.call(this) ?? 0);
            },
            set(this: Element, value: number) {
                if (!isViewport(this)) {
                    originalDescriptor?.set?.call(this, value);
                    return;
                }
                const max = Math.max(0, this.querySelectorAll('li, tr').length * 100 - 100);
                stored.set(this, Math.min(max, Math.max(0, value)));
            },
        });
    });

    afterEach(() => {
        if (originalDescriptor) Object.defineProperty(Element.prototype, 'scrollTop', originalDescriptor);
        window.matchMedia = originalMatchMedia;
        resetUrl();
    });

    const currentViewport = (): HTMLElement => {
        for (const p of screen.queryAllByRole('tabpanel')) {
            const vp = p.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
            if (vp) return vp;
        }
        const visible = Array.from(document.querySelectorAll<HTMLElement>('[data-radix-scroll-area-viewport]')).filter(
            (el) => !el.closest('[hidden],[aria-hidden="true"],[data-state="inactive"]'),
        );
        if (!visible.length) throw new Error('找不到目前的捲動區');
        return visible[0];
    };

    it('T116 進單場後旋轉跨過斷點再回手機版，不套用過期的瀏覽位置', async () => {
        renderPage();
        await waitFor(() => expect(cardCount()).toBe(20));

        // 1. 在「瀏覽」把列表捲到 300
        const listViewport = currentViewport();
        listViewport.scrollTop = 300;
        fireEvent.scroll(listViewport);
        expect(currentViewport().scrollTop).toBe(300);

        // 2. 切到「正在播放」再切回「瀏覽」，瀏覽位置 300 被記下來
        const tablist = screen.getByRole('tablist');
        activate(within(tablist).getByRole('tab', { name: '正在播放' }));
        await waitFor(() => expect(screen.getByRole('heading', { name: '接下來' })).toBeInTheDocument());
        activate(within(tablist).getByRole('tab', { name: '瀏覽' }));
        await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: '歌曲目錄' })).toBeInTheDocument());
        await waitFor(() => expect(currentViewport().scrollTop).toBe(300));

        // 3. 點歌回進單場（換畫面捲回頂端）
        fireEvent.click(within(screen.getByRole('region', { name: '歌曲目錄' })).getByRole('button', { name: '歌回27' }));
        await screen.findByRole('button', { name: '返回歌回列表' });
        await waitFor(() => expect(currentViewport().scrollTop).toBe(0));

        // 4. 旋轉：先變桌機版（沒有分頁），再回手機版
        await setNarrow(false);
        await waitFor(() => expect(screen.queryByRole('tablist')).toBeNull());
        await setNarrow(true);
        await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
        await act(async () => {
            await new Promise((r) => setTimeout(r, 50));
        });

        // 5. 現在顯示的是單場，不該回到列表的 300
        expect(screen.getByRole('button', { name: '返回歌回列表' })).toBeInTheDocument();
        expect(currentViewport().scrollTop).toBe(0);
    });
});

// ---------- v1.3：VTuber 個人頁、單曲頁、單場曲目表的版本入口 ----------
describe('SongsPage 個人頁與單曲頁', () => {
    beforeEach(() => {
        resetUrl();
        fetchMock.mockImplementation(async () => jsonRes(CATALOG2));
    });
    afterEach(resetUrl);

    const mainEl = () => screen.getByRole('main');
    // 點左欄 VTuber 進個人頁（歌單分頁）
    const openProfile = async (name: string) => {
        renderPage();
        await screen.findByText('十月歌回');
        const nav = screen.getByRole('navigation', { name: '歌單導覽' });
        fireEvent.click(within(within(nav).getByRole('group', { name: 'VTuber' })).getByRole('button', { name }));
        await within(mainEl()).findByRole('heading', { level: 2, name });
    };
    const rowOf = (title: string): HTMLElement => {
        const li = within(mainEl()).getByRole('button', { name: title }).closest('li');
        if (!li) throw new Error(`找不到「${title}」所在的 li`);
        return li;
    };

    it('T117 歌單分頁每首一列並顯示版本數，點歌名進單曲頁且網址帶 song 與 from', async () => {
        await openProfile('星川測試');
        // 星川唱過夜に駆ける 2 次、紅蓮華 1 次；小幸運是月見的歌不在這裡
        expect(rowOf('夜に駆ける')).toHaveTextContent('2 個版本');
        expect(rowOf('紅蓮華')).toHaveTextContent('1 個版本');
        expect(rowOf('夜に駆ける')).toHaveTextContent('YOASOBI');
        expect(within(mainEl()).queryByRole('button', { name: '小幸運' })).toBeNull();
        expect(within(mainEl()).getAllByRole('listitem').filter((li) => li.querySelector('button'))).toHaveLength(2);

        fireEvent.click(within(mainEl()).getByRole('button', { name: '夜に駆ける' }));
        expect(await within(mainEl()).findByRole('heading', { level: 2, name: '夜に駆ける' })).toBeInTheDocument();
        expect(window.location.search).toBe('?song=1&from=v1');
    });

    it('T118 單曲頁依 VTuber 分組，from 那位排第一；沒有 from 時版本多的在前', async () => {
        window.history.replaceState(null, '', '/songs?song=1&from=v2');
        renderPage();
        expect(await screen.findByRole('heading', { level: 2, name: '夜に駆ける' })).toBeInTheDocument();
        expect(screen.getByRole('main')).toHaveTextContent('3 個版本・2 位 VTuber');
        const h3 = () => within(screen.getByRole('main')).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
        expect(h3()).toEqual(['月見測試', '星川測試']);
        const hoshi = within(screen.getByRole('main')).getByRole('region', { name: '星川測試' });
        expect(within(hoshi).getAllByRole('listitem')).toHaveLength(2);
        expect(within(within(screen.getByRole('main')).getByRole('region', { name: '月見測試' })).getAllByRole('listitem')).toHaveLength(1);

        // 沒有 from：星川 2 個版本排在月見 1 個版本前面
        cleanup();
        window.history.replaceState(null, '', '/songs?song=1');
        renderPage();
        await screen.findByRole('heading', { level: 2, name: '夜に駆ける' });
        expect(h3()).toEqual(['星川測試', '月見測試']);
    });

    it('T119 每個版本顯示來源歌回、日期、備註標籤；點來源進單場；播放這個版本後該列帶 aria-current', async () => {
        window.history.replaceState(null, '', '/songs?song=1&from=v1');
        renderPage();
        await screen.findByRole('heading', { level: 2, name: '夜に駆ける' });
        const main = screen.getByRole('main');
        const hoshi = within(main).getByRole('region', { name: '星川測試' });
        const tsuki = within(main).getByRole('region', { name: '月見測試' });

        const oct = within(hoshi).getByRole('button', { name: '十月歌回' }).closest('li') as HTMLElement;
        expect(oct).toHaveTextContent('2026/10/01');
        expect(oct).not.toHaveTextContent('練歌版');
        const endurance = within(tsuki).getByRole('button', { name: '耐久歌枠' }).closest('li') as HTMLElement;
        expect(endurance).toHaveTextContent('2026/09/15');
        expect(endurance).toHaveTextContent('練歌版');

        fireEvent.click(within(oct).getByRole('button', { name: '播放這個版本' }));
        await waitFor(() => expect(oct).toHaveAttribute('aria-current', 'true'));
        expect(endurance).not.toHaveAttribute('aria-current', 'true');

        fireEvent.click(within(endurance).getByRole('button', { name: '耐久歌枠' }));
        expect(await screen.findByRole('heading', { level: 2, name: '耐久歌枠' })).toBeInTheDocument();
        expect(window.location.search).toBe('?v=bbbbbbbbbbb');
    });

    it('T120 從個人頁進單曲頁按「返回」呼叫 history.back', async () => {
        await openProfile('星川測試');
        fireEvent.click(within(mainEl()).getByRole('button', { name: '夜に駆ける' }));
        const back = await screen.findByRole('button', { name: '返回' });

        const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
        try {
            fireEvent.click(back);
            expect(backSpy).toHaveBeenCalledTimes(1);
        } finally {
            backSpy.mockRestore();
        }
    });

    it('T120 直接開 ?song=&from= 時按「返回」導到 from 的個人頁', async () => {
        window.history.replaceState(null, '', '/songs?song=1&from=v1');
        renderPage();
        const back = await screen.findByRole('button', { name: '返回' });

        const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
        try {
            fireEvent.click(back);
            expect(backSpy).not.toHaveBeenCalled();
            expect(await screen.findByRole('heading', { level: 2, name: '星川測試' })).toBeInTheDocument();
            expect(window.location.search).toBe('?vtuber=v1');
        } finally {
            backSpy.mockRestore();
        }
    });

    it('T121 舊格式目錄沒有字典：個人頁沒有歌單分頁、只有歌回；?song= 顯示找不到這首歌', async () => {
        fetchMock.mockImplementation(async () => jsonRes(CATALOG));
        await openProfile('星川測試');
        expect(within(mainEl()).queryByRole('tab', { name: '歌單' })).toBeNull();
        expect(within(mainEl()).getByText('十月歌回')).toBeInTheDocument();
        expect(within(mainEl()).queryByText('耐久歌枠')).toBeNull();

        cleanup();
        window.history.replaceState(null, '', '/songs?song=1');
        renderPage();
        expect(await screen.findByText('找不到這首歌')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '返回歌回列表' })).toBeInTheDocument();
    });

    it('T122 不存在的 VTuber 與歌曲顯示找不到，並可返回歌回列表', async () => {
        window.history.replaceState(null, '', '/songs?vtuber=' + encodeURIComponent('不存在'));
        renderPage();
        expect(await screen.findByText('找不到這位 VTuber')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '返回歌回列表' }));
        expect(await screen.findByRole('heading', { level: 2, name: '歌曲目錄' })).toBeInTheDocument();

        cleanup();
        window.history.replaceState(null, '', '/songs?song=99999');
        renderPage();
        expect(await screen.findByText('找不到這首歌')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '返回歌回列表' }));
        expect(await screen.findByRole('heading', { level: 2, name: '歌曲目錄' })).toBeInTheDocument();
    });

    it('T123 單場曲目表顯示備註標籤；版本數 ≥2 的歌有「N 個版本」按鈕可進單曲頁，只有 1 個版本的沒有', async () => {
        window.history.replaceState(null, '', '/songs?v=bbbbbbbbbbb');
        renderPage();
        await screen.findByRole('heading', { level: 2, name: '耐久歌枠' });
        const table = within(screen.getByRole('main')).getByRole('table');
        const yoru = within(table).getByRole('row', { name: /夜に駆ける/ });
        const koukou = within(table).getByRole('row', { name: /小幸運/ });
        expect(yoru).toHaveTextContent('練歌版');
        expect(koukou).not.toHaveTextContent('練歌版');
        expect(within(koukou).queryByRole('button', { name: /個版本/ })).toBeNull();

        fireEvent.click(within(yoru).getByRole('button', { name: '3 個版本' }));
        expect(await screen.findByRole('heading', { level: 2, name: '夜に駆ける' })).toBeInTheDocument();
        expect(window.location.search).toBe('?song=1&from=v2');
    });

    it('T125 從列表進單場、再從曲目表「N 個版本」進單曲頁，按「返回」呼叫 history.back 回到那一場', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        fireEvent.click(within(screen.getByRole('region', { name: '歌曲目錄' })).getByRole('button', { name: '十月歌回' }));
        await screen.findByRole('heading', { level: 2, name: '十月歌回' });
        const table = within(screen.getByRole('main')).getByRole('table');
        fireEvent.click(within(within(table).getByRole('row', { name: /夜に駆ける/ })).getByRole('button', { name: '3 個版本' }));
        const back = await screen.findByRole('button', { name: '返回' });

        // 兩筆歷史都是頁內推入的：返回要用 back，不能再多推一筆
        const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
        const pushSpy = vi.spyOn(window.history, 'pushState');
        try {
            fireEvent.click(back);
            expect(backSpy).toHaveBeenCalledTimes(1);
            expect(pushSpy).not.toHaveBeenCalled();
        } finally {
            backSpy.mockRestore();
            pushSpy.mockRestore();
        }
    });
});

describe('SongsPage 手機版個人頁', () => {
    const originalMatchMedia = window.matchMedia;

    beforeEach(() => {
        resetUrl();
        fetchMock.mockImplementation(async () => jsonRes(CATALOG2));
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: query === '(width < 64rem)',
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
        window.matchMedia = originalMatchMedia;
        resetUrl();
    });

    it('T124 在抽屜點 VTuber 進個人頁、抽屜關閉、焦點落在個人頁 h2', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        fireEvent.click(screen.getByRole('button', { name: '選單' }));
        const sheet = await screen.findByRole('dialog');
        const group = within(sheet).getByRole('group', { name: 'VTuber' });
        fireEvent.click(await within(group).findByRole('button', { name: '星川測試' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        const h2 = await screen.findByRole('heading', { level: 2, name: '星川測試' });
        await waitFor(() => expect(document.activeElement).toBe(h2));
    });
});

// ---------- v1.3 回歸：個人頁排序記憶、跨 VTuber 返回的捲動還原、直開單場後的返回 ----------
describe('SongsPage 個人頁與單曲頁回歸（排序、捲動、返回）', () => {
    const SLOW = { timeout: 5000 };
    const originalDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    const stored = new WeakMap<Element, number>();
    const isViewport = (el: Element) => el.hasAttribute('data-radix-scroll-area-viewport');

    beforeEach(() => {
        resetUrl();
        fetchMock.mockImplementation(async () => jsonRes(CATALOG2));
    });
    afterEach(() => {
        if (originalDescriptor) Object.defineProperty(Element.prototype, 'scrollTop', originalDescriptor);
        resetUrl();
    });

    const openVtuber = async (name: string) => {
        const nav = screen.getByRole('navigation', { name: '歌單導覽' });
        fireEvent.click(await within(within(nav).getByRole('group', { name: 'VTuber' })).findByRole('button', { name }, SLOW));
        return screen.findByRole('heading', { level: 2, name }, SLOW);
    };

    it('T126 個人頁歌單選「最常唱」後進單曲頁再返回，排序仍是最常唱', async () => {
        // 星川：「新歌」只唱過 1 次但最新，「多版本歌」唱過 2 次但較舊 → 最新與最常唱的順序相反
        const catalog = [
            {
                v: 'aaaaaaaaaaa', t: '新歌回', d: '2026-10-20T12:00:00Z', vt: { i: 'v1', n: '星川測試', img: null },
                s: [['aaaaaaa1', 0, 100, '新歌', null, 0, 11, null]],
            },
            {
                v: 'bbbbbbbbbbb', t: '舊歌回一', d: '2026-09-01T12:00:00Z', vt: { i: 'v1', n: '星川測試', img: null },
                s: [['bbbbbbb1', 0, 100, '多版本歌', null, 0, 12, null]],
            },
            {
                v: 'ccccccccccc', t: '舊歌回二', d: '2026-08-01T12:00:00Z', vt: { i: 'v1', n: '星川測試', img: null },
                s: [['ccccccc1', 0, 100, '多版本歌', null, 0, 12, null]],
            },
            { songs: [[11, '新歌', null], [12, '多版本歌', null]] },
        ];
        fetchMock.mockImplementation(async () => jsonRes(catalog));
        renderPage();
        await screen.findByText('新歌回');
        await openVtuber('星川測試');
        const main = screen.getByRole('main');
        const order = () =>
            within(main).getAllByRole('button', { name: /^(新歌|多版本歌)$/ }).map((b) => b.textContent);

        fireEvent.click(within(main).getByRole('button', { name: '最常唱' }));
        await waitFor(() => expect(within(main).getByRole('button', { name: '最常唱' })).toHaveAttribute('aria-pressed', 'true'));
        expect(order()).toEqual(['多版本歌', '新歌']);

        fireEvent.click(within(main).getByRole('button', { name: '多版本歌' }));
        await screen.findByRole('heading', { level: 2, name: '多版本歌' });

        // 模擬瀏覽器返回到個人頁
        window.history.replaceState(null, '', '/songs?vtuber=v1');
        window.dispatchEvent(new PopStateEvent('popstate'));

        await screen.findByRole('heading', { level: 2, name: '星川測試' });
        expect(within(screen.getByRole('main')).getByRole('button', { name: '最常唱' })).toHaveAttribute('aria-pressed', 'true');
        expect(order()).toEqual(['多版本歌', '新歌']);
    }, 15000);

    // T127b：A 的 15 場歌回都唱同一首歌 → A 歌單只有 1 列（很矮）、歌回分頁有 15 張卡（很高）
    const SHORT_PLAYLIST_CATALOG = [
        ...BIG_CATALOG.map((v, i) => ({ ...v, s: v.s.map((row) => [...row, 0, i % 2 === 0 ? 1000 : i + 1, null]) })),
        { songs: [[1000, '共同曲', '原唱'], ...BIG_CATALOG.filter((_, i) => i % 2 === 1).map((v) => [BIG_CATALOG.indexOf(v) + 1, `歌${BIG_CATALOG.indexOf(v)}`, '原唱'])] },
    ];
    it.each([
        ['T127 桌機版', false, BIG_CATALOG_V2],
        ['T127 手機版', true, BIG_CATALOG_V2],
        ['T127b 桌機版（A 歌單只有 1 列）', false, SHORT_PLAYLIST_CATALOG],
        ['T127b 手機版（A 歌單只有 1 列）', true, SHORT_PLAYLIST_CATALOG],
    ])('%s：從 A 的歌回分頁換到 B 再返回，A 歌回分頁的捲動位置還原', async (_label, narrow, catalogData) => {
        const originalMatchMedia = window.matchMedia;
        if (narrow) {
            window.matchMedia = vi.fn().mockImplementation((query: string) => ({
                matches: query === '(width < 64rem)',
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })) as unknown as typeof window.matchMedia;
        }
        try {
        fetchMock.mockImplementation(async () => jsonRes(catalogData));
        // 夾值：只對 Radix 捲動區生效，依區內 li／tr 數量決定上限（每個當 100px，可捲 數量×100−100）
        Object.defineProperty(Element.prototype, 'scrollTop', {
            configurable: true,
            get(this: Element) {
                return isViewport(this) ? (stored.get(this) ?? 0) : (originalDescriptor?.get?.call(this) ?? 0);
            },
            set(this: Element, value: number) {
                if (!isViewport(this)) {
                    originalDescriptor?.set?.call(this, value);
                    return;
                }
                const max = Math.max(0, this.querySelectorAll('li, tr').length * 100 - 100);
                stored.set(this, Math.min(max, Math.max(0, value)));
            },
        });
        // 目前個人頁 h2 所在的捲動區
        const viewportOf = (h2: HTMLElement): HTMLElement => {
            const vp = Array.from(document.querySelectorAll<HTMLElement>('[data-radix-scroll-area-viewport]')).find((v) => v.contains(h2));
            if (!vp) throw new Error('找不到中欄捲動區');
            return vp;
        };

        const pick = async (name: string) => {
            if (!narrow) return openVtuber(name);
            fireEvent.click(screen.getByRole('button', { name: '選單' }));
            const sheet = await screen.findByRole('dialog');
            fireEvent.click(await within(within(sheet).getByRole('group', { name: 'VTuber' })).findByRole('button', { name }, SLOW));
            return screen.findByRole('heading', { level: 2, name }, SLOW);
        };
        renderPage();
        await screen.findByRole('button', { name: /^顯示更多/ }, SLOW);
        const h2A = await pick('星川測試');
        activate(await screen.findByRole('tab', { name: '歌回' }, SLOW));
        await waitFor(() => expect(cardCount()).toBe(15), SLOW);

        const vp = viewportOf(h2A);
        vp.scrollTop = 300;
        fireEvent.scroll(vp);
        // 守門：15 場歌回夠高，夾值模擬下 300 讀得回來
        expect(vp.scrollTop).toBe(300);

        // 換到 B（歌單分頁），再模擬瀏覽器返回到 A 的歌回分頁
        await pick('月見測試');
        window.history.replaceState(null, '', '/songs?vtuber=v1&tab=videos');
        window.dispatchEvent(new PopStateEvent('popstate'));

        const h2Back = await screen.findByRole('heading', { level: 2, name: '星川測試' }, SLOW);
        await waitFor(() => expect(cardCount()).toBe(15), SLOW);
        await waitFor(() => expect(viewportOf(h2Back).scrollTop).toBe(300), SLOW);
            } finally {
            window.matchMedia = originalMatchMedia;
        }
    }, 20000);

    it('T128 直接開單場、進單曲頁再返回後，按「返回歌回列表」回到列表', async () => {
        window.history.replaceState(null, '', '/songs?v=aaaaaaaaaaa');
        renderPage();
        await screen.findByRole('heading', { level: 2, name: '十月歌回' });
        const table = within(screen.getByRole('main')).getByRole('table');
        fireEvent.click(within(within(table).getByRole('row', { name: /夜に駆ける/ })).getByRole('button', { name: '3 個版本' }));
        const back = await screen.findByRole('button', { name: '返回' });

        // jsdom 的 back 不一定觸發 popstate：自己把網址退回 ?v= 並送出 popstate
        const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
            window.history.replaceState(null, '', '/songs?v=aaaaaaaaaaa');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        try {
            fireEvent.click(back);
            expect(backSpy).toHaveBeenCalledTimes(1);
            await screen.findByRole('heading', { level: 2, name: '十月歌回' });
            // 之後的返回不該再去呼叫 back（頁內已經沒有上一筆列表）
            backSpy.mockImplementation(() => {});
            fireEvent.click(screen.getByRole('button', { name: '返回歌回列表' }));
            expect(await screen.findByRole('heading', { level: 2, name: '歌曲目錄' })).toBeInTheDocument();
            expect(window.location.search).not.toContain('song=');
        } finally {
            backSpy.mockRestore();
        }
    });
});
