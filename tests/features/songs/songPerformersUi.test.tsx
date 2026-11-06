// 歌回合唱成員＋剪輯來源（前台顯示）：TrackTable 合唱 chip（FE4）、VideoCard 剪輯來源（FE5）、個人頁「合唱」分頁（FE6）
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../src/i18n/i18n';

vi.mock('../../../src/utils/analytics', () => ({ logEvent: vi.fn(), track: { songPlaylistCreate: vi.fn(), songPlaylistAdd: vi.fn(), songPlaylistPlay: vi.fn() } }));
vi.mock('../../../src/utils/apiLoader', () => ({ apiLoader: { loadYouTubePlayerApi: vi.fn(async () => undefined) } }));

import { SongsPage } from '../../../src/components/Pages/SongsPage';
import { TrackTable } from '../../../src/features/songs/components/console/TrackTable';
import { VideoCard } from '../../../src/features/songs/components/console/VideoCard';
import { parseSongCatalog } from '../../../src/features/songs/songsSource';
import { usePlaylistStore } from '../../../src/features/songs/store/usePlaylistStore';

// jsdom 的 navigator.language 是 en-US：鎖定 zh-TW，斷言對著實際繁中文案
beforeAll(async () => {
    await i18n.changeLanguage('zh-TW');
});

const DICT = { songs: [[1, '夜に駆ける', 'YOASOBI'], [2, '紅蓮華', 'LiSA']] };
/** 星川的歌回：第一首有兩位合唱者（站內「合唱專員」＋站外「站外歌手」），第二首沒有 */
const CATALOG = [
    {
        v: 'aaaaaaaaaaa', t: '星川的歌回', d: '2026-10-01T12:00:00Z', vt: { i: 'v1', n: '星川測試', img: null },
        cs: { n: '剪輯頻道', u: 'https://www.youtube.com/@clipper' },
        s: [
            ['abcd1234', 10, 200, '夜に駆ける', 'YOASOBI', 0, 1, null, [['v3', '合唱專員'], [null, '站外歌手']]],
            ['efgh5678', 200, 400, '紅蓮華', 'LiSA', 0, 2, null, []],
        ],
    },
    DICT,
];

const videoOf = (catalog: unknown[] = CATALOG) => parseSongCatalog(catalog)[0];
const noop = () => {};

// ---------- FE4：TrackTable ----------
describe('FE4 TrackTable 合唱者', () => {
    const renderTable = (onOpenVtuber = vi.fn()) => {
        const props = {
            video: videoOf(), currentCode: null, playlists: [], songIndex: null,
            onPlaySong: noop, onQueue: noop, onOpenSong: noop, onOpenVtuber,
        };
        render(<TrackTable {...(props as unknown as Parameters<typeof TrackTable>[0])} />);
        return onOpenVtuber;
    };
    const rowOf = (title: string) => screen.getByText(title).closest('tr') as HTMLElement;

    it('FE4 有合唱者的列以「合唱：」列出站內與站外名字', () => {
        renderTable();
        const row = rowOf('夜に駆ける');
        expect(row).toHaveTextContent('合唱：');
        expect(within(row).getByText('合唱專員')).toBeInTheDocument();
        expect(within(row).getByText('站外歌手')).toBeInTheDocument();
    });

    it('FE4 站內合唱者是按鈕，點了以 vtuberId 呼叫 onOpenVtuber', () => {
        const onOpen = renderTable();
        fireEvent.click(screen.getByRole('button', { name: '前往 合唱專員 的頁面' }));
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onOpen).toHaveBeenCalledWith('v3');
    });

    it('FE4 站外合唱者只是文字，不是按鈕也不是連結', () => {
        renderTable();
        const el = screen.getByText('站外歌手');
        expect(el.closest('button')).toBeNull();
        expect(el.closest('a')).toBeNull();
        expect(screen.queryByRole('button', { name: /前往 站外歌手/ })).toBeNull();
    });

    it('FE4 沒有合唱者的列不顯示「合唱：」', () => {
        renderTable();
        expect(rowOf('紅蓮華')).not.toHaveTextContent('合唱');
    });
});

// ---------- FE5：VideoCard ----------
describe('FE5 VideoCard 剪輯來源', () => {
    const renderCard = (video = videoOf()) =>
        render(
            <ul>
                <VideoCard video={video} playlists={[]} locale="zh-TW" onPlaySong={noop} onPlayAll={noop} onQueue={noop} onOpen={noop} />
            </ul>,
        );

    it('FE5 有剪輯來源時卡片顯示「剪輯：名稱」外連，href、target、rel 正確', () => {
        renderCard();
        const link = screen.getByRole('link', { name: /^剪輯：\s*剪輯頻道$/ });
        expect(link).toHaveAttribute('href', 'https://www.youtube.com/@clipper');
        expect(link).toHaveAttribute('target', '_blank');
        const rel = (link.getAttribute('rel') ?? '').split(/\s+/);
        expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer', 'nofollow']));
    });

    it('FE5 本人上傳（沒有剪輯來源）時卡片不顯示「剪輯：」', () => {
        const [video] = parseSongCatalog([{ ...CATALOG[0], cs: undefined }, DICT]);
        renderCard(video);
        expect(screen.getByRole('button', { name: '星川的歌回' })).toBeInTheDocument();
        expect(screen.queryByText(/剪輯：/)).toBeNull();
    });
});

// ---------- FE4／FE6：整頁（SongsPage） ----------
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

const resetUrl = () => window.history.replaceState(null, '', '/songs');
// Radix Tabs 用 mouseDown 啟動、一般按鈕用 click：兩個都送
const activate = (el: HTMLElement) => {
    fireEvent.mouseDown(el);
    fireEvent.click(el);
};

describe('SongsPage 合唱整合', () => {
    beforeEach(() => {
        resetUrl();
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(CATALOG), { status: 200, headers: { 'Content-Type': 'application/json' } })));
        (window as unknown as { YT: unknown }).YT = { Player: FakePlayer };
        usePlaylistStore.setState({ playlists: [] });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        delete (window as unknown as { YT?: unknown }).YT;
        resetUrl();
    });

    const renderPage = () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        return render(
            <QueryClientProvider client={client}>
                <SongsPage />
            </QueryClientProvider>,
        );
    };
    const vtuberGroup = () => within(screen.getByRole('navigation', { name: '歌單導覽' })).getByRole('group', { name: 'VTuber' });

    it('FE4 單場曲目表點站內合唱者，導到該 VTuber 的個人頁', async () => {
        renderPage();
        await screen.findByText('星川的歌回');
        fireEvent.click(within(screen.getByRole('region', { name: '歌曲目錄' })).getByRole('button', { name: '星川的歌回' }));
        const main = screen.getByRole('main');
        await within(main).findByRole('heading', { level: 2, name: '星川的歌回' });

        fireEvent.click(within(within(main).getByRole('table')).getByRole('button', { name: '前往 合唱專員 的頁面' }));

        expect(await within(main).findByRole('heading', { level: 2, name: '合唱專員' })).toBeInTheDocument();
        expect(window.location.search).toContain('vtuber=v3');
    });

    it('FE6 只當合唱者的 VTuber 也在左欄清單，點進去有「合唱」分頁且只列他參與的片段', async () => {
        renderPage();
        await screen.findByText('星川的歌回');
        fireEvent.click(await within(vtuberGroup()).findByRole('button', { name: '合唱專員' }));
        const main = screen.getByRole('main');
        expect(await within(main).findByRole('heading', { level: 2, name: '合唱專員' })).toBeInTheDocument();

        const tablist = within(main).getByRole('tablist', { name: 'VTuber 分頁' });
        activate(within(tablist).getByRole('tab', { name: '合唱' }));

        await waitFor(() => expect(within(main).getByText('夜に駆ける')).toBeInTheDocument());
        // 同一場的另一首（他沒參與）不應出現
        expect(within(main).queryByText('紅蓮華')).toBeNull();
    });

    it('FE6 沒有合唱資料的 VTuber 個人頁不顯示「合唱」分頁', async () => {
        renderPage();
        await screen.findByText('星川的歌回');
        fireEvent.click(await within(vtuberGroup()).findByRole('button', { name: '星川測試' }));
        const main = screen.getByRole('main');
        const tablist = await within(main).findByRole('tablist', { name: 'VTuber 分頁' });
        expect(within(tablist).getByRole('tab', { name: '歌單' })).toBeInTheDocument();
        expect(within(tablist).queryByRole('tab', { name: '合唱' })).toBeNull();
    });
});
