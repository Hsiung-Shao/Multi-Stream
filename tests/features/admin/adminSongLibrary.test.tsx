// 後台「歌曲整理」AdminSongLibrary（C4）：搜尋、疑似重複、單曲明細、拆開、合併（原唱不同要勾選）、改名
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../src/i18n/i18n';
import { AdminSongLibrary } from '../../../src/features/admin/components/AdminSongLibrary';

const SEG1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SEG2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SEG3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type Brief = { id: number; title: string; artist: string | null; versions: number };
const brief = (id: number, title: string, artist: string | null, versions: number): Brief => ({ id, title, artist, versions });

const version = (segmentId: string, code: string, note: string | null, vtuber: string, videoTitle: string) => ({
    segment_id: segmentId, code, title: '來源歌', original_artist: '原唱甲', version_note: note,
    start_seconds: 10, end_seconds: 200,
    video: { id: `vid-${code}`, video_id: 'dQw4w9WgXcQ', title: videoTitle, streamed_at: '2026-10-01T12:00:00Z', status: 'published' },
    vtuber: { id: `vt-${vtuber}`, name: vtuber },
});
const detailOf = (song: Brief) => ({
    song: { id: song.id, title: song.title, artist: song.artist, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' },
    keys: [{ title_key: song.title, artist_key: song.artist ?? '' }],
    versions: [
        version(SEG1, 'code0001', '清唱', 'VT甲', '歌回一'),
        version(SEG2, 'code0002', '練歌版', 'VT乙', '歌回二'),
        version(SEG3, 'code0003', null, 'VT甲', '歌回三'),
    ],
});

type Call = { url: string; method: string; body: any; params: URLSearchParams };
let calls: Call[] = [];
let postResponse: (action: string, body: any) => Response;
let source: Brief;
let target: Brief;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

const getCalls = () => calls.filter((c) => c.method === 'GET' && c.url.startsWith('/api/admin/song-library'));
const postCalls = (action: string) => calls.filter((c) => c.method === 'POST' && c.params.get('action') === action);

beforeAll(async () => {
    await i18n.changeLanguage('zh-TW');
});

beforeEach(() => {
    calls = [];
    localStorage.setItem('ms_admin_api_token', 'tok');
    source = brief(1, '來源歌', '原唱甲', 3);
    target = brief(2, '目標歌', '原唱乙', 5);
    postResponse = () => json({ ok: true, data: {} });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const params = new URL(url, 'http://localhost').searchParams;
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        calls.push({ url, method, body, params });
        if (!url.startsWith('/api/admin/song-library')) return json([]);
        if (method === 'POST') return postResponse(params.get('action') ?? '', body);
        if (params.get('view') === 'duplicates') {
            return json({ ok: true, data: [{ title_key: 'dup', songs: [brief(7, '重複歌甲', '原唱丙', 2), brief(8, '重複歌乙', null, 1)] }] });
        }
        if (params.has('id')) {
            const song = params.get('id') === String(source.id) ? source : target;
            return json({ ok: true, data: detailOf(song) });
        }
        const q = params.get('q') ?? '';
        if (q.includes('來源')) return json({ ok: true, data: [source] });
        if (q.includes('目標')) return json({ ok: true, data: [target] });
        return json({ ok: true, data: [] });
    }));
});
afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
});

function renderLibrary() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // active 是 AdminSongsTab 慣用的分頁開關；多帶一個不認得的 prop 無害
    const Comp = AdminSongLibrary as unknown as React.ComponentType<Record<string, unknown>>;
    return render(
        <QueryClientProvider client={client}>
            <Comp active />
        </QueryClientProvider>,
    );
}

/** 送出搜尋：表單 submit 加 Enter，兩種實作都能觸發 */
function submitSearch(box: HTMLElement, value: string) {
    fireEvent.change(box, { target: { value } });
    const form = box.closest('form');
    if (form) fireEvent.submit(form);
    else fireEvent.keyDown(box, { key: 'Enter', code: 'Enter' });
}
/** Radix Tabs 在 mousedown 切換、一般按鈕在 click，兩個都送 */
function press(el: HTMLElement) {
    fireEvent.mouseDown(el, { button: 0 });
    fireEvent.click(el);
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

async function searchAndOpenSource() {
    renderLibrary();
    submitSearch(screen.getByRole('textbox', { name: '搜尋歌曲' }), '來源');
    fireEvent.click(await screen.findByText('來源歌'));
    await screen.findByText(/歌回一/);
}

describe('AdminSongLibrary 搜尋與疑似重複（C4）', () => {
    it('搜尋框送出後 GET ?q=，列出歌名、原唱與版本數', async () => {
        renderLibrary();
        submitSearch(screen.getByRole('textbox', { name: '搜尋歌曲' }), '來源');
        await screen.findByText('來源歌');
        expect(getCalls().some((c) => c.params.get('q') === '來源')).toBe(true);
        expect(screen.getByText(/原唱甲/)).toBeInTheDocument();
        expect(screen.getByText(/3/)).toBeInTheDocument();
    });

    it('「疑似重複」GET ?view=duplicates，列出每組的歌', async () => {
        renderLibrary();
        const tab = screen.queryByRole('tab', { name: '疑似重複' }) ?? screen.getByRole('button', { name: '疑似重複' });
        press(tab);
        expect((await screen.findAllByText('重複歌甲')).length).toBeGreaterThan(0);
        expect(screen.getAllByText('重複歌乙').length).toBeGreaterThan(0);
        expect(getCalls().some((c) => c.params.get('view') === 'duplicates')).toBe(true);
    });
});

describe('AdminSongLibrary 單曲明細與拆開（C4）', () => {
    it('點某首歌 GET ?id=，列出各版本的 VTuber、歌回標題、開台日期、備註', async () => {
        await searchAndOpenSource();
        expect(getCalls().some((c) => c.params.get('id') === '1')).toBe(true);
        expect(screen.getAllByText(/VT甲/).length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText(/VT乙/)).toBeInTheDocument();
        expect(screen.getByText(/歌回二/)).toBeInTheDocument();
        expect(screen.getByText(/歌回三/)).toBeInTheDocument();
        expect(screen.getAllByText(/2026/).length).toBeGreaterThanOrEqual(3);
        expect(screen.getByText(/清唱/)).toBeInTheDocument();
        expect(screen.getByText(/練歌版/)).toBeInTheDocument();
    });

    it('每個版本一顆「拆開」；按下先跳確認，不確認不送出', async () => {
        await searchAndOpenSource();
        expect(screen.getAllByRole('button', { name: /拆開/ })).toHaveLength(3);
        fireEvent.click(screen.getAllByRole('button', { name: /拆開/ })[1]);
        const dlg = await openDialog();
        expect(postCalls('split')).toHaveLength(0);
        fireEvent.click(within(dlg).getByRole('button', { name: /取消/ }));
        await waitFor(() => expect(dialogEl()).toBeNull());
        expect(postCalls('split')).toHaveLength(0);
    });

    it('確認後 POST action=split，body 為 { segment_id }', async () => {
        await searchAndOpenSource();
        fireEvent.click(screen.getAllByRole('button', { name: /拆開/ })[1]);
        fireEvent.click(confirmButton(await openDialog()));
        await waitFor(() => expect(postCalls('split')).toHaveLength(1));
        expect(postCalls('split')[0].body).toEqual({ segment_id: SEG2 });
    });
});

describe('AdminSongLibrary 合併（C4）', () => {
    async function pickTarget() {
        await searchAndOpenSource();
        press(screen.getByRole('button', { name: /合併到/ }));
        // 合併目標的搜尋框：最後一個名稱含「搜尋」的輸入框
        const boxes = await screen.findAllByRole('textbox', { name: /搜尋/ });
        submitSearch(boxes[boxes.length - 1], '目標');
        fireEvent.click(await screen.findByText('目標歌'));
        return openDialog();
    }

    it('選好目標後跳確認對話框，列出兩邊的名稱、原唱、版本數；尚未送出', async () => {
        const dlg = await pickTarget();
        const text = dlg.textContent ?? '';
        for (const s of ['來源歌', '目標歌', '原唱甲', '原唱乙']) expect(text).toContain(s);
        expect(text).toMatch(/3/);
        expect(text).toMatch(/5/);
        expect(postCalls('merge')).toHaveLength(0);
    });

    it('兩邊原唱都有填且不同：出現警告核取方塊，沒勾確認鈕停用、勾了才送出 allow_artist_mismatch:true', async () => {
        const dlg = await pickTarget();
        const check = within(dlg).getByRole('checkbox', { name: '我確認原唱不同仍要合併' });
        expect(check).not.toBeChecked();
        expect(confirmButton(dlg)).toBeDisabled();
        fireEvent.click(confirmButton(dlg));
        expect(postCalls('merge')).toHaveLength(0);

        fireEvent.click(check);
        await waitFor(() => expect(confirmButton(dlg)).toBeEnabled());
        fireEvent.click(confirmButton(dlg));
        await waitFor(() => expect(postCalls('merge')).toHaveLength(1));
        expect(postCalls('merge')[0].body).toEqual({ source: 1, target: 2, allow_artist_mismatch: true });
    });

    it.each([
        ['原唱相同', '原唱甲', '原唱甲'],
        ['目標沒填原唱', '原唱甲', null],
        ['來源沒填原唱', null, '原唱乙'],
    ])('%s：不出現核取方塊，直接可確認，allow_artist_mismatch 不是 true', async (_name, srcArtist, tgtArtist) => {
        source = brief(1, '來源歌', srcArtist, 3);
        target = brief(2, '目標歌', tgtArtist, 5);
        const dlg = await pickTarget();
        expect(within(dlg).queryByRole('checkbox')).toBeNull();
        expect(confirmButton(dlg)).toBeEnabled();
        fireEvent.click(confirmButton(dlg));
        await waitFor(() => expect(postCalls('merge')).toHaveLength(1));
        const body = postCalls('merge')[0].body;
        expect(body).toMatchObject({ source: 1, target: 2 });
        expect(body.allow_artist_mismatch ?? false).toBe(false);
    });

    it('取消對話框不送出合併', async () => {
        const dlg = await pickTarget();
        fireEvent.click(within(dlg).getByRole('button', { name: /取消/ }));
        await waitFor(() => expect(dialogEl()).toBeNull());
        expect(postCalls('merge')).toHaveLength(0);
    });
});

describe('AdminSongLibrary 改名（C4）', () => {
    it('行內編輯後 POST action=rename，body 為 { id, title, artist }', async () => {
        await searchAndOpenSource();
        press(screen.getByRole('button', { name: /改名/ }));
        const title = screen.getByRole('textbox', { name: /歌名/ });
        const artist = screen.getByRole('textbox', { name: /原唱/ });
        expect(title).toHaveValue('來源歌');
        expect(artist).toHaveValue('原唱甲');
        fireEvent.change(title, { target: { value: '新歌名' } });
        fireEvent.change(artist, { target: { value: '新原唱' } });
        fireEvent.click(screen.getByRole('button', { name: /儲存/ }));
        await waitFor(() => expect(postCalls('rename')).toHaveLength(1));
        expect(postCalls('rename')[0].body).toEqual({ id: 1, title: '新歌名', artist: '新原唱' });
    });

    it('伺服器回 409 key_taken：顯示「這個名稱已屬於另一首歌，請改用合併」', async () => {
        postResponse = () => json({ ok: false, error: 'key_taken' }, 409);
        await searchAndOpenSource();
        press(screen.getByRole('button', { name: /改名/ }));
        fireEvent.change(screen.getByRole('textbox', { name: /歌名/ }), { target: { value: '撞名的歌' } });
        fireEvent.click(screen.getByRole('button', { name: /儲存/ }));
        expect(await screen.findByText(/這個名稱已屬於另一首歌，請改用合併/)).toBeInTheDocument();
    });
});
