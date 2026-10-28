// 歌曲目錄的單曲類型：單曲卡片有「單曲」徽章，目錄篩選「全部／歌回／單曲」
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../src/i18n/i18n';

vi.mock('../../src/utils/analytics', () => ({ logEvent: vi.fn(), track: { songPlaylistCreate: vi.fn(), songPlaylistAdd: vi.fn(), songPlaylistPlay: vi.fn() } }));
vi.mock('../../src/utils/apiLoader', () => ({ apiLoader: { loadYouTubePlayerApi: vi.fn(async () => undefined) } }));

import { SongsPage } from '../../src/components/Pages/SongsPage';
import { usePlaylistStore } from '../../src/features/songs/store/usePlaylistStore';

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

// 一支歌回（k=stream，2 首）＋一支單曲（k=single，1 首）
const CATALOG = [
    {
        v: 'aaaaaaaaaaa', t: '十月歌回', d: '2026-10-01T12:00:00Z', vt: { i: 'v1', n: '星川測試', img: null }, k: 'stream',
        s: [['abcd1234', 10, 200, '夜に駆ける', 'YOASOBI'], ['efgh5678', 200, 400, '紅蓮華', 'LiSA']],
    },
    {
        v: 'bbbbbbbbbbb', t: '翻唱短片', d: '2026-09-15T12:00:00Z', vt: { i: 'v2', n: '月見測試', img: null }, k: 'single',
        s: [['ijkl9012', 0, 180, '小幸運', '田馥甄']],
    },
];

const jsonRes = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <SongsPage />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(CATALOG)));
    (window as unknown as { YT: unknown }).YT = { Player: FakePlayer };
    usePlaylistStore.setState({ playlists: [] });
});

afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as { YT?: unknown }).YT;
});

const catalogRegion = () => screen.getByRole('region', { name: '歌曲目錄' });
const filterButton = (name: '全部' | '歌回' | '單曲') => within(catalogRegion()).getByRole('button', { name });
const cardOf = (title: string) => within(catalogRegion()).getByRole('button', { name: title }).closest('li') as HTMLElement;

describe('SongsPage 單曲類型（C8）', () => {
    it('單曲那張卡片有「單曲」徽章，歌回那張沒有', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        expect(within(cardOf('翻唱短片')).getByText('單曲')).toBeInTheDocument();
        expect(within(cardOf('十月歌回')).queryByText('單曲')).toBeNull();
    });

    it('預設「全部」是按下狀態，兩張卡片都在', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        expect(filterButton('全部')).toHaveAttribute('aria-pressed', 'true');
        expect(filterButton('歌回')).toHaveAttribute('aria-pressed', 'false');
        expect(filterButton('單曲')).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByText('翻唱短片')).toBeInTheDocument();
        expect(screen.getByText('十月歌回')).toBeInTheDocument();
    });

    it('按篩選「單曲」只剩單曲那張', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        fireEvent.click(filterButton('單曲'));
        await waitFor(() => expect(screen.queryByText('十月歌回')).toBeNull());
        expect(screen.getByText('翻唱短片')).toBeInTheDocument();
        expect(filterButton('單曲')).toHaveAttribute('aria-pressed', 'true');
        expect(filterButton('全部')).toHaveAttribute('aria-pressed', 'false');
    });

    it('按篩選「歌回」只剩歌回那張', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        fireEvent.click(filterButton('歌回'));
        await waitFor(() => expect(screen.queryByText('翻唱短片')).toBeNull());
        expect(screen.getByText('十月歌回')).toBeInTheDocument();
        expect(filterButton('歌回')).toHaveAttribute('aria-pressed', 'true');
    });

    it('篩選後再按「全部」兩張都回來', async () => {
        renderPage();
        await screen.findByText('十月歌回');
        fireEvent.click(filterButton('單曲'));
        await waitFor(() => expect(screen.queryByText('十月歌回')).toBeNull());
        fireEvent.click(filterButton('全部'));
        expect(await screen.findByText('十月歌回')).toBeInTheDocument();
        expect(screen.getByText('翻唱短片')).toBeInTheDocument();
    });
});
