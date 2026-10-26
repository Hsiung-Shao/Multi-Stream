// 後台審核歌回投稿（SongVideoEditor reviewId 模式）：修正型核准沿用原歌回的長度與狀態，新歌回照舊送 published
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SongVideoEditor } from '../../../src/features/admin/components/SongVideoEditor';

vi.mock('../../../src/utils/apiLoader', () => ({ apiLoader: { loadYouTubePlayerApi: vi.fn(async () => undefined) } }));

const SUB_ID = '44444444-4444-4444-8444-444444444444';
const REF = '55555555-5555-4555-8555-555555555555';
const VT_ORIG = '66666666-6666-4666-8666-666666666666';
const VT_SUB = '77777777-7777-4777-8777-777777777777';
const VIDEO = 'dQw4w9WgXcQ';
const STREAMED = '2026-10-01T12:00:00Z';

const submission = (over: Record<string, unknown> = {}) => ({
    id: SUB_ID,
    kind: 'revision',
    video_id: VIDEO,
    target_video_ref: REF,
    title: '投稿者填的標題',
    vtuber_id: VT_SUB,
    streamed_at: '2026-09-01T12:00:00Z',
    source_note: null,
    submitter_contact: null,
    status: 'pending',
    reviewer_notes: null,
    result_video_ref: null,
    created_at: '2026-10-20T00:00:00Z',
    reviewed_at: null,
    segments: [{ start: 10, end: 180, title: '歌A', artist: '原唱A', endEstimated: false }],
    ...over,
});
const existingSeg = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', code: 'abcd1234', video_ref: REF,
    start_seconds: 10, end_seconds: 180, title: '歌A', original_artist: '原唱A', position: 0,
};
const existingVideo = (over: Record<string, unknown> = {}) => ({
    id: REF, video_id: VIDEO, title: '原歌回標題', vtuber_id: VT_ORIG, streamed_at: STREAMED, duration_seconds: 5400, status: 'draft', ...over,
});

type Call = { url: string; method: string; body: any };
let calls: Call[] = [];
let detail: Record<string, unknown>;
const approveCalls = () => calls.filter((c) => c.url.includes('action=approve'));

beforeEach(() => {
    calls = [];
    localStorage.setItem('ms_admin_api_token', 'tok');
    detail = { ok: true, submission: submission(), existing: [existingSeg], existing_video: existingVideo() };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        if (url.startsWith('/api/admin/song-submissions') && method === 'GET') return new Response(JSON.stringify(detail));
        if (url.includes('action=approve')) return new Response(JSON.stringify({ ok: true, video_ref: REF }));
        if (url.startsWith('/api/supabase-config')) return new Response(JSON.stringify({ url: 'https://db.example.co', anonKey: 'anon' }));
        return new Response('[]');
    }));
});
afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
});

function renderEditor() {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <SongVideoEditor id={null} reviewId={SUB_ID} playerEnabled={false} onClose={onClose} onSaved={onSaved} />
        </QueryClientProvider>,
    );
    return { onClose, onSaved };
}

async function approve() {
    const btn = await screen.findByRole('button', { name: '核准並發布' });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    await waitFor(() => expect(approveCalls()).toHaveLength(1));
    return approveCalls()[0].body as { video_ref: string | null; video: Record<string, unknown>; segments: unknown[] };
}

describe('後台審核投稿：修正型沿用原歌回欄位', () => {
    it('原歌回是草稿且有長度：核准送出 duration_seconds 與 status 沿用原值（draft 不被升成 published）', async () => {
        renderEditor();
        const body = await approve();
        expect(body.video_ref).toBe(REF);
        expect(body.video.duration_seconds).toBe(5400);
        expect(body.video.status).toBe('draft');
    });

    it('標題、VTuber、開台時間用原歌回的，不是投稿內容', async () => {
        renderEditor();
        const body = await approve();
        expect(body.video.title).toBe('原歌回標題');
        expect(body.video.vtuber_id).toBe(VT_ORIG);
        expect(new Date(String(body.video.streamed_at)).getTime()).toBe(new Date(STREAMED).getTime());
        expect(body.video.video_id).toBe(VIDEO);
    });

    it('原歌回已發布且沒有長度：status 維持 published、duration_seconds 為 null', async () => {
        detail = { ...detail, existing_video: existingVideo({ status: 'published', duration_seconds: null }) };
        renderEditor();
        const body = await approve();
        expect(body.video.status).toBe('published');
        expect(body.video.duration_seconds).toBeNull();
    });

    it('管理員在表單改過標題時以表單為準，長度與狀態仍沿用原歌回', async () => {
        renderEditor();
        const title = await screen.findByRole('textbox', { name: '歌回標題' });
        await waitFor(() => expect(title).toHaveValue('原歌回標題'));
        fireEvent.change(title, { target: { value: '管理員改的標題' } });
        const body = await approve();
        expect(body.video.title).toBe('管理員改的標題');
        expect(body.video.duration_seconds).toBe(5400);
        expect(body.video.status).toBe('draft');
    });

    it('投稿標題與原歌回不同時，審核資訊框以純文字顯示投稿者填的標題', async () => {
        renderEditor();
        expect(await screen.findByText('投稿者填的標題：')).toBeInTheDocument();
        expect(screen.getByText('投稿者填的標題')).toBeInTheDocument();
    });

    it('投稿標題與原歌回相同時不顯示「投稿者填的標題」', async () => {
        detail = { ...detail, submission: submission({ title: '原歌回標題' }) };
        renderEditor();
        await waitFor(() => expect(screen.getByRole('textbox', { name: '歌回標題' })).toHaveValue('原歌回標題'));
        expect(screen.queryByText('投稿者填的標題：')).toBeNull();
    });
});

describe('後台審核投稿：新歌回', () => {
    it('沒有原歌回（existing_video 為 null）：用投稿內容預填，status 送 published、duration_seconds 為 null', async () => {
        detail = {
            ok: true,
            submission: submission({ kind: 'new', target_video_ref: null, title: '新歌回標題', vtuber_id: VT_SUB }),
            existing: null,
            existing_video: null,
        };
        renderEditor();
        const body = await approve();
        expect(body.video_ref).toBeNull();
        expect(body.video.title).toBe('新歌回標題');
        expect(body.video.vtuber_id).toBe(VT_SUB);
        expect(body.video.status).toBe('published');
        expect(body.video.duration_seconds).toBeNull();
        expect(screen.queryByText('投稿者填的標題：')).toBeNull();
    });
});
