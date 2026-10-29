// 後台歌回列表：每頁筆數、換頁、建立時間篩選（C1～C4）
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../src/i18n/i18n';
import { AdminSongsTab } from '../../../src/features/admin/components/AdminSongsTab';

vi.mock('../../../src/utils/apiLoader', () => ({ apiLoader: { loadYouTubePlayerApi: vi.fn(async () => undefined) } }));

const VIDEO = 'dQw4w9WgXcQ';
const TOTAL = 40;

type Call = { url: string; method: string; params: URLSearchParams };
let calls: Call[] = [];
/** 篩選（帶 created_from）時要回的總數；null 表示照 TOTAL */
let filteredTotal: number | null;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

const videoRow = (n: number) => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    video_id: VIDEO, title: `歌回${n}`, vtuber_id: null, streamed_at: '2026-10-01T12:00:00Z',
    duration_seconds: 5400, status: 'published', community_locked: false, segment_count: 3,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
});

/** 列表 GET：/api/admin/songs?page=…（沒有 id 參數） */
const listGets = () => calls.filter((c) => c.method === 'GET' && c.url.startsWith('/api/admin/songs') && !c.params.has('id'));
const lastList = () => listGets()[listGets().length - 1];

beforeAll(async () => {
    await i18n.changeLanguage('zh-TW');
});

beforeEach(() => {
    calls = [];
    filteredTotal = null;
    // jsdom 缺的 Pointer／scrollIntoView，Radix Select 開啟時會用到
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => {};
    Element.prototype.scrollIntoView ??= () => {};
    localStorage.setItem('ms_admin_api_token', 'tok');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const params = new URL(url, 'http://localhost').searchParams;
        calls.push({ url, method, params });
        if (url.startsWith('/api/admin/song-submissions')) return json({ ok: true, submissions: [] });
        if (url.startsWith('/api/admin/songs') && method === 'GET' && !params.has('id')) {
            const total = params.has('created_from') && filteredTotal !== null ? filteredTotal : TOTAL;
            const size = Number(params.get('page_size') ?? 15);
            const page = Number(params.get('page') ?? 1);
            const count = Math.max(0, Math.min(size, total - (page - 1) * size));
            return json({ ok: true, videos: Array.from({ length: count }, (_, i) => videoRow((page - 1) * size + i + 1)), total });
        }
        if (url.startsWith('/api/admin/song-library')) return json({ ok: true, data: [] });
        if (url.startsWith('/api/supabase-config')) return json({ url: 'https://db.example.co', anonKey: 'anon' });
        return new Response('[]');
    }));
});
afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
});

function renderTab() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AdminSongsTab active={false} /></QueryClientProvider>);
    return client;
}
const nextBtn = () => screen.getByRole('button', { name: '下一頁' });
const prevBtn = () => screen.getByRole('button', { name: '上一頁' });

describe('後台歌回列表分頁與篩選', () => {
    it('C1 每頁筆數選單只有 15／25／50／100 且預設 15', async () => {
        renderTab();
        await screen.findByText('歌回1');
        expect(listGets()[0].params.get('page_size')).toBe('15');
        expect(listGets()[0].params.get('page')).toBe('1');
        const trigger = screen.getByRole('combobox', { name: '每頁筆數' });
        expect(trigger.textContent).toMatch(/15/);
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        const options = await screen.findAllByRole('option');
        expect(options.map((o) => parseInt(o.textContent ?? '', 10))).toEqual([15, 25, 50, 100]);
    });

    it('C1b 選每頁 25 筆後請求 page_size=25 並回到第 1 頁', async () => {
        renderTab();
        await screen.findByText('歌回1');
        fireEvent.click(await screen.findByRole('button', { name: '下一頁' }));
        await waitFor(() => expect(lastList().params.get('page')).toBe('2'));
        fireEvent.keyDown(screen.getByRole('combobox', { name: '每頁筆數' }), { key: 'ArrowDown' });
        const opt = (await screen.findAllByRole('option')).find((o) => parseInt(o.textContent ?? '', 10) === 25)!;
        fireEvent.click(opt);
        await waitFor(() => expect(lastList().params.get('page_size')).toBe('25'));
        expect(lastList().params.get('page')).toBe('1');
    });

    it('C2 換頁送出對應頁碼並顯示頁數，最後一頁「下一頁」停用', async () => {
        renderTab();
        await screen.findByText(/共 40 支・第 1 \/ 3 頁/);
        expect(prevBtn()).toBeDisabled();
        expect(nextBtn()).toBeEnabled();

        fireEvent.click(nextBtn());
        await screen.findByText(/共 40 支・第 2 \/ 3 頁/);
        expect(lastList().params.get('page')).toBe('2');
        expect(lastList().params.get('page_size')).toBe('15');

        fireEvent.click(nextBtn());
        await screen.findByText(/共 40 支・第 3 \/ 3 頁/);
        expect(lastList().params.get('page')).toBe('3');
        expect(nextBtn()).toBeDisabled();
        expect(prevBtn()).toBeEnabled();
    });

    it('C3 選建立時間會帶起訖參數並回到第 1 頁', async () => {
        renderTab();
        await screen.findByText(/共 40 支・第 1 \/ 3 頁/);
        // 沒篩選時不帶日期參數
        expect(listGets()[0].params.has('created_from')).toBe(false);
        expect(listGets()[0].params.has('created_to')).toBe(false);

        fireEvent.click(nextBtn());
        await screen.findByText(/共 40 支・第 2 \/ 3 頁/);

        fireEvent.change(screen.getByLabelText('建立時間起'), { target: { value: '2026-10-01' } });
        fireEvent.change(screen.getByLabelText('建立時間迄'), { target: { value: '2026-10-08' } });

        const fromIso = new Date('2026-10-01T00:00:00').toISOString();
        const toIso = new Date('2026-10-09T00:00:00').toISOString();
        await waitFor(() => {
            const p = lastList().params;
            expect(p.get('created_from')).toBe(fromIso);
            expect(p.get('created_to')).toBe(toIso);
        });
        expect(lastList().params.get('page')).toBe('1');
        expect(lastList().params.get('page_size')).toBe('15');
    });

    it('C3b 按「清除」後回到未篩選的結果', async () => {
        filteredTotal = 5;
        renderTab();
        await screen.findByText(/共 40 支・第 1 \/ 3 頁/);
        fireEvent.change(screen.getByLabelText('建立時間起'), { target: { value: '2026-10-01' } });
        fireEvent.change(screen.getByLabelText('建立時間迄'), { target: { value: '2026-10-08' } });
        await waitFor(() => expect(lastList().params.has('created_from')).toBe(true));
        await screen.findByText(/共 5 支・第 1 \/ 1 頁/);
        fireEvent.click(screen.getByRole('button', { name: '清除' }));
        // 未篩選的第 1 頁 30 秒內查過會直接用快取（不一定再發請求），所以驗畫面回到未篩選的結果
        expect(screen.getByLabelText('建立時間起')).toHaveValue('');
        expect(screen.getByLabelText('建立時間迄')).toHaveValue('');
        expect(await screen.findByText(/共 40 支・第 1 \/ 3 頁/)).toBeInTheDocument();
    });

    it('C4 篩選沒有結果時顯示專用訊息', async () => {
        filteredTotal = 0;
        renderTab();
        await screen.findByText(/共 40 支・第 1 \/ 3 頁/);
        fireEvent.change(screen.getByLabelText('建立時間起'), { target: { value: '2026-10-01' } });
        fireEvent.change(screen.getByLabelText('建立時間迄'), { target: { value: '2026-10-08' } });
        expect(await screen.findByText('這個時間範圍內沒有歌回')).toBeInTheDocument();
        expect(screen.queryByText(/還沒有歌回/)).toBeNull();
    });
    it('C5 建立時間輸入五位數年份時畫面不崩潰且不帶該條件', async () => {
        renderTab();
        await screen.findByText(/共 40 支・第 1 \/ 3 頁/);
        fireEvent.change(screen.getByLabelText('建立時間起'), { target: { value: '20255-01-01' } });
        expect(screen.getByLabelText('建立時間起')).toBeInTheDocument();
        await screen.findByText(/共 40 支/);
        expect(lastList().params.has('created_from')).toBe(false);
    });

    it('C6 停在已不存在的頁碼時自動回到最後一頁', async () => {
        const client = renderTab();
        await screen.findByText(/共 40 支・第 1 \/ 3 頁/);
        fireEvent.click(nextBtn());
        await screen.findByText(/第 2 \/ 3 頁/);
        fireEvent.click(nextBtn());
        await screen.findByText(/第 3 \/ 3 頁/);
        // 別處刪掉資料：總數降到 20（共 2 頁），第 3 頁已經沒有了
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const params = new URL(url, 'http://localhost').searchParams;
            if (url.startsWith('/api/admin/songs') && (init?.method ?? 'GET') === 'GET' && !params.has('id')) {
                calls.push({ url, method: 'GET', params });
                const page = Number(params.get('page'));
                return json({ ok: true, videos: page === 3 ? [] : [videoRow(page)], total: 20 });
            }
            return new Response('[]');
        }));
        const before = listGets().length;
        await client.invalidateQueries();
        await waitFor(() => expect(listGets().slice(before).some((c) => c.params.get('page') === '2')).toBe(true));
        await screen.findByText(/共 20 支・第 2 \/ 2 頁/);
        expect(screen.queryByText(/還沒有歌回/)).toBeNull();
    });

    it('C6b 目前頁沒資料但總數大於 0 時不顯示「還沒有歌回」', async () => {
        renderTab();
        await screen.findByText(/共 40 支・第 1 \/ 3 頁/);
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.startsWith('/api/admin/songs')) return json({ ok: true, videos: [], total: 40 });
            return new Response('[]');
        }));
        fireEvent.click(nextBtn());
        await waitFor(() => expect(screen.queryByText('歌回1')).toBeNull());
        expect(screen.queryByText(/還沒有歌回/)).toBeNull();
    });

    it('C7 換頁讀取期間表格標示忙碌且上一頁／下一頁停用', async () => {
        renderTab();
        await screen.findByText(/共 40 支・第 1 \/ 3 頁/);
        fireEvent.click(nextBtn());
        await screen.findByText(/第 2 \/ 3 頁/);
        const base = (fetch as unknown as ReturnType<typeof vi.fn>).getMockImplementation()!;
        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
            const params = new URL(String(input), 'http://localhost').searchParams;
            if (String(input).startsWith('/api/admin/songs') && !params.has('id') && params.get('page') === '3') {
                return new Promise<Response>(() => {});
            }
            return base(input, init);
        }));
        fireEvent.click(nextBtn());
        const table = screen.getByRole('table').parentElement!;
        await waitFor(() => expect(table).toHaveAttribute('aria-busy', 'true'));
        expect(table.className).toContain('opacity-60');
        expect(nextBtn()).toBeDisabled();
        expect(prevBtn()).toBeDisabled();
    });
});
