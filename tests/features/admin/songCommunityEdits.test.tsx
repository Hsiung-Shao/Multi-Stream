// 後台歌回分頁：社群修改紀錄（列表、還原需確認）、編輯器「鎖定社群編輯」開關、不再有審核（C6a/C6b/C6c/C7）
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../src/i18n/i18n';
import { AdminSongsTab } from '../../../src/features/admin/components/AdminSongsTab';
import { SongVideoEditor } from '../../../src/features/admin/components/SongVideoEditor';

vi.mock('../../../src/utils/apiLoader', () => ({ apiLoader: { loadYouTubePlayerApi: vi.fn(async () => undefined) } }));

const SUB_NEW = '11111111-1111-4111-8111-111111111111';
const SUB_REV = '22222222-2222-4222-8222-222222222222';
const SUB_OLD = '33333333-3333-4333-8333-333333333333';
const VID = '44444444-4444-4444-8444-444444444444';
const VIDEO = 'dQw4w9WgXcQ';

const TITLE_NEW = '甲歌回';
const TITLE_REV = '乙歌回';
const TITLE_OLD = '丙歌回';

const record = (over: Record<string, unknown>) => ({
    id: SUB_NEW,
    kind: 'new',
    video_id: VIDEO,
    title: TITLE_NEW,
    status: 'applied',
    created_at: '2026-10-28T01:00:00Z',
    reverted_at: null,
    target_video_ref: null,
    summary: { added: 3, changed: 0, fields: [] },
    ...over,
});
const submissionRows = () => [
    record({}),
    record({ id: SUB_REV, kind: 'revision', title: TITLE_REV, target_video_ref: VID, summary: { added: 1, changed: 2, fields: ['title'] } }),
    record({
        id: SUB_OLD, kind: 'revision', title: TITLE_OLD, status: 'reverted', reverted_at: '2026-10-28T02:00:00Z',
        target_video_ref: VID, summary: { added: 0, changed: 1, fields: [] },
    }),
];

const videoRecord = (over: Record<string, unknown> = {}) => ({
    id: VID, video_id: VIDEO, title: '既有歌回標題', vtuber_id: null, streamed_at: '2026-10-01T12:00:00Z',
    duration_seconds: 5400, status: 'published', community_locked: false,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...over,
});
const segment = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', code: 'abcd1234', video_ref: VID,
    start_seconds: 10, end_seconds: 180, title: '歌A', original_artist: '原唱A', version_note: null, position: 0,
};

type Call = { url: string; method: string; body: any; params: URLSearchParams };
let calls: Call[] = [];
let listRows: unknown[];
let video: Record<string, unknown>;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

const listGets = () => calls.filter((c) => c.method === 'GET' && c.url.startsWith('/api/admin/song-submissions'));
const posts = (action: string) => calls.filter((c) => c.method === 'POST' && c.url.startsWith('/api/admin/song-submissions') && c.params.get('action') === action);

beforeAll(async () => {
    await i18n.changeLanguage('zh-TW');
});

beforeEach(() => {
    calls = [];
    localStorage.setItem('ms_admin_api_token', 'tok');
    listRows = submissionRows();
    video = videoRecord();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const params = new URL(url, 'http://localhost').searchParams;
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        calls.push({ url, method, body, params });
        if (url.startsWith('/api/admin/song-submissions')) {
            if (method === 'GET') return json({ ok: true, submissions: listRows });
            return json({ ok: true });
        }
        if (url.startsWith('/api/admin/songs')) {
            if (method === 'GET' && params.has('id')) return json({ ok: true, video, segments: [segment] });
            if (method === 'GET') return json({ ok: true, videos: [], total: 0 });
            return json({ ok: true, video, segments: [segment] });
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

function renderWithClient(ui: React.ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
const renderTab = () => renderWithClient(<AdminSongsTab active={false} />);

/** 一列紀錄 = 含該歌回標題、且不含其他紀錄標題的最大祖先 */
function rowOf(title: string): HTMLElement {
    const others = [TITLE_NEW, TITLE_REV, TITLE_OLD].filter((t) => t !== title);
    let el: HTMLElement = screen.getAllByText(title)[0];
    while (el.parentElement && !others.some((t) => (el.parentElement!.textContent ?? '').includes(t))) el = el.parentElement;
    return el;
}
const dialogEl = () => document.querySelector<HTMLElement>('[role="alertdialog"], [role="dialog"]');
const openDialog = async () => {
    await waitFor(() => expect(dialogEl()).not.toBeNull());
    return dialogEl()!;
};
/** 對話框裡「取消」以外的按鈕就是確認鈕 */
const confirmButton = (dlg: HTMLElement) => {
    const btn = within(dlg).getAllByRole('button').find((b) => !/取消|關閉|close/i.test(b.textContent ?? ''));
    if (!btn) throw new Error('對話框找不到確認鈕');
    return btn;
};

describe('後台社群修改紀錄列表（C6a）', () => {
    it('區塊標題「社群修改紀錄」，GET /api/admin/song-submissions 取得紀錄', async () => {
        renderTab();
        expect(await screen.findByRole('heading', { name: /社群修改紀錄/ })).toBeInTheDocument();
        await screen.findByText(TITLE_NEW);
        expect(listGets().length).toBeGreaterThan(0);
    });

    it('新歌回紀錄顯示歌回標題、類型「新歌回」與摘要「新增 3 首」', async () => {
        renderTab();
        await screen.findByText(TITLE_NEW);
        const row = rowOf(TITLE_NEW);
        expect(within(row).getByText(TITLE_NEW)).toBeInTheDocument();
        expect(row.textContent).toMatch(/新歌回/);
        expect(row.textContent).toMatch(/新增 3 首/);
    });

    it('修正紀錄顯示類型「修正」與摘要「新增 1 首、修改 2 首」', async () => {
        renderTab();
        await screen.findByText(TITLE_REV);
        const row = rowOf(TITLE_REV);
        expect(row.textContent).toMatch(/修正/);
        expect(row.textContent).not.toMatch(/新歌回/);
        expect(row.textContent).toMatch(/新增 1 首/);
        expect(row.textContent).toMatch(/修改 2 首/);
    });

    it('只改歌名的修正紀錄（changed 1、fields 含 segments）顯示「修改 1 首」，不顯示「片段沒有變動」', async () => {
        listRows = [record({ id: SUB_REV, kind: 'revision', title: TITLE_REV, target_video_ref: VID, summary: { added: 0, changed: 1, fields: ['segments'] } })];
        renderTab();
        await screen.findByText(TITLE_REV);
        const row = rowOf(TITLE_REV);
        expect(row.textContent).toMatch(/修改 1 首/);
        expect(row.textContent).not.toMatch(/片段沒有變動/);
    });

    it('已套用的紀錄有「還原到這次之前」鈕；已還原的標示「已還原」且沒有還原鈕', async () => {
        renderTab();
        await screen.findByText(TITLE_OLD);
        expect(within(rowOf(TITLE_NEW)).getByRole('button', { name: /還原到這次之前/ })).toBeInTheDocument();
        expect(within(rowOf(TITLE_REV)).getByRole('button', { name: /還原到這次之前/ })).toBeInTheDocument();
        const reverted = rowOf(TITLE_OLD);
        expect(reverted.textContent).toMatch(/已還原/);
        expect(within(reverted).queryByRole('button', { name: /還原/ })).toBeNull();
        expect(within(rowOf(TITLE_REV)).queryByText(/已還原/)).toBeNull();
    });
});

describe('後台還原需確認（C6b）', () => {
    it('按「還原到這次之前」先跳確認（提到之後的修改也會一併還原），尚未送出', async () => {
        renderTab();
        await screen.findByText(TITLE_REV);
        fireEvent.click(within(rowOf(TITLE_REV)).getByRole('button', { name: /還原到這次之前/ }));
        const dlg = await openDialog();
        expect(dlg.textContent).toMatch(/一併還原/);
        expect(posts('revert')).toHaveLength(0);
    });

    it('按取消不送出還原', async () => {
        renderTab();
        await screen.findByText(TITLE_REV);
        fireEvent.click(within(rowOf(TITLE_REV)).getByRole('button', { name: /還原到這次之前/ }));
        const dlg = await openDialog();
        fireEvent.click(within(dlg).getByRole('button', { name: /取消/ }));
        await waitFor(() => expect(dialogEl()).toBeNull());
        expect(posts('revert')).toHaveLength(0);
    });

    it('確認後 POST ?action=revert，body 為 { id }，成功後重新抓列表', async () => {
        renderTab();
        await screen.findByText(TITLE_REV);
        const before = listGets().length;
        fireEvent.click(within(rowOf(TITLE_REV)).getByRole('button', { name: /還原到這次之前/ }));
        fireEvent.click(confirmButton(await openDialog()));
        await waitFor(() => expect(posts('revert')).toHaveLength(1));
        expect(posts('revert')[0].body).toEqual({ id: SUB_REV });
        await waitFor(() => expect(listGets().length).toBeGreaterThan(before));
    });
});

describe('後台編輯器鎖定社群編輯（C7）', () => {
    function renderEditor() {
        return renderWithClient(<SongVideoEditor id={VID} playerEnabled={false} onClose={vi.fn()} onSaved={vi.fn()} />);
    }
    /** 開關可能是 role=switch 或 checkbox */
    async function findLockToggle(): Promise<HTMLElement> {
        let el: HTMLElement | null = null;
        await waitFor(() => {
            el = screen.queryByRole('switch', { name: '鎖定社群編輯' }) ?? screen.queryByRole('checkbox', { name: '鎖定社群編輯' });
            expect(el).not.toBeNull();
        });
        return el!;
    }
    const isOn = (el: HTMLElement) => el.getAttribute('aria-checked') === 'true' || (el as HTMLInputElement).checked === true;

    it('影片未鎖定時開關為關閉', async () => {
        renderEditor();
        await waitFor(() => expect(screen.getByRole('textbox', { name: '歌回標題' })).toHaveValue('既有歌回標題'));
        expect(isOn(await findLockToggle())).toBe(false);
    });

    it('影片已鎖定（community_locked）時開關為開啟', async () => {
        video = videoRecord({ community_locked: true });
        renderEditor();
        await waitFor(() => expect(screen.getByRole('textbox', { name: '歌回標題' })).toHaveValue('既有歌回標題'));
        expect(isOn(await findLockToggle())).toBe(true);
    });

    it('打開開關後 POST ?action=lock，body 為 { videoRef, locked: true }', async () => {
        renderEditor();
        await waitFor(() => expect(screen.getByRole('textbox', { name: '歌回標題' })).toHaveValue('既有歌回標題'));
        fireEvent.click(await findLockToggle());
        await waitFor(() => expect(posts('lock')).toHaveLength(1));
        expect(posts('lock')[0].body).toEqual({ videoRef: VID, locked: true });
    });

    it('已鎖定的影片關掉開關時送 locked: false', async () => {
        video = videoRecord({ community_locked: true });
        renderEditor();
        await waitFor(() => expect(screen.getByRole('textbox', { name: '歌回標題' })).toHaveValue('既有歌回標題'));
        fireEvent.click(await findLockToggle());
        await waitFor(() => expect(posts('lock')).toHaveLength(1));
        expect(posts('lock')[0].body).toEqual({ videoRef: VID, locked: false });
    });
});

describe('後台不再有審核（C6c）', () => {
    it('歌回分頁沒有「待審投稿」、「核准」、「退回」', async () => {
        renderTab();
        await screen.findByRole('heading', { name: /社群修改紀錄/ });
        await screen.findByText(TITLE_NEW);
        expect(screen.queryByText(/待審投稿/)).toBeNull();
        expect(screen.queryByText(/核准/)).toBeNull();
        expect(screen.queryByText(/退回/)).toBeNull();
        expect(screen.queryByRole('button', { name: /審核|核准|退回/ })).toBeNull();
    });
});
