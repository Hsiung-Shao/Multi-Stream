// 投稿歌回時間軸頁：貼網址自動帶標題、貼時間軸匯入後送出成功；同影片已有待審時顯示 409 文案
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
