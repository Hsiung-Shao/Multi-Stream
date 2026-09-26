// 畫布導覽（2026-09 版面重設計）：使用者回報「不知道怎麼調整」，拖曳／換位／縮放／放大原本都藏在 hover 或快捷鍵後面；
// 之後要求導覽更完整、一進畫布就顯示：歡迎頁 → 視窗操作 → 聊天室／空視窗（有才顯示）→ 動態島 → 操作一覽。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import i18n from '../../src/i18n/i18n';
import { CanvasTour, CANVAS_TOUR_DONE_KEY, CANVAS_TOUR_INTRO_DONE_KEY, TOUR_SEARCH_DEMO, resetCanvasTourSessionForTest } from '../../src/components/Canvas/CanvasTour';
import { useStreamStore } from '../../src/store/useStreamStore';
import { useUIStore } from '../../src/store/useUIStore';
import { setTrackingConsent } from '../../src/utils/analytics';

const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
/** 搜尋框的共同結構（StreamSearchBox／IslandSearch 都是 form 裡的平台鈕＋input） */
const SEARCH_BOX = '<form><button data-search-platform></button><input /></form>';

/** 導覽只靠 DOM 屬性找目標；這裡手工放出與畫布相同的屬性結構 */
function fakeWindow(id: string) {
    const el = document.createElement('div');
    el.setAttribute('data-canvas-window-id', id);
    el.innerHTML = '<div data-window-toolbar="stream"><button data-tour="theater"></button><button data-tour="reload"></button><button data-tour="remove"></button></div><div data-corner="se"></div>';
    document.body.appendChild(el);
    return el;
}

/** 一般型態動態島：導覽用 data-tour / data-island-fn 找目標 */
function fakeIsland() {
    const el = document.createElement('div');
    el.setAttribute('data-tour', 'island');
    el.innerHTML = '<div data-tour="island-search">' + SEARCH_BOX + '</div>'
        + ['add', 'layout', 'media', 'fav', 'save', 'share', 'screen', 'clear', 'help', 'home', 'settings']
            .map(fn => `<button data-island-fn="${fn}"></button>`).join('');
    document.body.appendChild(el);
}

const spotlight = () => document.querySelector('[data-canvas-tour] .border-indigo-300');
const clickNext = () => fireEvent.click([...document.querySelectorAll('[data-canvas-tour] button')].pop()!);
const title = () => document.getElementById('canvas-tour-title')?.textContent;
const start = () => act(() => { vi.advanceTimersByTime(1600); });

function setStreams(n: number) {
    useStreamStore.setState({
        canvasItems: Array.from({ length: n }, (_, i) => ({
            i: `w${i + 1}`, type: 'stream' as const, contentId: i + 1, layout: L(i * 10, 0, 10, 10),
        })),
    });
    for (let i = 1; i <= n; i++) fakeWindow(`w${i}`);
}

const ISLAND_TITLES = [
    '下方的動態島：所有主要功能都在這', '方法二：搜尋頻道', '切換搜尋 Twitch 或 YouTube', '新增視窗', '一鍵切換版面',
    '媒體控制', '收藏、儲存與分享', '全螢幕、清空與設定', '忘了怎麼操作？',
];

/** 空畫布中央的大搜尋框（導覽第一段的貼連結／搜尋／平台都在這裡示範） */
function fakeQuickAdd() {
    const el = document.createElement('div');
    el.setAttribute('data-tour', 'quick-add');
    el.innerHTML = SEARCH_BOX;
    document.body.appendChild(el);
}
const centerInput = () => document.querySelector<HTMLInputElement>('[data-tour="quick-add"] input')!;
const islandInput = () => document.querySelector<HTMLInputElement>('[data-tour="island-search"] input')!;

describe('CanvasTour', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        vi.useFakeTimers();
        localStorage.clear();
        // 已回應過 Cookie 橫幅（否則導覽會等橫幅關掉才開始，見專屬測試）
        localStorage.setItem('cookie_consent', 'rejected');
        resetCanvasTourSessionForTest();
        useUIStore.setState({ isCanvasTourOpen: false, canvasTourAvailable: false, islandStyle: 'original' });
        useStreamStore.setState({ canvasItems: [] });
        document.body.innerHTML = '';
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('一進畫布就從歡迎頁開始（置中、沒有聚光框）；略過後寫入旗標並關閉', () => {
        setStreams(2);
        render(<CanvasTour />);
        expect(screen.queryByRole('dialog')).toBeNull();
        start();

        expect(title()).toBe('歡迎使用多直播畫布');
        expect(screen.getByText('1 / 16')).toBeInTheDocument();
        expect(spotlight()).toBeNull();

        // 下一步是拖曳：目標視窗掛上 data-tour-active，平常 hover 才出現的工具列與縮放角由 CSS 強制顯示
        clickNext();
        expect(title()).toBe('拖曳工具列移動視窗');
        expect(document.querySelector('[data-canvas-window-id="w1"]')!.hasAttribute('data-tour-active')).toBe(true);

        fireEvent.click(screen.getByText('略過'));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(localStorage.getItem(CANVAS_TOUR_DONE_KEY)).toBe('1');
        expect(document.querySelector('[data-tour-active]')).toBeNull();
    });

    // 使用者回報：空畫布沒有視窗可以框，視窗操作那段看不懂 → 分兩段：先教加直播，加了再教操作
    it('空畫布只跑第一段：歡迎 → 貼連結 → 搜尋頻道 → 切換平台（都在中央大搜尋框）→ 動態島也有同一個搜尋框；看完只記第一段', () => {
        fakeIsland();
        fakeQuickAdd();
        render(<CanvasTour />);
        start();
        expect(title()).toBe('歡迎使用多直播畫布');
        expect(screen.getByText('1 / 5')).toBeInTheDocument();
        expect(document.getElementById('canvas-tour-body')!.textContent).toContain('畫布現在是空的');
        clickNext();
        expect(title()).toBe('方法一：貼上直播網址');
        expect(spotlight()).not.toBeNull();
        clickNext();
        expect(title()).toBe('方法二：搜尋頻道');
        expect(spotlight()).not.toBeNull();
        clickNext();
        expect(title()).toBe('切換搜尋 Twitch 或 YouTube');
        expect(spotlight()).not.toBeNull();
        clickNext();
        expect(title()).toBe('動態島也有同一個搜尋框');
        expect(spotlight()).not.toBeNull();

        fireEvent.click(screen.getByText('開始加入直播'));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(localStorage.getItem(CANVAS_TOUR_INTRO_DONE_KEY)).toBe('1');
        expect(localStorage.getItem(CANVAS_TOUR_DONE_KEY)).toBeNull();
        // 還沒加直播：不會再自動開
        act(() => { vi.advanceTimersByTime(5000); });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('第一段看過後，第一路直播加入就接著跑第二段：有真實視窗可框，不再重複搜尋框', () => {
        localStorage.setItem(CANVAS_TOUR_INTRO_DONE_KEY, '1');
        fakeIsland();
        render(<CanvasTour />);
        act(() => { vi.advanceTimersByTime(5000); });
        expect(screen.queryByRole('dialog')).toBeNull();

        act(() => { setStreams(1); });
        start();
        expect(title()).toBe('直播加好了！');
        // windows_ready + 4 個視窗步驟 + 動態島 7 步（少了第一段教過的搜尋框與平台切換）+ 操作一覽
        expect(screen.getByText('1 / 13')).toBeInTheDocument();
        clickNext();
        expect(title()).toBe('拖曳工具列移動視窗');
        expect(spotlight()).not.toBeNull();
        const titles: string[] = [];
        for (let i = 0; i < 11; i++) { clickNext(); titles.push(title()!); }
        expect(titles).not.toContain(ISLAND_TITLES[1]);
        expect(titles).not.toContain(ISLAND_TITLES[2]);
        expect(titles[titles.length - 1]).toBe('操作一覽');

        fireEvent.click(screen.getByText('開始使用'));
        expect(localStorage.getItem(CANVAS_TOUR_DONE_KEY)).toBe('1');
    });

    it('第一段按「略過」：整個導覽都不再自動跑，加入直播後也不接第二段', () => {
        fakeIsland();
        render(<CanvasTour />);
        start();
        fireEvent.click(screen.getByText('略過'));
        expect(localStorage.getItem(CANVAS_TOUR_DONE_KEY)).toBe('1');
        act(() => { setStreams(1); });
        act(() => { vi.advanceTimersByTime(5000); });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('空畫布從快捷鍵說明「重看導覽」：仍是完整版（視窗操作用一頁文字說明）', () => {
        localStorage.setItem(CANVAS_TOUR_DONE_KEY, '1');
        fakeIsland();
        render(<CanvasTour />);
        act(() => { useUIStore.getState().setCanvasTourOpen(true); });
        expect(screen.getByText('1 / 12')).toBeInTheDocument();
        clickNext();
        expect(title()).toBe('畫面上的視窗怎麼操作');
        expect(spotlight()).toBeNull();
        clickNext();
        expect(title()).toBe(ISLAND_TITLES[0]);
    });

    it('完整走一遍（1 路）：視窗 → 動態島每顆按鈕都有框到 → 操作一覽 → 開始使用', () => {
        setStreams(1);
        fakeIsland();
        render(<CanvasTour />);
        start();
        expect(screen.getByText('1 / 15')).toBeInTheDocument();

        clickNext();
        expect(title()).toBe('拖曳工具列移動視窗');
        clickNext();
        expect(title()).toBe('拖曳四個角調整大小');
        // 四個角都框起來（不是只框右下角）
        expect([...document.querySelectorAll('[data-tour-corner]')].map(el => el.getAttribute('data-tour-corner')).sort())
            .toEqual(['ne', 'nw', 'se', 'sw']);
        clickNext();
        expect(title()).toBe('放大某一路');
        clickNext();
        expect(title()).toBe('重新載入與移除');
        expect(spotlight()).not.toBeNull();

        for (const t of ISLAND_TITLES) {
            clickNext();
            expect(title()).toBe(t);
            expect(spotlight(), t).not.toBeNull();
            // 介紹動態島時不強制顯示視窗工具列
            expect(document.querySelector('[data-tour-active]')).toBeNull();
        }

        clickNext();
        expect(title()).toBe('操作一覽');
        expect(spotlight()).toBeNull();
        expect(document.querySelectorAll('[data-tour-summary] dt')).toHaveLength(10);
        expect(screen.getByText('移動視窗（拖曳工具列）')).toBeInTheDocument();

        fireEvent.click(screen.getByText('開始使用'));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(localStorage.getItem(CANVAS_TOUR_DONE_KEY)).toBe('1');
    });

    it('畫面上有聊天室與空視窗時，多介紹聊天室選單與空視窗', () => {
        setStreams(1);
        useStreamStore.setState({
            canvasItems: [
                ...useStreamStore.getState().canvasItems,
                { i: 'c1', type: 'chat', contentId: 1, layout: L(20, 0, 4, 24) },
                { i: 'e1', type: 'stream', contentId: null, layout: L(10, 0, 10, 10) },
            ],
        });
        const chat = document.createElement('div');
        chat.setAttribute('data-window-toolbar', 'chat');
        const empty = document.createElement('div');
        empty.setAttribute('data-empty-window', 'stream');
        document.body.append(chat, empty);

        render(<CanvasTour />);
        start();
        expect(screen.getByText('1 / 17')).toBeInTheDocument();
        for (let i = 0; i < 5; i++) clickNext();
        expect(title()).toBe('用選單切換聊天室顯示哪一路');
        expect(spotlight()).not.toBeNull();
        clickNext();
        expect(title()).toBe('空視窗：直接填入內容');
        expect(spotlight()).not.toBeNull();
    });

    it('第一段的搜尋那一步在中央大搜尋框逐字打出範例字（動態島不動）；離開這一步（下一步／上一步／Esc）一律清空', () => {
        fakeIsland();
        fakeQuickAdd();
        render(<CanvasTour />);
        start();
        clickNext(); // paste
        clickNext(); // search
        expect(title()).toBe('方法二：搜尋頻道');
        act(() => { vi.advanceTimersByTime(130); });
        expect(centerInput().value).toBe(TOUR_SEARCH_DEMO.slice(0, 1));
        act(() => { vi.advanceTimersByTime(1000); });
        expect(centerInput().value).toBe(TOUR_SEARCH_DEMO);
        expect(islandInput().value).toBe('');

        clickNext(); // platform
        expect(centerInput().value).toBe('');

        fireEvent.click(screen.getByText('上一步')); // 回到 search：重新示範
        act(() => { vi.advanceTimersByTime(1000); });
        expect(centerInput().value).toBe(TOUR_SEARCH_DEMO);
        fireEvent.click(screen.getByText('上一步'));
        expect(centerInput().value).toBe('');

        clickNext();
        act(() => { vi.advanceTimersByTime(1000); });
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(centerInput().value).toBe('');
    });

    it('完整版的搜尋那一步在動態島示範；畫面上還有空視窗的搜尋框時也不會打錯地方', () => {
        setStreams(1);
        // 空視窗的搜尋框排在動態島前面（DOM 順序），不限定範圍的查詢會先找到它
        const emptyWin = document.createElement('div');
        emptyWin.setAttribute('data-empty-window', 'stream');
        emptyWin.innerHTML = SEARCH_BOX;
        document.body.prepend(emptyWin);
        fakeIsland();
        render(<CanvasTour />);
        start();
        while (title() !== ISLAND_TITLES[1]) clickNext();
        act(() => { vi.advanceTimersByTime(1000); });
        expect(islandInput().value).toBe(TOUR_SEARCH_DEMO);
        expect(emptyWin.querySelector('input')!.value).toBe('');
        clickNext();
        expect(title()).toBe(ISLAND_TITLES[2]);
        expect(islandInput().value).toBe('');
    });

    it('空畫布有收藏：第一段最後多介紹「你的收藏」', () => {
        localStorage.setItem('favoriteStreams', JSON.stringify([
            { id: 'f1', url: 'https://www.twitch.tv/a', name: 'a', platform: 'twitch', addedAt: '2026-01-01' },
        ]));
        fakeIsland();
        fakeQuickAdd();
        const fav = document.createElement('section');
        fav.setAttribute('data-tour', 'empty-favorites');
        document.body.appendChild(fav);
        render(<CanvasTour />);
        start();
        expect(screen.getByText('1 / 6')).toBeInTheDocument();
        for (let i = 0; i < 5; i++) clickNext();
        expect(title()).toBe('你的收藏');
        expect(spotlight()).not.toBeNull();
        fireEvent.click(screen.getByText('開始加入直播'));
        expect(localStorage.getItem(CANVAS_TOUR_INTRO_DONE_KEY)).toBe('1');
    });

    it('只有沒開播的 YouTube 收藏：空畫布不顯示收藏區，導覽也不介紹', () => {
        localStorage.setItem('favoriteStreams', JSON.stringify([
            { id: 'y', url: 'https://www.youtube.com/channel/UC1', name: 'y', platform: 'youtube', addedAt: '2026-01-01', isLive: false },
        ]));
        fakeIsland();
        fakeQuickAdd();
        render(<CanvasTour />);
        start();
        expect(screen.getByText('1 / 5')).toBeInTheDocument();
    });

    it('邊緣停靠型動態島的第一段：中央大搜尋框的三步 → 指向停靠標籤', () => {
        useUIStore.setState({ islandStyle: 'edgeDock' });
        fakeQuickAdd();
        const dock = document.createElement('div');
        dock.setAttribute('data-tour', 'island-dock');
        document.body.appendChild(dock);
        render(<CanvasTour />);
        start();
        expect(screen.getByText('1 / 5')).toBeInTheDocument();
        clickNext();
        expect(title()).toBe('方法一：貼上直播網址');
        clickNext();
        expect(title()).toBe('方法二：搜尋頻道');
        clickNext();
        expect(title()).toBe('切換搜尋 Twitch 或 YouTube');
        clickNext();
        expect(title()).toBe('先加入第一路直播');
        expect(spotlight()).not.toBeNull();
        expect(document.getElementById('canvas-tour-body')!.textContent).toContain('停靠');
    });

    it('已看過就不再自動開啟', () => {
        localStorage.setItem(CANVAS_TOUR_DONE_KEY, '1');
        setStreams(2);
        render(<CanvasTour />);
        act(() => { vi.advanceTimersByTime(5000); });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('導覽期間釘住動態島：isCanvasTourOpen 為 true', () => {
        setStreams(2);
        render(<CanvasTour />);
        start();
        expect(useUIStore.getState().isCanvasTourOpen).toBe(true);
    });

    it('邊緣停靠型動態島：島的介紹只有一步，指向停靠標籤', () => {
        useUIStore.setState({ islandStyle: 'edgeDock' });
        setStreams(2);
        const dock = document.createElement('div');
        dock.setAttribute('data-tour', 'island-dock');
        document.body.appendChild(dock);
        render(<CanvasTour />);
        start();
        expect(screen.getByText('1 / 8')).toBeInTheDocument();
        for (let i = 0; i < 6; i++) clickNext();
        expect(title()).toBe('動態島停靠在畫面邊緣');
        expect(spotlight()).not.toBeNull();
        clickNext();
        expect(title()).toBe('操作一覽');
    });

    it('Esc 略過；從快捷鍵說明重看（setCanvasTourOpen）時從第一步開始', () => {
        setStreams(2);
        render(<CanvasTour />);
        start();
        clickNext();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();

        act(() => { useUIStore.getState().setCanvasTourOpen(true); });
        expect(screen.getByText('1 / 16')).toBeInTheDocument();
    });

    it('可以回上一步（按鈕與方向鍵 ←），第一步沒有上一步', () => {
        setStreams(2);
        render(<CanvasTour />);
        start();
        expect(screen.queryByText('上一步')).toBeNull();
        clickNext();
        clickNext();
        expect(screen.getByText('3 / 16')).toBeInTheDocument();
        fireEvent.click(screen.getByText('上一步'));
        expect(screen.getByText('2 / 16')).toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'ArrowLeft' });
        expect(screen.getByText('1 / 16')).toBeInTheDocument();
    });

    it('掛載期間標記導覽可用（快捷鍵說明據此顯示「重看導覽」），卸載時清除', () => {
        const { unmount } = render(<CanvasTour />);
        expect(useUIStore.getState().canvasTourAvailable).toBe(true);
        unmount();
        expect(useUIStore.getState().canvasTourAvailable).toBe(false);
    });

    it('localStorage 寫不進去時，關掉後本次工作階段內不會再自動重開', () => {
        // 只讓導覽的 key 寫不進去（store 的 persist、i18n 也會寫 localStorage）。
        // tests/setup.ts 的 setItem 本身就是 vi.fn：先取出原實作，結束後放回（mockRestore 會把實作清掉）
        const setItem = localStorage.setItem as unknown as ReturnType<typeof vi.fn>;
        const original = setItem.getMockImplementation()!;
        setItem.mockImplementation((k: string, v: string) => {
            if (k === CANVAS_TOUR_DONE_KEY) throw new Error('blocked');
            original(k, v);
        });
        try {
            setStreams(2);
            render(<CanvasTour />);
            start();
            fireEvent.click(screen.getByText('略過'));
            expect(localStorage.getItem(CANVAS_TOUR_DONE_KEY)).toBeNull();
            act(() => { vi.advanceTimersByTime(5000); });
            expect(screen.queryByRole('dialog')).toBeNull();
        } finally {
            setItem.mockImplementation(original);
        }
    });

    it('第一次造訪還沒回應 Cookie 橫幅時先不開始，回應後才開始（橫幅會蓋住動態島）', () => {
        localStorage.removeItem('cookie_consent');
        setStreams(2);
        render(<CanvasTour />);
        act(() => { vi.advanceTimersByTime(5000); });
        expect(screen.queryByRole('dialog')).toBeNull();

        act(() => { setTrackingConsent(false); });
        start();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
});
