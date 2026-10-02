/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStreamStore } from '../../src/store/useStreamStore';
import { apiLoader } from '../../src/utils/apiLoader';
import { favoritesService } from '../../src/features/favorites/FavoritesService';

// Mock dependencies
vi.mock('../../src/utils/apiLoader', () => ({
    apiLoader: {
        loadTwitchDataApi: vi.fn(),
        loadYouTubeDataApi: vi.fn(),
    },
}));

vi.mock('../../src/features/favorites/FavoritesService', () => ({
    favoritesService: {
        getFavorites: vi.fn(() => []),
    },
}));

describe('useStreamStore', () => {
    beforeEach(() => {
        // Reset Store
        useStreamStore.setState({
            streams: [],
            layout: 2,
            chatLayout: 'none',
            canvasItems: []
        });

        // Reset Globals
        (window as any).streamCount = 0;
        (window as any).streamData = {};
        (window as any).twitchApi = {
            searchChannels: vi.fn(),
        };
        (window as any).youtubeApiUtils = {
            getChannelIdFromVideoId: vi.fn(),
        };
    });

    describe('Stream Management', () => {
        it('should add a valid Twitch stream', async () => {
            const url = 'https://www.twitch.tv/shroud';
            const result = await useStreamStore.getState().addStream(url);

            expect(result.success).toBe(true);
            expect(useStreamStore.getState().streams).toHaveLength(1);
            const stream = useStreamStore.getState().streams[0];
            expect(stream.platform).toBe('twitch');
            expect(stream.channelId).toBe('shroud');
        });

        it('should fail with invalid URL', async () => {
            const url = 'https://example.com/foo';
            const result = await useStreamStore.getState().addStream(url);

            expect(result.success).toBe(false);
            expect(useStreamStore.getState().streams).toHaveLength(0);
        });

        it('should remove stream', async () => {
            useStreamStore.setState({
                streams: [
                    { id: 1, platform: 'twitch', channelId: 'a', videoId: '', originalUrl: '', volume: 100, chatVisible: false, isMuted: false },
                    { id: 2, platform: 'twitch', channelId: 'b', videoId: '', originalUrl: '', volume: 100, chatVisible: false, isMuted: false }
                ]
            });

            useStreamStore.getState().removeStream(1);
            expect(useStreamStore.getState().streams).toHaveLength(1);
            expect(useStreamStore.getState().streams[0].id).toBe(2);
        });

        it('should move stream', () => {
            useStreamStore.setState({
                streams: [
                    { id: 1, platform: 'twitch', channelId: '1', videoId: '', originalUrl: '', volume: 0, chatVisible: false, isMuted: false },
                    { id: 2, platform: 'twitch', channelId: '2', videoId: '', originalUrl: '', volume: 0, chatVisible: false, isMuted: false },
                    { id: 3, platform: 'twitch', channelId: '3', videoId: '', originalUrl: '', volume: 0, chatVisible: false, isMuted: false }
                ]
            });

            useStreamStore.getState().moveStream(0, 2);
            const streams = useStreamStore.getState().streams;
            expect(streams[0].id).toBe(2);
            expect(streams[1].id).toBe(3);
            expect(streams[2].id).toBe(1);
        });

        it('should clear canvas items', () => {
            useStreamStore.setState({
                streams: [
                    { id: 1, platform: 'twitch', channelId: '1', videoId: '', originalUrl: '', volume: 0, chatVisible: false, isMuted: false }
                ],
                canvasItems: [
                    { i: '1', type: 'stream', contentId: 1, layout: { x: 0, y: 0, w: 6, h: 6 } }
                ]
            });

            useStreamStore.getState().clearCanvasItems();
            expect(useStreamStore.getState().streams).toHaveLength(0);
            expect(useStreamStore.getState().canvasItems).toHaveLength(0);
        });
    });

    describe('Media Controls (Individual)', () => {
        // Global Volume is in useUIStore now

        it('should update individual stream volume', () => {
            useStreamStore.setState({
                streams: [
                    { id: 1, platform: 'twitch', channelId: '1', videoId: '', originalUrl: '', volume: 50, chatVisible: false, isMuted: false }
                ]
            });

            useStreamStore.getState().updateStream(1, { volume: 100 });
            expect(useStreamStore.getState().streams[0].volume).toBe(100);
        });
    });

    describe('關閉視窗後的 canvas 佈局', () => {
        const threeStreams = [
            { id: 1, platform: 'twitch' as const, channelId: 'a', videoId: '', originalUrl: '', volume: 100, chatVisible: false, isMuted: false },
            { id: 2, platform: 'twitch' as const, channelId: 'b', videoId: '', originalUrl: '', volume: 100, chatVisible: false, isMuted: false },
            { id: 3, platform: 'twitch' as const, channelId: 'c', videoId: '', originalUrl: '', volume: 100, chatVisible: false, isMuted: false },
        ];
        const threeItems = [
            { i: 'w1', type: 'stream' as const, contentId: 1, layout: { x: 0, y: 0, w: 8, h: 24 } },
            { i: 'w2', type: 'stream' as const, contentId: 2, layout: { x: 8, y: 0, w: 8, h: 24 } },
            { i: 'w3', type: 'stream' as const, contentId: 3, layout: { x: 16, y: 0, w: 8, h: 24 } },
        ];

        it('canvas 模式不套模板重排，保留使用者自己排的版面', () => {
            useStreamStore.setState({ streams: threeStreams, canvasItems: threeItems, layoutMode: 'canvas' });

            useStreamStore.getState().removeStream(2, true);

            const items = useStreamStore.getState().canvasItems;
            expect(items.map(i => i.i)).toEqual(['w1', 'w3']);
            // 其餘視窗維持原座標，空洞留給 NewCanvasPage 的 resolveHoleFill 處理
            expect(items.find(i => i.i === 'w1')!.layout).toEqual({ x: 0, y: 0, w: 8, h: 24 });
            expect(items.find(i => i.i === 'w3')!.layout).toEqual({ x: 16, y: 0, w: 8, h: 24 });
        });

        it('非 canvas 模式套用模板時，layout 不得被清成空物件', () => {
            useStreamStore.setState({ streams: threeStreams, canvasItems: threeItems, layoutMode: 'auto' });

            useStreamStore.getState().removeStream(2, true);

            // 模板產生的是扁平的 {x,y,w,h}，展開 target.layout 會得到 {} 讓整個畫布壞掉
            for (const item of useStreamStore.getState().canvasItems) {
                expect(Number.isFinite(item.layout.x), `${item.i}.x`).toBe(true);
                expect(Number.isFinite(item.layout.y), `${item.i}.y`).toBe(true);
                expect(Number.isFinite(item.layout.w), `${item.i}.w`).toBe(true);
                expect(Number.isFinite(item.layout.h), `${item.i}.h`).toBe(true);
                expect(item.layout.w).toBeGreaterThan(0);
                expect(item.layout.h).toBeGreaterThan(0);
            }
        });
    });

    describe('Layout Management', () => {
        it('should change layout', () => {
            useStreamStore.getState().setLayout(4); // Use number for layout type according to updated interface/state?
            // State initial was 2. Use 4.
            expect(useStreamStore.getState().layout).toBe(4);
        });

        it('should change chat layout', () => {
            useStreamStore.getState().setChatLayout('sidebar');
            expect(useStreamStore.getState().chatLayout).toBe('sidebar');
        });
    });

    // Alt+數字切版型壞版（2026-10 正式站實測）：setLayout 用像素算寬高（screenWidth / colCount），
    // 2×2、每格 720×450 按 Alt+2 後 rect 變成 x/y 0/43200、寬 43200——720 被當成 720 格。
    describe('Alt+數字切版型（setLayout，畫布模式）', () => {
        const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
            a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

        const addFour = async () => {
            useStreamStore.setState({ layoutMode: 'canvas' });
            // 串流 ID 取自 Date.now()：測試裡同一毫秒連加四路會撞號，逐路推進時間
            let now = Date.now();
            const spy = vi.spyOn(Date, 'now').mockImplementation(() => ++now);
            try {
                for (const ch of ['lofigirl', 'shroud', 'pokimane', 'xqc']) {
                    const res = await useStreamStore.getState().addStream(`https://www.twitch.tv/${ch}`, { withChat: false, withStream: true });
                    expect(res.success).toBe(true);
                }
            } finally {
                spy.mockRestore();
            }
            expect(new Set(useStreamStore.getState().streams.map(s => s.id)).size).toBe(4);
        };

        it.each([1, 2, 3, 4, 5, 6, 9] as const)('Alt+%i 後所有 item 都在 24×24 網格內且不重疊', async (n) => {
            await addFour();
            useStreamStore.getState().setLayout(n);

            const items = useStreamStore.getState().canvasItems;
            expect(items).toHaveLength(n);
            for (const { layout } of items) {
                expect(layout.x).toBeGreaterThanOrEqual(0);
                expect(layout.y).toBeGreaterThanOrEqual(0);
                expect(layout.w).toBeGreaterThan(0);
                expect(layout.h).toBeGreaterThan(0);
                expect(layout.x + layout.w).toBeLessThanOrEqual(24);
                expect(layout.y + layout.h).toBeLessThanOrEqual(24);
            }
            for (let a = 0; a < items.length; a++) {
                for (let b = a + 1; b < items.length; b++) {
                    expect(overlaps(items[a].layout, items[b].layout)).toBe(false);
                }
            }
        });

        it('與動態島布局清單套用同路數版型的結果相同', async () => {
            await addFour();
            useStreamStore.getState().setLayout(4);
            const fromHotkey = useStreamStore.getState().canvasItems.map(i => ({ contentId: i.contentId, layout: i.layout }));

            useStreamStore.getState().applyTemplateLayout('template-4-landscape');
            const fromPicker = useStreamStore.getState().canvasItems.map(i => ({ contentId: i.contentId, layout: i.layout }));

            expect(fromHotkey).toEqual(fromPicker);
            // 4 路田字：每格 12×12
            expect(fromHotkey.map(i => i.layout)).toEqual([
                { x: 0, y: 0, w: 12, h: 12 }, { x: 12, y: 0, w: 12, h: 12 },
                { x: 0, y: 12, w: 12, h: 12 }, { x: 12, y: 12, w: 12, h: 12 },
            ]);
        });

        it('既有串流的視窗 ID 保持不變（播放器不重建）', async () => {
            await addFour();
            const before = new Map(useStreamStore.getState().canvasItems.map(i => [i.contentId, i.i]));
            useStreamStore.getState().setLayout(4);
            for (const item of useStreamStore.getState().canvasItems) {
                expect(item.i).toBe(before.get(item.contentId));
            }
        });

        it('畫布掛載前（layoutMode = auto）只記錄版型編號、不動畫布', async () => {
            await addFour();
            useStreamStore.setState({ layoutMode: 'auto' });
            const before = useStreamStore.getState().canvasItems;
            useStreamStore.getState().setLayout(2);
            expect(useStreamStore.getState().layout).toBe(2);
            expect(useStreamStore.getState().canvasItems).toBe(before);
        });
    });

    // 首頁「貼上網址馬上看」黑畫面（2026-09）：畫布掛載前 layoutMode 仍是預設 'auto'，
    // 舊分支寫死 pixel 座標 w:480/300 且同在 x:0,y:0，在 24 格網格下被放大約 20 倍並互相重疊。
    describe('畫布掛載前（layoutMode = auto）新增串流', () => {
        const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
            a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

        it('座標落在 24 格網格內，播放器與聊天室不重疊', async () => {
            useStreamStore.setState({ layoutMode: 'auto' });
            const result = await useStreamStore.getState().addStream('https://www.twitch.tv/assentw');
            expect(result.success).toBe(true);

            const items = useStreamStore.getState().canvasItems;
            expect(items.some(i => i.type === 'stream')).toBe(true);
            for (const { layout } of items) {
                expect(layout.x).toBeGreaterThanOrEqual(0);
                expect(layout.w).toBeGreaterThan(0);
                expect(layout.x + layout.w).toBeLessThanOrEqual(24);
            }
            for (let a = 0; a < items.length; a++) {
                for (let b = a + 1; b < items.length; b++) {
                    expect(overlaps(items[a].layout, items[b].layout)).toBe(false);
                }
            }
        });

        it('與畫布掛載後（canvas 模式）新增的結果一致', async () => {
            useStreamStore.setState({ layoutMode: 'auto' });
            await useStreamStore.getState().addStream('https://www.twitch.tv/assentw');
            const fromAuto = useStreamStore.getState().canvasItems.map(i => ({ type: i.type, layout: i.layout }));

            useStreamStore.setState({ streams: [], canvasItems: [], layoutMode: 'canvas' });
            await useStreamStore.getState().addStream('https://www.twitch.tv/assentw');
            const fromCanvas = useStreamStore.getState().canvasItems.map(i => ({ type: i.type, layout: i.layout }));

            expect(fromAuto).toEqual(fromCanvas);
        });
    });

    // 切換自訂佈局後聲音全部靜音、救不回來（2026-09）：applyCustomLayout 每次都用 uuid 重產 item ID，
    // ID 是畫布的 React key → 所有播放器 iframe 被卸載重建，重建期間 player registry 錯位。
    describe('套用自訂佈局', () => {
        it('既有串流與聊天室的視窗 ID 保持不變（播放器不重建）', async () => {
            useStreamStore.setState({ layoutMode: 'canvas' });
            await useStreamStore.getState().addStream('https://www.twitch.tv/assentw');
            // 串流 ID 是 Date.now()，同一毫秒連續新增會撞號，這裡刻意隔開
            await new Promise(r => setTimeout(r, 5));
            await useStreamStore.getState().addStream('https://www.twitch.tv/devilcatwith2cat');

            const before = useStreamStore.getState().canvasItems.filter(i => i.contentId != null);
            expect(before.length).toBeGreaterThanOrEqual(2);

            useStreamStore.setState({
                customLayouts: [{
                    id: 'L1',
                    name: 'test',
                    createdAt: 0,
                    slots: [
                        { x: 0, y: 0, w: 12, h: 12, type: 'stream' },
                        { x: 12, y: 0, w: 12, h: 12, type: 'stream' },
                        { x: 0, y: 12, w: 12, h: 12, type: 'chat' },
                        { x: 12, y: 12, w: 12, h: 12, type: 'chat' },
                    ],
                }],
            });
            useStreamStore.getState().applyCustomLayout('L1');

            const after = useStreamStore.getState().canvasItems;
            for (const prev of before) {
                const same = after.find(i => i.type === prev.type && i.contentId === prev.contentId);
                expect(same, `${prev.type} ${prev.contentId}`).toBeDefined();
                expect(same!.i).toBe(prev.i);
            }
            // 版面確實換成自訂佈局的位置
            expect(after.filter(i => i.type === 'stream').map(i => i.layout).sort((a, b) => a.x - b.x))
                .toEqual([{ x: 0, y: 0, w: 12, h: 12 }, { x: 12, y: 0, w: 12, h: 12 }]);
        });

        it('空槽與新視窗仍拿到唯一 ID', async () => {
            useStreamStore.setState({ layoutMode: 'canvas' });
            await useStreamStore.getState().addStream('https://www.twitch.tv/assentw');
            useStreamStore.setState({
                customLayouts: [{
                    id: 'L2',
                    name: 'test',
                    createdAt: 0,
                    slots: [
                        { x: 0, y: 0, w: 8, h: 12, type: 'stream' },
                        { x: 8, y: 0, w: 8, h: 12, type: 'stream' },
                        { x: 16, y: 0, w: 8, h: 12, type: 'stream' },
                    ],
                }],
            });
            useStreamStore.getState().applyCustomLayout('L2');
            const ids = useStreamStore.getState().canvasItems.map(i => i.i);
            expect(new Set(ids).size).toBe(ids.length);
        });

        it('空槽不沿用舊 ID（避免舊版面的 empty-stream-X ↔ empty-chat-X 配對跑到不相鄰的槽）', () => {
            useStreamStore.setState({
                layoutMode: 'canvas',
                streams: [],
                canvasItems: [
                    { i: 'empty-stream-A', type: 'stream', contentId: null, layout: { x: 0, y: 0, w: 12, h: 24 } },
                    { i: 'empty-chat-A', type: 'chat', contentId: null, layout: { x: 12, y: 0, w: 12, h: 24 } },
                ],
                customLayouts: [{
                    id: 'L3',
                    name: 'test',
                    createdAt: 0,
                    slots: [
                        { x: 0, y: 0, w: 12, h: 24, type: 'stream' },
                        { x: 12, y: 0, w: 12, h: 24, type: 'chat' },
                    ],
                }],
            });
            useStreamStore.getState().applyCustomLayout('L3');
            const ids = useStreamStore.getState().canvasItems.map(i => i.i);
            expect(ids).not.toContain('empty-stream-A');
            expect(ids).not.toContain('empty-chat-A');
        });
    });

    // 版面重設計（2026-09）：N 串 + 1 共用聊天室、設為主畫面、交換。
    // 所有操作都只能改 layout / contentId，不能改 `i`（畫布 React key，改了播放器就重建靜音）。
    describe('N 串 + 1 共用聊天室與主畫面／交換', () => {
        const mk = (id: number, ch: string) => ({ id, platform: 'twitch' as const, channelId: ch, videoId: '', originalUrl: '', volume: 100, chatVisible: false, isMuted: false });
        const streams3 = [mk(1, 'a'), mk(2, 'b'), mk(3, 'c')];
        const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
        const sharedItems = () => [
            { i: 'w1', type: 'stream' as const, contentId: 1, layout: L(0, 0, 10, 10) },
            { i: 'w2', type: 'stream' as const, contentId: 2, layout: L(10, 0, 10, 10) },
            { i: 'w3', type: 'stream' as const, contentId: 3, layout: L(0, 10, 10, 10) },
            { i: 'chat', type: 'chat' as const, contentId: 1, layout: L(20, 0, 4, 24) },
        ];

        it('套用共用聊天室版型：串流與聊天室沿用原本的 i，只留 1 個聊天室', () => {
            useStreamStore.setState({
                layoutMode: 'canvas',
                streams: [mk(1, 'a'), mk(2, 'b')],
                canvasItems: [
                    { i: 'w1', type: 'stream', contentId: 1, layout: L(0, 0, 8, 12) },
                    { i: 'c1', type: 'chat', contentId: 1, layout: L(8, 0, 4, 12) },
                    { i: 'w2', type: 'stream', contentId: 2, layout: L(12, 0, 8, 12) },
                    { i: 'c2', type: 'chat', contentId: 2, layout: L(20, 0, 4, 12) },
                ],
            });
            useStreamStore.getState().applyTemplateLayout('template-4-sharedchat');
            const items = useStreamStore.getState().canvasItems;
            const chats = items.filter(i => i.type === 'chat');
            expect(chats).toHaveLength(1);
            expect(chats[0]).toMatchObject({ i: 'c1', contentId: 1 });
            expect(items.find(i => i.contentId === 1 && i.type === 'stream')!.i).toBe('w1');
            expect(items.find(i => i.contentId === 2 && i.type === 'stream')!.i).toBe('w2');
            expect(items.filter(i => i.type === 'stream')).toHaveLength(4);
            expect(new Set(items.map(i => i.i)).size).toBe(items.length);
        });

        it('套用共用聊天室版型：沿用聊天室正在顯示的那一路（不強制切回第一路）', () => {
            useStreamStore.setState({
                layoutMode: 'canvas',
                streams: [mk(1, 'a'), mk(2, 'b')],
                canvasItems: [
                    { i: 'w1', type: 'stream', contentId: 1, layout: L(0, 0, 10, 12) },
                    { i: 'w2', type: 'stream', contentId: 2, layout: L(10, 0, 10, 12) },
                    { i: 'cx', type: 'chat', contentId: 2, layout: L(20, 0, 4, 24) },
                ],
            });
            useStreamStore.getState().applyTemplateLayout('template-2-sharedchat');
            const chat = useStreamStore.getState().canvasItems.find(i => i.type === 'chat')!;
            expect(chat).toMatchObject({ i: 'cx', contentId: 2 });
        });

        it('套用版型時空槽不沿用舊 ID', () => {
            useStreamStore.setState({
                layoutMode: 'canvas',
                streams: [],
                canvasItems: [
                    { i: 'empty-stream-A', type: 'stream', contentId: null, layout: L(0, 0, 12, 24) },
                    { i: 'empty-chat-A', type: 'chat', contentId: null, layout: L(12, 0, 4, 24) },
                ],
            });
            useStreamStore.getState().applyTemplateLayout('template-2-sharedchat');
            const ids = useStreamStore.getState().canvasItems.map(i => i.i);
            expect(ids).not.toContain('empty-stream-A');
            expect(ids).not.toContain('empty-chat-A');
        });

        it('共用模式下新增串流：仍只有 1 個聊天室，既有 i 全部保留', async () => {
            useStreamStore.setState({ layoutMode: 'canvas', streams: streams3, canvasItems: sharedItems() });
            const r = await useStreamStore.getState().addStream('https://www.twitch.tv/newone');
            expect(r.success).toBe(true);
            const items = useStreamStore.getState().canvasItems;
            expect(items.filter(i => i.type === 'chat')).toHaveLength(1);
            expect(items.filter(i => i.type === 'stream')).toHaveLength(4);
            for (const id of ['w1', 'w2', 'w3', 'chat']) expect(items.map(i => i.i)).toContain(id);
            expect(items.find(i => i.i === 'chat')!.contentId).toBe(1);
        });

        it('移除聊天室正在顯示的那一路：聊天室改指向另一路而不是消失', () => {
            useStreamStore.setState({ layoutMode: 'canvas', streams: streams3, canvasItems: sharedItems() });
            useStreamStore.getState().removeStream(1, true);
            const chat = useStreamStore.getState().canvasItems.find(i => i.type === 'chat');
            expect(chat).toBeDefined();
            expect(chat!.i).toBe('chat');
            expect(chat!.contentId).toBe(2); // 依位置（上→下、左→右）取第一個
        });

        it('非 canvas 模式移除後重排：仍維持共用聊天室版面', () => {
            useStreamStore.setState({ layoutMode: 'auto', streams: streams3, canvasItems: sharedItems() });
            useStreamStore.getState().removeStream(3, true);
            const items = useStreamStore.getState().canvasItems;
            expect(items.filter(i => i.type === 'chat')).toHaveLength(1);
            expect(items.filter(i => i.type === 'stream')).toHaveLength(2);
            expect(items.find(i => i.type === 'chat')!.i).toBe('chat');
        });

        it('每路各一聊天室的版面：移除行為不變（那一路的聊天室跟著移除）', () => {
            useStreamStore.setState({
                layoutMode: 'canvas',
                streams: [mk(1, 'a'), mk(2, 'b')],
                canvasItems: [
                    { i: 'w1', type: 'stream', contentId: 1, layout: L(0, 0, 8, 12) },
                    { i: 'c1', type: 'chat', contentId: 1, layout: L(8, 0, 4, 12) },
                    { i: 'w2', type: 'stream', contentId: 2, layout: L(12, 0, 8, 12) },
                    { i: 'c2', type: 'chat', contentId: 2, layout: L(20, 0, 4, 12) },
                ],
            });
            useStreamStore.getState().removeStream(1, true);
            expect(useStreamStore.getState().canvasItems.map(i => i.i)).toEqual(['w2', 'c2']);
        });

        it('swapCanvasItems：只互換兩個 layout，i 與內容不變', () => {
            useStreamStore.setState({ layoutMode: 'canvas', streams: streams3, canvasItems: sharedItems() });
            useStreamStore.getState().swapCanvasItems('w1', 'w3');
            const items = useStreamStore.getState().canvasItems;
            expect(items.map(i => [i.i, i.contentId])).toEqual(sharedItems().map(i => [i.i, i.contentId]));
            expect(items.find(i => i.i === 'w1')!.layout).toEqual(L(0, 10, 10, 10));
            expect(items.find(i => i.i === 'w3')!.layout).toEqual(L(0, 0, 10, 10));
            expect(items.find(i => i.i === 'w2')!.layout).toEqual(L(10, 0, 10, 10));
        });

        it('setMainCanvasItem：與面積最大的串流互換（同面積取左上）', () => {
            const items = sharedItems();
            items[1] = { ...items[1], layout: L(10, 0, 10, 14) }; // w2 最大
            useStreamStore.setState({ layoutMode: 'canvas', streams: streams3, canvasItems: items });
            useStreamStore.getState().setMainCanvasItem('w3');
            const after = useStreamStore.getState().canvasItems;
            expect(after.find(i => i.i === 'w3')!.layout).toEqual(L(10, 0, 10, 14));
            expect(after.find(i => i.i === 'w2')!.layout).toEqual(L(0, 10, 10, 10));
            expect(after.map(i => i.i).sort()).toEqual(['chat', 'w1', 'w2', 'w3']);
        });
    });

    describe('共用聊天室：有空槽時新增（Strategy A）與主畫面判定', () => {
        const mk = (id: number, ch: string) => ({ id, platform: 'twitch' as const, channelId: ch, videoId: '', originalUrl: '', volume: 100, chatVisible: false, isMuted: false });
        const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

        it('填空槽：新串流進空槽，聊天室維持顯示原本那一路、不新增聊天室', async () => {
            useStreamStore.setState({
                layoutMode: 'canvas',
                streams: [mk(1, 'a')],
                canvasItems: [
                    { i: 'w1', type: 'stream', contentId: 1, layout: L(0, 0, 10, 12) },
                    { i: 'w2', type: 'stream', contentId: null, layout: L(0, 12, 10, 12) },
                    { i: 'chat', type: 'chat', contentId: 1, layout: L(10, 0, 4, 24) },
                ],
            });
            const r = await useStreamStore.getState().addStream('https://www.twitch.tv/newone');
            expect(r.success).toBe(true);
            const items = useStreamStore.getState().canvasItems;
            expect(items.map(i => i.i)).toEqual(['w1', 'w2', 'chat']);
            expect(items.find(i => i.i === 'w2')!.contentId).toBe(r.streamId);
            expect(items.find(i => i.i === 'chat')!.contentId).toBe(1);
        });

        it('主畫面不算空槽：最大的是空槽時，★ 與最大的「有內容」串流互換', () => {
            useStreamStore.setState({
                layoutMode: 'canvas',
                streams: [mk(1, 'a'), mk(2, 'b')],
                canvasItems: [
                    { i: 'empty', type: 'stream', contentId: null, layout: L(0, 0, 16, 24) },
                    { i: 'w1', type: 'stream', contentId: 1, layout: L(16, 0, 8, 12) },
                    { i: 'w2', type: 'stream', contentId: 2, layout: L(16, 12, 8, 12) },
                ],
            });
            useStreamStore.getState().setMainCanvasItem('w2');
            const items = useStreamStore.getState().canvasItems;
            expect(items.find(i => i.i === 'w2')!.layout).toEqual(L(16, 0, 8, 12));
            expect(items.find(i => i.i === 'empty')!.layout).toEqual(L(0, 0, 16, 24));
        });
    });

    // 共用聊天室刪到只剩 1 路時，原本無法和「1 人含聊天室」區分，再加一路就變成每路一聊（code review #3）。
    // 修法：共用聊天室的 item 自帶 sharedChat 標記。
    describe('共用聊天室剩 1 路', () => {
        const mk = (id: number, ch: string) => ({ id, platform: 'twitch' as const, channelId: ch, videoId: '', originalUrl: '', volume: 100, chatVisible: false, isMuted: false });

        it('套用共用版型產生的聊天室帶 sharedChat 標記；每路一聊的版型不帶', () => {
            useStreamStore.setState({ layoutMode: 'canvas', streams: [mk(1, 'a'), mk(2, 'b')], canvasItems: [] });
            useStreamStore.getState().applyTemplateLayout('template-2-sharedchat');
            expect(useStreamStore.getState().canvasItems.find(i => i.type === 'chat')!.sharedChat).toBe(true);

            useStreamStore.getState().applyTemplateLayout('template-2-chat');
            for (const c of useStreamStore.getState().canvasItems.filter(i => i.type === 'chat')) {
                expect(c.sharedChat).toBeFalsy();
            }
        });

        it('3+1 刪到剩 1 路再新增：仍是共用聊天室（1 個聊天室、i 保留）', async () => {
            useStreamStore.setState({ layoutMode: 'canvas', streams: [mk(1, 'a'), mk(2, 'b'), mk(3, 'c')], canvasItems: [] });
            useStreamStore.getState().applyTemplateLayout('template-3-sharedchat');
            const chatId = useStreamStore.getState().canvasItems.find(i => i.type === 'chat')!.i;

            useStreamStore.getState().removeStream(2, true);
            useStreamStore.getState().removeStream(3, true);
            let items = useStreamStore.getState().canvasItems;
            expect(items.filter(i => i.type === 'stream')).toHaveLength(1);
            expect(items.filter(i => i.type === 'chat')).toHaveLength(1);

            const r = await useStreamStore.getState().addStream('https://www.twitch.tv/newone');
            expect(r.success).toBe(true);
            items = useStreamStore.getState().canvasItems;
            expect(items.filter(i => i.type === 'chat')).toHaveLength(1);
            expect(items.filter(i => i.type === 'stream')).toHaveLength(2);
            expect(items.find(i => i.type === 'chat')!.i).toBe(chatId);
        });

        it('自訂版面記住共用聊天室：只有 1 路時套用，之後新增仍是 1 個聊天室', async () => {
            useStreamStore.setState({
                layoutMode: 'canvas',
                streams: [mk(1, 'a')],
                canvasItems: [],
                customLayouts: [{
                    id: 'S1', name: 'shared', createdAt: 0,
                    slots: [
                        { x: 0, y: 0, w: 20, h: 12, type: 'stream' },
                        { x: 0, y: 12, w: 20, h: 12, type: 'stream' },
                        { x: 20, y: 0, w: 4, h: 24, type: 'chat', sharedChat: true },
                    ],
                }],
            });
            useStreamStore.getState().applyCustomLayout('S1');
            expect(useStreamStore.getState().canvasItems.find(i => i.type === 'chat')!.sharedChat).toBe(true);
            // 移除空槽後只剩 1 串流＋1 聊天室，仍要維持共用
            useStreamStore.setState({ canvasItems: useStreamStore.getState().canvasItems.filter(i => !(i.type === 'stream' && i.contentId == null)) });
            await useStreamStore.getState().addStream('https://www.twitch.tv/newone');
            expect(useStreamStore.getState().canvasItems.filter(i => i.type === 'chat')).toHaveLength(1);
        });

        it('從共用版面切到每路一聊，被沿用的聊天室不殘留標記', () => {
            useStreamStore.setState({ layoutMode: 'auto', streams: [mk(1, 'a'), mk(2, 'b')], canvasItems: [] });
            useStreamStore.getState().applyTemplateLayout('template-2-sharedchat');
            const chatId = useStreamStore.getState().canvasItems.find(i => i.type === 'chat')!.i;
            useStreamStore.getState().applyAutoLayout('with_chat');
            const reused = useStreamStore.getState().canvasItems.find(i => i.i === chatId);
            expect(reused).toBeDefined();
            expect(reused!.sharedChat).toBeFalsy();
        });

        it('「1 人含聊天室」再新增一路：行為不變，仍是每路各一個聊天室', async () => {
            useStreamStore.setState({ layoutMode: 'canvas', streams: [mk(1, 'a')], canvasItems: [] });
            useStreamStore.getState().applyTemplateLayout('template-1-chat');
            const r = await useStreamStore.getState().addStream('https://www.twitch.tv/newone');
            expect(r.success).toBe(true);
            expect(useStreamStore.getState().canvasItems.filter(i => i.type === 'chat')).toHaveLength(2);
        });
    });

    // 手動新增視窗（動態島 ＋）原本固定 6×6 塞在空位，常常很小或在畫面下方；改為新增後依目前組成重排、填滿畫布。
    describe('新增視窗後自動融入版面', () => {
        const mk = (id: number, ch: string) => ({ id, platform: 'twitch' as const, channelId: ch, videoId: '', originalUrl: '', volume: 100, chatVisible: false, isMuted: false });
        const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
        const area = (items: { layout: { w: number; h: number } }[]) => items.reduce((a, i) => a + i.layout.w * i.layout.h, 0);
        const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
            a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        const expectNoOverlap = (items: { i: string; layout: { x: number; y: number; w: number; h: number } }[]) => {
            for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
                expect(overlaps(items[a].layout, items[b].layout), `${items[a].i} / ${items[b].i}`).toBe(false);
            }
        };
        const base = () => [
            { i: 'w1', type: 'stream' as const, contentId: 1, layout: L(0, 0, 20, 12) },
            { i: 'w2', type: 'stream' as const, contentId: 2, layout: L(0, 12, 20, 12) },
            { i: 'chat', type: 'chat' as const, contentId: 1, layout: L(20, 0, 4, 24), sharedChat: true },
        ];

        it('新增串流視窗：既有 i 不變、新的空槽排最後、整個畫布填滿不重疊', () => {
            useStreamStore.setState({ layoutMode: 'canvas', streams: [mk(1, 'a'), mk(2, 'b')], canvasItems: base() });
            useStreamStore.getState().addCanvasItem('stream', null);
            const items = useStreamStore.getState().canvasItems;
            expect(items).toHaveLength(4);
            for (const id of ['w1', 'w2', 'chat']) expect(items.map(i => i.i)).toContain(id);
            expectNoOverlap(items);
            expect(area(items)).toBe(24 * 24);
            expect(items.find(i => i.i === 'chat')!.layout).toEqual(L(20, 0, 4, 24));
            // 原本在上面的 w1 仍排在最前面
            const w1 = items.find(i => i.i === 'w1')!.layout;
            expect([w1.x, w1.y]).toEqual([0, 0]);
            // 內容不變
            expect(items.find(i => i.i === 'w1')!.contentId).toBe(1);
            expect(items.find(i => i.i === 'chat')!.contentId).toBe(1);
        });

        it('新增聊天室視窗：聊天室在右側一欄上下平分', () => {
            useStreamStore.setState({ layoutMode: 'canvas', streams: [mk(1, 'a'), mk(2, 'b')], canvasItems: base() });
            useStreamStore.getState().addCanvasItem('chat', null);
            const items = useStreamStore.getState().canvasItems;
            const chats = items.filter(i => i.type === 'chat');
            expect(chats).toHaveLength(2);
            expect(chats.map(c => c.layout.x)).toEqual([20, 20]);
            expect(chats.reduce((a, c) => a + c.layout.h, 0)).toBe(24);
            expectNoOverlap(items);
            expect(area(items)).toBe(24 * 24);
        });

        it('新增組合（串流＋聊天室）也會重排填滿', () => {
            useStreamStore.setState({
                layoutMode: 'canvas', streams: [mk(1, 'a')],
                canvasItems: [{ i: 'w1', type: 'stream', contentId: 1, layout: L(0, 0, 24, 24) }],
            });
            useStreamStore.getState().addEmptyGroup();
            const items = useStreamStore.getState().canvasItems;
            expect(items).toHaveLength(3);
            expectNoOverlap(items);
            expect(area(items)).toBe(24 * 24);
        });

        it('沒有聊天室時，串流填滿整個畫布', () => {
            useStreamStore.setState({
                layoutMode: 'canvas', streams: [mk(1, 'a')],
                canvasItems: [{ i: 'w1', type: 'stream', contentId: 1, layout: L(0, 0, 24, 24) }],
            });
            useStreamStore.getState().addCanvasItem('stream', null);
            const items = useStreamStore.getState().canvasItems;
            expectNoOverlap(items);
            expect(area(items)).toBe(24 * 24);
        });
    });
});
