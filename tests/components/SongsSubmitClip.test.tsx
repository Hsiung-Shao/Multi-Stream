// 投稿頁：觀眾剪輯來源（勾選後帶入 oEmbed 上傳者、可手改）與每段合唱者，送出 body 帶 clipSource／performers（FE7、FE8）
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
const VT2 = '22222222-2222-2222-2222-222222222222';
const AUTHOR = { name: '剪輯頻道甲', url: 'https://www.youtube.com/@clipper-jia' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
/** oEmbed 回應內容；null＝不帶上傳者欄位 */
let oembedAuthor: { name: string; url: string } | null;
/** 設了就讓 oEmbed 卡住，直到呼叫 release */
let oembedGate: Promise<void> | null;

beforeEach(() => {
    resetRestConfigCache();
    oembedAuthor = AUTHOR;
    oembedGate = null;
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/songs/catalog')) return json([]);
        if (url.startsWith('/api/songs/timeline')) return json({ ok: false, error: 'not_found' }, 404);
        if (url.includes('/rest/v1/vtubers')) {
            // 依網址裡的 id 回名稱（chip 與選定的 VTuber 顯示用）
            const rows = [{ id: VT, name: '星川測試', img_url: null }, { id: VT2, name: '月見合唱', img_url: null }].filter((r) => url.includes(r.id));
            return json(rows);
        }
        if (url.startsWith('https://www.youtube.com/oembed')) {
            if (oembedGate) await oembedGate;
            return json({ title: '測試歌回 #1', ...(oembedAuthor ? { author_name: oembedAuthor.name, author_url: oembedAuthor.url } : {}) });
        }
        if (url.startsWith('/api/supabase-config')) return json({ url: 'https://db.example.co', anonKey: 'anon' });
        if (url.includes('/rest/v1/streams')) return json([]);
        if (url.startsWith('/api/songs/submissions')) return json({ ok: true, id: 's1', kind: 'new' }, 201);
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

const SEND = /^送出(投稿|修正)?$/;
const submitCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/songs/submissions'));
const lastBody = () => JSON.parse(String((submitCalls()[0] as [string, RequestInit])[1].body));
const pickVtuber = () => fireEvent.change(screen.getByRole('textbox', { name: '搜尋 VTuber 名稱' }), { target: { value: VT } });
const clipBox = () => screen.getByRole('checkbox', { name: '這是觀眾剪輯' });
const clipName = () => screen.getByRole('textbox', { name: '剪輯頻道名稱' });
const clipUrl = () => screen.getByRole('textbox', { name: '剪輯頻道網址' });

/** 新歌回：貼網址、等標題、匯入一首、選 VTuber */
async function prepare() {
    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: 'YouTube 網址' }), { target: { value: `https://youtu.be/${VIDEO}` } });
    await waitFor(() => expect(screen.getByRole('textbox', { name: '歌回標題' })).toHaveValue('測試歌回 #1'));
    fireEvent.change(screen.getByRole('textbox', { name: '時間軸文字' }), { target: { value: '0:10-3:00 歌A / 原唱A' } });
    fireEvent.click(screen.getByRole('button', { name: /取代現有片段/ }));
    pickVtuber();
}

async function send() {
    const btn = screen.getByRole('button', { name: SEND });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    await waitFor(() => expect(submitCalls()).toHaveLength(1));
    return lastBody();
}

/** 第一首加一位站內（貼 uuid）＋一位站外合唱者 */
async function addPerformers() {
    fireEvent.click(screen.getAllByRole('button', { name: '新增合唱' })[0]);
    // 影片的 VTuber 已選定，剩下的搜尋框就是合唱者的
    fireEvent.change(await screen.findByRole('textbox', { name: '搜尋 VTuber 名稱' }), { target: { value: VT2 } });
    expect(await screen.findByRole('button', { name: '移除合唱 月見合唱' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: /站外名字/ }), { target: { value: '站外歌手' } });
    fireEvent.click(screen.getByRole('button', { name: '加入' }));
    expect(await screen.findByRole('button', { name: '移除合唱 站外歌手' })).toBeInTheDocument();
}

describe('FE7 勾選觀眾剪輯後帶入 oEmbed 上傳者', () => {
    it('FE7 沒勾選前不顯示剪輯欄位，也不會自動勾選', async () => {
        await prepare();
        expect(clipBox()).not.toBeChecked();
        expect(screen.queryByRole('textbox', { name: '剪輯頻道名稱' })).toBeNull();
        expect(screen.queryByRole('textbox', { name: '剪輯頻道網址' })).toBeNull();
    });

    it('FE7 勾選後兩欄已預填 oEmbed 的上傳者名稱與網址', async () => {
        await prepare();
        fireEvent.click(clipBox());
        expect(clipName()).toHaveValue(AUTHOR.name);
        expect(clipUrl()).toHaveValue(AUTHOR.url);
    });

    it('FE7 預填後可手改，取消勾選再勾選仍保有手改的值', async () => {
        await prepare();
        fireEvent.click(clipBox());
        fireEvent.change(clipName(), { target: { value: '改過的名稱' } });
        fireEvent.change(clipUrl(), { target: { value: 'https://www.youtube.com/@other' } });
        expect(clipName()).toHaveValue('改過的名稱');
        expect(clipUrl()).toHaveValue('https://www.youtube.com/@other');
        fireEvent.click(clipBox());
        fireEvent.click(clipBox());
        expect(clipName()).toHaveValue('改過的名稱');
        expect(clipUrl()).toHaveValue('https://www.youtube.com/@other');
    });

    it('FE7 oEmbed 沒有上傳者資料時勾選後兩欄是空的', async () => {
        oembedAuthor = null;
        await prepare();
        fireEvent.click(clipBox());
        expect(clipName()).toHaveValue('');
        expect(clipUrl()).toHaveValue('');
    });

    it('FE7 oEmbed 較晚回來時只補空欄位，不覆蓋使用者已填的', async () => {
        let release = () => {};
        oembedGate = new Promise<void>((resolve) => { release = resolve; });
        renderPage();
        fireEvent.change(screen.getByRole('textbox', { name: 'YouTube 網址' }), { target: { value: `https://youtu.be/${VIDEO}` } });
        fireEvent.click(clipBox());
        fireEvent.change(clipName(), { target: { value: '我自己填的名稱' } });
        release();
        await waitFor(() => expect(screen.getByRole('textbox', { name: '歌回標題' })).toHaveValue('測試歌回 #1'));
        await waitFor(() => expect(clipUrl()).toHaveValue(AUTHOR.url));
        expect(clipName()).toHaveValue('我自己填的名稱');
    });
});

describe('FE8 投稿送出帶合唱與剪輯來源', () => {
    it('FE8 勾選剪輯並手改後送出，body 的 clipSource 是改過的名稱與網址', async () => {
        await prepare();
        fireEvent.click(clipBox());
        fireEvent.change(clipName(), { target: { value: '手改頻道' } });
        fireEvent.change(clipUrl(), { target: { value: 'https://www.youtube.com/@handmade' } });
        const body = await send();
        expect(body.clipSource).toEqual({ name: '手改頻道', url: 'https://www.youtube.com/@handmade' });
    });

    it('FE8 沒勾選時 clipSource 為 null，即使 oEmbed 有帶上傳者', async () => {
        await prepare();
        const body = await send();
        expect(body.clipSource).toBeNull();
    });

    it('FE8 勾選後再取消，body 的 clipSource 是 null，不殘留預填的值', async () => {
        await prepare();
        fireEvent.click(clipBox());
        expect(clipName()).toHaveValue(AUTHOR.name);
        fireEvent.click(clipBox());
        const body = await send();
        expect(body.clipSource).toBeNull();
    });

    it('FE8 片段加了站內與站外合唱者，body 的 performers 依序帶 vtuberId 與名字', async () => {
        await prepare();
        await addPerformers();
        const body = await send();
        expect(body.segments).toHaveLength(1);
        expect(body.segments[0].performers).toHaveLength(2);
        expect(body.segments[0].performers[0]).toMatchObject({ vtuberId: VT2 });
        expect(body.segments[0].performers[1]).toEqual({ vtuberId: null, name: '站外歌手' });
    });

    it('FE8 移除合唱者後送出，被移除的不在 body 裡', async () => {
        await prepare();
        await addPerformers();
        fireEvent.click(screen.getByRole('button', { name: '移除合唱 站外歌手' }));
        await waitFor(() => expect(screen.queryByRole('button', { name: '移除合唱 站外歌手' })).toBeNull());
        const body = await send();
        expect(body.segments[0].performers).toHaveLength(1);
        expect(body.segments[0].performers[0]).toMatchObject({ vtuberId: VT2 });
    });

    it('FE8 同時送出剪輯來源與合唱者，兩者都在同一個 body', async () => {
        await prepare();
        fireEvent.click(clipBox());
        await addPerformers();
        const body = await send();
        expect(body.clipSource).toEqual({ name: AUTHOR.name, url: AUTHOR.url });
        expect(body.segments[0].performers).toHaveLength(2);
        expect(body).toMatchObject({ videoId: VIDEO, vtuberId: VT, turnstileToken: 'tok' });
    });
});
