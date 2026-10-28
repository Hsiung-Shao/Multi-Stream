// 投稿歌回時間軸頁（送出立即生效）：新歌回要選 VTuber、修正既有歌回讀 /api/songs/timeline 即時資料（帶 code 與 rev、不能刪既有片段、鎖定不能改、版本衝突提示）
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
const VT = '11111111-1111-1111-1111-111111111111';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
let submitResponse: () => Response;
let timelineResponse: (url: string) => Response;
let fetchMock: ReturnType<typeof vi.fn>;

/** GET /api/songs/timeline?v= 的 200 回應（即時資料，每段帶 code） */
const timelineBody = (over: Record<string, unknown> = {}) => ({
    ok: true,
    data: {
        videoId: VIDEO, title: '既有歌回', vtuber: { id: VT, name: '星川測試', img: null }, streamedAt: '2026-10-01T12:00:00.000Z',
        durationSeconds: null, rev: '2026-10-28T01:02:03.456Z', locked: false,
        segments: [
            { code: 'abcd1234', start: 10, end: 200, title: '歌A', artist: '原唱A', note: null },
            { code: 'efgh5678', start: 200, end: 400, title: '歌B', artist: null, note: '清唱' },
        ],
        ...over,
    },
});
const NOT_FOUND = () => json({ ok: false, error: 'not_found' }, 404);

beforeEach(() => {
    resetRestConfigCache();
    submitResponse = () => json({ ok: true, id: 's1', kind: 'new' }, 201);
    timelineResponse = NOT_FOUND;
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/songs/catalog')) return json([]);
        if (url.startsWith('/api/songs/timeline')) return timelineResponse(url);
        if (url.includes('/rest/v1/vtubers')) return json([]);
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
    window.history.replaceState(null, '', '/');
});

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <SongsSubmitPage />
        </QueryClientProvider>,
    );
}

/** 選 VTuber：貼 uuid 到搜尋框即選定（新歌回必填） */
function pickVtuber() {
    fireEvent.change(screen.getByRole('textbox', { name: '搜尋 VTuber 名稱' }), { target: { value: VT } });
}

const SEND = /^送出(投稿|修正)?$/;
const submitCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/songs/submissions'));
const timelineCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/songs/timeline'));
const lastBody = () => JSON.parse(String((submitCalls()[0] as [string, RequestInit])[1].body));

/** 新歌回：貼網址、等標題、匯入一首、選 VTuber，按送出 */
async function fillAndSubmit({ vtuber = true }: { vtuber?: boolean } = {}) {
    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: 'YouTube 網址' }), { target: { value: `https://youtu.be/${VIDEO}` } });
    await waitFor(() => expect(screen.getByRole('textbox', { name: '歌回標題' })).toHaveValue('測試歌回 #1'));
    fireEvent.change(screen.getByRole('textbox', { name: '時間軸文字' }), { target: { value: '0:10-3:00 歌A / 原唱A' } });
    fireEvent.click(screen.getByRole('button', { name: /取代現有片段/ }));
    if (vtuber) pickVtuber();
    const send = screen.getByRole('button', { name: SEND });
    if (vtuber) await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
}

/** 修正模式：網址帶 ?v=，等 timeline 的片段預填進表格 */
async function openRevision() {
    window.history.replaceState(null, '', `/songs/submit?v=${VIDEO}`);
    renderPage();
    await waitFor(() => expect(screen.getByRole('textbox', { name: '第 2 首歌名' })).toHaveValue('歌B'));
}

describe('SongsSubmitPage 新歌回', () => {
    it('殼層有標題，送出成功帶上片段、VTuber 與 Turnstile token，成功畫面不提審核', async () => {
        await fillAndSubmit();
        await waitFor(() => expect(screen.queryByRole('button', { name: SEND })).toBeNull());
        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(document.body.textContent).not.toContain('審核');
        const body = lastBody();
        expect(body).toMatchObject({
            videoId: VIDEO,
            title: '測試歌回 #1',
            vtuberId: VT,
            turnstileToken: 'tok',
            segments: [{ start: 10, end: 180, title: '歌A', artist: '原唱A', endEstimated: false }],
        });
        expect(body.rev ?? null).toBeNull();
    });

    it('沒有片段時送出鍵停用', async () => {
        renderPage();
        expect(screen.getByRole('heading', { level: 1, name: '投稿歌回時間軸' })).toBeInTheDocument();
        fireEvent.change(screen.getByRole('textbox', { name: 'YouTube 網址' }), { target: { value: VIDEO } });
        await waitFor(() => expect(screen.getByRole('textbox', { name: '歌回標題' })).toHaveValue('測試歌回 #1'));
        expect(screen.getByRole('button', { name: SEND })).toBeDisabled();
    });

    it('新歌回沒選 VTuber 不能送：顯示「請選擇 VTuber」且不呼叫 submissions（C3）', async () => {
        await fillAndSubmit({ vtuber: false });
        expect((await screen.findAllByText('請選擇 VTuber')).length).toBeGreaterThan(0);
        await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
        expect(submitCalls()).toHaveLength(0);
    });

    it('選了 VTuber 之後「請選擇 VTuber」消失、送出鍵可按', async () => {
        await fillAndSubmit({ vtuber: false });
        await screen.findAllByText('請選擇 VTuber');
        pickVtuber();
        await waitFor(() => expect(screen.queryByText('請選擇 VTuber')).toBeNull());
        expect(screen.getByRole('button', { name: SEND })).toBeEnabled();
    });
});

describe('SongsSubmitPage 文案（C5）', () => {
    it('送出前提示「送出後立即更新，目錄約 10 分鐘內同步。」且頁面不出現「審核」', () => {
        renderPage();
        expect(screen.getByText('送出後立即更新，目錄約 10 分鐘內同步。')).toBeInTheDocument();
        expect(document.body.textContent).not.toContain('審核');
    });

    it('修正模式的頁面也不出現「審核」', async () => {
        timelineResponse = () => json(timelineBody());
        await openRevision();
        expect(screen.getByText('送出後立即更新，目錄約 10 分鐘內同步。')).toBeInTheDocument();
        expect(document.body.textContent).not.toContain('審核');
    });
});

// ---------- 社群直接編輯：修正既有歌回讀 timeline 即時資料 ----------
describe('SongsSubmitPage 修正既有歌回（C1／C2／C4）', () => {
    const DEL_TITLE = '既有片段不能刪除，可以修改時間或歌名';

    it('帶 ?v= 會讀 /api/songs/timeline?v= 並把片段預填進表格', async () => {
        timelineResponse = () => json(timelineBody());
        await openRevision();
        expect(timelineCalls().length).toBeGreaterThan(0);
        expect(String(timelineCalls()[0][0])).toContain(`v=${VIDEO}`);
        expect(screen.getByRole('textbox', { name: '第 1 首歌名' })).toHaveValue('歌A');
        expect(screen.getByRole('button', { name: '送出修正' })).toBeInTheDocument();
    });

    it('既有片段的刪除鈕停用並說明原因；新增的列可以刪除（C1）', async () => {
        timelineResponse = () => json(timelineBody());
        await openRevision();
        for (const n of [1, 2]) {
            const del = screen.getByRole('button', { name: `刪除第 ${n} 首` });
            expect(del).toBeDisabled();
            expect(del).toHaveAttribute('title', DEL_TITLE);
        }
        fireEvent.click(screen.getByRole('button', { name: '新增一列' }));
        const added = await screen.findByRole('button', { name: '刪除第 3 首' });
        expect(added).toBeEnabled();
        fireEvent.click(added);
        await waitFor(() => expect(screen.queryByRole('textbox', { name: '第 3 首歌名' })).toBeNull());
        expect(screen.getByRole('textbox', { name: '第 2 首歌名' })).toHaveValue('歌B');
    });

    it('鎖定的歌回顯示鎖定提示、送出鍵停用（C2）', async () => {
        timelineResponse = () => json(timelineBody({ locked: true }));
        window.history.replaceState(null, '', `/songs/submit?v=${VIDEO}`);
        renderPage();
        expect((await screen.findAllByText('這場歌回已鎖定，暫不開放編輯')).length).toBeGreaterThan(0);
        await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
        expect(screen.getByRole('button', { name: SEND })).toBeDisabled();
    });

    it('沒鎖定時同樣的資料送出鍵可按（鎖定測試的對照）', async () => {
        timelineResponse = () => json(timelineBody());
        await openRevision();
        await waitFor(() => expect(screen.getByRole('button', { name: SEND })).toBeEnabled());
        expect(screen.queryByText('這場歌回已鎖定，暫不開放編輯')).toBeNull();
    });

    it('送出帶 rev、VTuber 與既有片段的 code，新增列沒有 code（C4）', async () => {
        timelineResponse = () => json(timelineBody());
        submitResponse = () => json({ ok: true, id: 's2', kind: 'revision' }, 201);
        await openRevision();
        fireEvent.click(screen.getByRole('button', { name: '新增一列' }));
        fireEvent.change(await screen.findByRole('textbox', { name: '第 3 首開始時間' }), { target: { value: '7:00' } });
        fireEvent.change(screen.getByRole('textbox', { name: '第 3 首結束時間' }), { target: { value: '9:00' } });
        fireEvent.change(screen.getByRole('textbox', { name: '第 3 首歌名' }), { target: { value: '歌C' } });
        const send = screen.getByRole('button', { name: SEND });
        await waitFor(() => expect(send).toBeEnabled());
        fireEvent.click(send);
        await waitFor(() => expect(submitCalls()).toHaveLength(1));
        const body = lastBody();
        expect(body).toMatchObject({ videoId: VIDEO, rev: '2026-10-28T01:02:03.456Z', vtuberId: VT });
        expect(body.segments.map((x: { code?: string }) => x.code)).toEqual(['abcd1234', 'efgh5678', undefined]);
        expect(body.segments[0]).toMatchObject({ start: 10, end: 200, title: '歌A' });
        expect(body.segments[2]).toMatchObject({ start: 420, end: 540, title: '歌C' });
        expect(document.body.textContent).not.toContain('審核');
    });

    it('改既有片段的歌名後送出，code 不變（C4）', async () => {
        timelineResponse = () => json(timelineBody());
        submitResponse = () => json({ ok: true, id: 's2', kind: 'revision' }, 201);
        await openRevision();
        fireEvent.change(screen.getByRole('textbox', { name: '第 1 首歌名' }), { target: { value: '歌A改' } });
        const send = screen.getByRole('button', { name: SEND });
        await waitFor(() => expect(send).toBeEnabled());
        fireEvent.click(send);
        await waitFor(() => expect(submitCalls()).toHaveLength(1));
        expect(lastBody().segments[0]).toMatchObject({ code: 'abcd1234', title: '歌A改' });
    });

    it('後端回 409 stale_edit 時提示重新整理、不顯示成功（C4）', async () => {
        timelineResponse = () => json(timelineBody());
        submitResponse = () => json({ ok: false, error: 'stale_edit' }, 409);
        await openRevision();
        const send = screen.getByRole('button', { name: SEND });
        await waitFor(() => expect(send).toBeEnabled());
        fireEvent.click(send);
        expect(await screen.findByRole('alert')).toHaveTextContent('這場歌回剛被別人更新，請重新整理後再編輯');
        expect(screen.queryByRole('status')).toBeNull();
        expect(submitCalls()).toHaveLength(1);
    });

    it('後端回 403 video_locked 時顯示鎖定提示', async () => {
        timelineResponse = () => json(timelineBody());
        submitResponse = () => json({ ok: false, error: 'video_locked' }, 403);
        await openRevision();
        const send = screen.getByRole('button', { name: SEND });
        await waitFor(() => expect(send).toBeEnabled());
        fireEvent.click(send);
        expect(await screen.findByRole('alert')).toHaveTextContent('這場歌回已鎖定，暫不開放編輯');
    });

    it('後端回 400 cannot_delete 時顯示不能刪除的說明', async () => {
        timelineResponse = () => json(timelineBody());
        submitResponse = () => json({ ok: false, error: 'cannot_delete' }, 400);
        await openRevision();
        const send = screen.getByRole('button', { name: SEND });
        await waitFor(() => expect(send).toBeEnabled());
        fireEvent.click(send);
        expect(await screen.findByRole('alert')).toHaveTextContent('不能刪除既有片段；需要刪除請用意見回饋告訴站方');
    });

    it('開台時間沒改過：送出原始 ISO（保留秒與毫秒），不被 datetime-local 截到分鐘', async () => {
        const ISO = '2026-10-23T09:39:07.679176+00:00';
        timelineResponse = () => json(timelineBody({ streamedAt: ISO }));
        submitResponse = () => json({ ok: true, id: 's2', kind: 'revision' }, 201);
        await openRevision();
        const send = screen.getByRole('button', { name: SEND });
        await waitFor(() => expect(send).toBeEnabled());
        fireEvent.click(send);
        await waitFor(() => expect(submitCalls()).toHaveLength(1));
        expect(lastBody().streamedAt).toBe(ISO);
    });

    it('開台時間使用者改過：送出新輸入值（不是原始 ISO）', async () => {
        timelineResponse = () => json(timelineBody({ streamedAt: '2026-10-23T09:39:07.679176+00:00' }));
        submitResponse = () => json({ ok: true, id: 's2', kind: 'revision' }, 201);
        await openRevision();
        fireEvent.change(screen.getByLabelText('開台時間（選填）'), { target: { value: '2026-10-24T10:15' } });
        const send = screen.getByRole('button', { name: SEND });
        await waitFor(() => expect(send).toBeEnabled());
        fireEvent.click(send);
        await waitFor(() => expect(submitCalls()).toHaveLength(1));
        expect(lastBody().streamedAt).toBe(new Date('2026-10-24T10:15').toISOString());
    });

    it('送出成功後按「再投一支」再貼同一支：用新讀到的 timeline 預填，rev 與片段都是新的', async () => {
        let n = 0;
        timelineResponse = () => json(n++ === 0
            ? timelineBody()
            : timelineBody({
                rev: '2026-10-28T09:09:09.999999Z',
                segments: [
                    { code: 'abcd1234', start: 10, end: 200, title: '歌A改', artist: '原唱A', note: null },
                    { code: 'efgh5678', start: 200, end: 400, title: '歌B', artist: null, note: '清唱' },
                ],
            }));
        submitResponse = () => json({ ok: true, id: 's2', kind: 'revision' }, 201);
        await openRevision();
        const send1 = screen.getByRole('button', { name: SEND });
        await waitFor(() => expect(send1).toBeEnabled());
        fireEvent.click(send1);
        fireEvent.click(await screen.findByRole('button', { name: '再投一支' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'YouTube 網址' }), { target: { value: `https://youtu.be/${VIDEO}` } });
        await waitFor(() => expect(screen.getByRole('textbox', { name: '第 1 首歌名' })).toHaveValue('歌A改'));
        const send2 = screen.getByRole('button', { name: SEND });
        await waitFor(() => expect(send2).toBeEnabled());
        fireEvent.click(send2);
        await waitFor(() => expect(submitCalls()).toHaveLength(2));
        const body = JSON.parse(String((submitCalls()[1] as [string, RequestInit])[1].body));
        expect(body.rev).toBe('2026-10-28T09:09:09.999999Z');
        expect(body.segments[0]).toMatchObject({ code: 'abcd1234', title: '歌A改' });
    });

    it('timeline 是 404（不存在或未發布）時當新歌回，按鈕是送出投稿', async () => {
        window.history.replaceState(null, '', `/songs/submit?v=${VIDEO}`);
        renderPage();
        await waitFor(() => expect(screen.getByRole('textbox', { name: '歌回標題' })).toHaveValue('測試歌回 #1'));
        await waitFor(() => expect(timelineCalls().length).toBeGreaterThan(0));
        expect(screen.queryByRole('button', { name: '送出修正' })).toBeNull();
        expect(screen.getByRole('button', { name: '送出投稿' })).toBeInTheDocument();
    });
});

// ---------- v1.2.1：換影片時清掉上一支的自動預填 ----------
describe('SongsSubmitPage 換影片', () => {
    const A = 'AAAAAAAAAAA';
    const B = 'BBBBBBBBBBB';
    const urlOf = (id: string) => `https://youtu.be/${id}`;
    const TL_A = timelineBody({ videoId: A, title: '已上架歌回A', vtuber: null, segments: [{ code: 'abcd1234', start: 10, end: 200, title: '歌A', artist: '原唱A', note: null }] });
    const TL_B = timelineBody({ videoId: B, title: 'B 已上架歌回', vtuber: null, segments: [{ code: 'wxyz9876', start: 30, end: 90, title: '歌B', artist: null, note: null }] });

    /** A 已上架（timeline 有片段）、B 未上架（timeline 404，只有 oEmbed 標題）；可另指定 B 也已上架 */
    function mockCatalog(bPublished = false) {
        fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.startsWith('/api/songs/catalog')) return json([]);
            if (url.startsWith('/api/songs/timeline')) {
                if (url.includes(A)) return json(TL_A);
                if (url.includes(B) && bPublished) return json(TL_B);
                return NOT_FOUND();
            }
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
        mockCatalog(true);
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
        pickVtuber();
        await waitFor(() => expect(noteBoxes()).toHaveLength(1));
    }
    async function send() {
        const btn = screen.getByRole('button', { name: SEND });
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

    it('用 timeline 預填既有片段時，片段的 note 帶進備註欄，原樣送出', async () => {
        timelineResponse = () => json(timelineBody());
        window.history.replaceState(null, '', `/songs/submit?v=${VIDEO}`);
        renderPage();
        await waitFor(() => expect(screen.getByRole('textbox', { name: '第 2 首歌名' })).toHaveValue('歌B'));
        await waitFor(() => expect(noteBoxes().map((b) => (b as HTMLInputElement).value)).toEqual(['', '清唱']));
        expect((await send()).map((s) => s.versionNote)).toEqual([null, '清唱']);
    });
});
