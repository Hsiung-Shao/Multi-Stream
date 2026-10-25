// 歌曲播放清單頁：殼層標題、目錄載入／空目錄／失敗重試、client 搜尋、播放進佇列、分享連結載入與另存歌單
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
        // 目錄、佇列、正在播放各一份
        expect(screen.getAllByText('夜に駆ける')).toHaveLength(3);
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
