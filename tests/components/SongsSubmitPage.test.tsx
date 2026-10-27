// 投稿歌回時間軸頁：貼網址自動帶標題、貼時間軸匯入後送出成功；同影片已有待審時顯示 409 文案
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../src/i18n/i18n';

vi.mock('../../src/utils/analytics', () => ({ logEvent: vi.fn(), track: {} }));
vi.mock('../../src/utils/apiLoader', () => ({ apiLoader: { loadYouTubePlayerApi: vi.fn(async () => undefined) } }));
// Turnstile 是外部服務：直接給 token
vi.mock('../../src/components/turnstile/TurnstileWidget', async () => {
    const React = await import('react');
    return {
        TurnstileWidget: React.forwardRef(function FakeTurnstile({ onToken }: { onToken: (t: string | null) => void }, ref) {
            React.useImperativeHandle(ref, () => ({ reset: () => {} }));
            React.useEffect(() => { onToken('tok'); }, [onToken]);
            return null;
        }),
    };
});

import { SongsSubmitPage } from '../../src/components/Pages/SongsSubmitPage';
import { resetRestConfigCache } from '../../src/features/schedule/restClient';

beforeAll(async () => {
    await i18n.changeLanguage('zh-TW');
});

class FakePlayer {
    seekTo = vi.fn();
    playVideo = vi.fn();
    destroy = vi.fn();
    getCurrentTime = () => 0;
    getDuration = () => 0;
}

const VIDEO = 'AbCdEfGhIjK';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
let submitResponse: () => Response;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    resetRestConfigCache();
    submitResponse = () => json({ ok: true, id: 's1', kind: 'new' }, 201);
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/songs/catalog')) return json([]);
        if (url.startsWith('https://www.youtube.com/oembed')) return json({ title: '測試歌回 #1' });
        if (url.startsWith('/api/supabase-config')) return json({ url: 'https://db.example.co', anonKey: 'anon' });
        if (url.includes('/rest/v1/streams')) return json([]);
        if (url.startsWith('/api/songs/submissions')) return submitResponse();
        return json({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    (window as unknown as { YT: unknown }).YT = { Player: FakePlayer };
});

afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as { YT?: unknown }).YT;
});

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <SongsSubmitPage />
        </QueryClientProvider>,
    );
}

async function fillAndSubmit() {
    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: 'YouTube 網址' }), { target: { value: `https://youtu.be/${VIDEO}` } });
    await waitFor(() => expect(screen.getByRole('textbox', { name: '歌回標題' })).toHaveValue('測試歌回 #1'));
    fireEvent.change(screen.getByRole('textbox', { name: '時間軸文字' }), { target: { value: '0:10-3:00 歌A / 原唱A' } });
    fireEvent.click(screen.getByRole('button', { name: /取代現有片段/ }));
    const send = screen.getByRole('button', { name: '送出投稿' });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
}

const submitCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/songs/submissions'));

describe('SongsSubmitPage', () => {
    it('殼層有標題，送出成功顯示審核提示並帶上片段與 Turnstile token', async () => {
        await fillAndSubmit();
        expect(await screen.findByText('已送出，審核通過後會出現在歌單')).toBeInTheDocument();
        const [, init] = submitCalls()[0] as [string, RequestInit];
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({
            videoId: VIDEO,
            title: '測試歌回 #1',
            turnstileToken: 'tok',
            segments: [{ start: 10, end: 180, title: '歌A', artist: '原唱A', endEstimated: false }],
        });
    });

    it('同影片已有待審投稿時顯示 409 文案、不顯示成功', async () => {
        submitResponse = () => json({ ok: false, error: 'already_pending' }, 409);
        await fillAndSubmit();
        expect(await screen.findByRole('alert')).toHaveTextContent('這支影片你已有待審投稿，請等審核結果');
        expect(screen.queryByText('已送出，審核通過後會出現在歌單')).toBeNull();
    });

    it('沒有片段時送出鍵停用', async () => {
        renderPage();
        expect(screen.getByRole('heading', { level: 1, name: '投稿歌回時間軸' })).toBeInTheDocument();
        fireEvent.change(screen.getByRole('textbox', { name: 'YouTube 網址' }), { target: { value: VIDEO } });
        await waitFor(() => expect(screen.getByRole('textbox', { name: '歌回標題' })).toHaveValue('測試歌回 #1'));
        expect(screen.getByRole('button', { name: '送出投稿' })).toBeDisabled();
    });
});

// ---------- v1.2.1：換影片時清掉上一支的自動預填 ----------
describe('SongsSubmitPage 換影片', () => {
    const A = 'AAAAAAAAAAA';
    const B = 'BBBBBBBBBBB';
    const urlOf = (id: string) => `https://youtu.be/${id}`;
    const CATALOG_A = [{ v: A, t: '已上架歌回A', d: null, vt: null, s: [['abcd1234', 10, 200, '歌A', '原唱A']] }];

    /** A 已上架（目錄有片段）、B 未上架（只有 oEmbed 標題）；可另指定 B 也已上架 */
    function mockCatalog(extra: unknown[] = []) {
        fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.startsWith('/api/songs/catalog')) return json([...CATALOG_A, ...extra]);
            if (url.startsWith('https://www.youtube.com/oembed')) return json({ title: url.includes(A) ? '已上架歌回A' : 'B 的 oEmbed 標題' });
            if (url.startsWith('/api/supabase-config')) return json({ url: 'https://db.example.co', anonKey: 'anon' });
            if (url.includes('/rest/v1/streams')) return json([]);
            return json({}, 404);
        });
    }
    const urlBox = () => screen.getByRole('textbox', { name: 'YouTube 網址' });
    const titleBox = () => screen.getByRole('textbox', { name: '歌回標題' });
    const firstSong = () => screen.queryByRole('textbox', { name: '第 1 首歌名' });
    const oembedCalls = (id: string) => fetchMock.mock.calls.filter(([u]) => String(u).startsWith('https://www.youtube.com/oembed') && String(u).includes(id));
    const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    async function pasteA() {
        renderPage();
        fireEvent.change(urlBox(), { target: { value: urlOf(A) } });
        await waitFor(() => expect(titleBox()).toHaveValue('已上架歌回A'));
        await waitFor(() => expect(screen.getByRole('textbox', { name: '第 1 首歌名' })).toHaveValue('歌A'));
    }

    it('貼 A（已上架）帶入 A 的標題與片段；換成未上架的 B 後標題改為 B、不殘留 A 的片段', async () => {
        mockCatalog();
        await pasteA();
        fireEvent.change(urlBox(), { target: { value: urlOf(B) } });
        await waitFor(() => expect(titleBox()).toHaveValue('B 的 oEmbed 標題'));
        await settle();
        expect(firstSong()).toBeNull();
        expect(screen.getByRole('button', { name: '送出投稿' })).toBeDisabled();
    });

    it('換成同樣已上架的 B：標題與片段都改成 B 的，不混入 A 的', async () => {
        mockCatalog([{ v: B, t: 'B 已上架歌回', d: null, vt: null, s: [['wxyz9876', 30, 90, '歌B', null]] }]);
        await pasteA();
        fireEvent.change(urlBox(), { target: { value: urlOf(B) } });
        await waitFor(() => expect(screen.getByRole('textbox', { name: '第 1 首歌名' })).toHaveValue('歌B'));
        expect(screen.queryByRole('textbox', { name: '第 2 首歌名' })).toBeNull();
        expect(titleBox()).not.toHaveValue('已上架歌回A');
    });

    it('使用者手動改過標題後換影片，自訂標題保留不被覆蓋', async () => {
        mockCatalog();
        await pasteA();
        fireEvent.change(titleBox(), { target: { value: '自訂' } });
        fireEvent.change(urlBox(), { target: { value: urlOf(B) } });
        await waitFor(() => expect(oembedCalls(B).length).toBeGreaterThan(0));
        await settle();
        expect(titleBox()).toHaveValue('自訂');
    });

    it('使用者自己貼的片段列換影片後保留，只清掉從目錄預填的那份', async () => {
        mockCatalog();
        await pasteA();
        fireEvent.change(screen.getByRole('textbox', { name: '時間軸文字' }), { target: { value: '0:10-3:00 歌X / 原唱X' } });
        fireEvent.click(screen.getByRole('button', { name: /取代現有片段/ }));
        await waitFor(() => expect(screen.getByRole('textbox', { name: '第 1 首歌名' })).toHaveValue('歌X'));
        fireEvent.change(urlBox(), { target: { value: urlOf(B) } });
        await waitFor(() => expect(titleBox()).toHaveValue('B 的 oEmbed 標題'));
        await settle();
        expect(screen.getByRole('textbox', { name: '第 1 首歌名' })).toHaveValue('歌X');
    });

    it('把網址清空：A 自動帶入的標題與片段跟著清掉', async () => {
        mockCatalog();
        await pasteA();
        fireEvent.change(urlBox(), { target: { value: '' } });
        await waitFor(() => expect(titleBox()).toHaveValue(''));
        expect(firstSong()).toBeNull();
    });
});

// ---------- v1.3 C3：投稿帶版本備註 ----------
describe('SongsSubmitPage 版本備註（C3）', () => {
    const noteBoxes = () => screen.getAllByRole('textbox').filter((el) => (el.getAttribute('aria-label') ?? '').includes('備註'));

    async function importOne() {
        renderPage();
        fireEvent.change(screen.getByRole('textbox', { name: 'YouTube 網址' }), { target: { value: `https://youtu.be/${VIDEO}` } });
        await waitFor(() => expect(screen.getByRole('textbox', { name: '歌回標題' })).toHaveValue('測試歌回 #1'));
        fireEvent.change(screen.getByRole('textbox', { name: '時間軸文字' }), { target: { value: '0:10-3:00 歌A / 原唱A' } });
        fireEvent.click(screen.getByRole('button', { name: /取代現有片段/ }));
        await waitFor(() => expect(noteBoxes()).toHaveLength(1));
    }
    async function send() {
        const btn = screen.getByRole('button', { name: /^送出(投稿|修正)$/ });
        await waitFor(() => expect(btn).toBeEnabled());
        fireEvent.click(btn);
        await waitFor(() => expect(submitCalls()).toHaveLength(1));
        const [, init] = submitCalls()[0] as [string, RequestInit];
        return JSON.parse(String(init.body)).segments as { versionNote: string | null }[];
    }

    it('填了備註：送出的片段帶 versionNote（trim 後）', async () => {
        await importOne();
        fireEvent.change(noteBoxes()[0], { target: { value: '  清唱 ' } });
        expect((await send())[0].versionNote).toBe('清唱');
    });

    it('沒填備註：versionNote 是 null，不是空字串', async () => {
        await importOne();
        expect((await send())[0].versionNote).toBeNull();
    });

    it('備註只有空白：versionNote 是 null', async () => {
        await importOne();
        fireEvent.change(noteBoxes()[0], { target: { value: '   ' } });
        expect((await send())[0].versionNote).toBeNull();
    });

    it('備註超過 30 字：顯示錯誤、送出鍵停用', async () => {
        await importOne();
        fireEvent.change(noteBoxes()[0], { target: { value: '字'.repeat(31) } });
        expect(screen.getByText(/備註最多 30 字/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '送出投稿' })).toBeDisabled();
    });

    it('用目錄預填既有片段時，片段的 versionNote 帶進備註欄，原樣送出', async () => {
        const catalog = [{
            v: VIDEO, t: '已上架歌回', d: null, vt: null,
            s: [['abcd1234', 10, 200, '歌A', '原唱A', 3, 12, '清唱'], ['efgh5678', 300, 400, '歌B', null, 0, 13, null]],
        }, { songs: [[12, '歌A', '原唱A'], [13, '歌B', null]] }];
        fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.startsWith('/api/songs/catalog')) return json(catalog);
            if (url.startsWith('https://www.youtube.com/oembed')) return json({ title: '已上架歌回' });
            if (url.startsWith('/api/supabase-config')) return json({ url: 'https://db.example.co', anonKey: 'anon' });
            if (url.includes('/rest/v1/streams')) return json([]);
            if (url.startsWith('/api/songs/submissions')) return submitResponse();
            return json({}, 404);
        });
        renderPage();
        fireEvent.change(screen.getByRole('textbox', { name: 'YouTube 網址' }), { target: { value: `https://youtu.be/${VIDEO}` } });
        await waitFor(() => expect(screen.getByRole('textbox', { name: '第 2 首歌名' })).toHaveValue('歌B'));
        await waitFor(() => expect(noteBoxes().map((b) => (b as HTMLInputElement).value)).toEqual(['清唱', '']));
        expect((await send()).map((s) => s.versionNote)).toEqual(['清唱', null]);
    });
});
