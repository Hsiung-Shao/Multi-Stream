// 後台「投稿審核」「資料回報」分頁：列表、核准送出的覆蓋欄位（既有團體名稱／建立新團體）、駁回、回報狀態更新、錯誤訊息
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContributionsTab } from '../../src/features/admin/components/ContributionsTab';
import { ReportsTab } from '../../src/features/admin/components/ReportsTab';

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let respond: (url: string, method: string) => Response;

const contribution = {
    id: '11111111-1111-4111-8111-111111111111',
    action: 'add',
    status: 'pending',
    payload: { name: '新人', youtube_channel_id: 'UC' + 'a'.repeat(22), channel_title: '新人 Ch.', nationality: 'HK', affiliation_type: 'agency', group_name: '某公司', avatar_url: 'https://yt3.googleusercontent.com/a' },
    submitted_by: 'anon:abcd',
    submitter_contact: null,
    source_urls: ['https://x.com/a/status/1'],
    source_note: null,
    auto_check: { channel_title: '新人 Ch.', name_matches_title: true, avatar_is_channel_avatar: false },
    reviewer_notes: null,
    reviewed_at: null,
    created_at: '2026-10-01T00:00:00Z',
    youtube_channel_id: 'UC' + 'a'.repeat(22),
    target_vtuber_id: null,
};

const report = {
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'vtuber_info',
    reasons: ['nationality'],
    vtuber_id: 'v1',
    group_id: null,
    stream_platform: null,
    stream_external_id: null,
    description: '其實是港V',
    source_urls: [],
    contact: null,
    page_url: '/schedule/a',
    status: 'open',
    admin_notes: null,
    resolved_at: null,
    created_at: '2026-10-01T00:00:00Z',
    vtuber: { name: '台一', slug: 'taione' },
    group: null,
};

beforeEach(() => {
    calls = [];
    localStorage.setItem('ms_admin_api_token', 'tok');
    respond = (url, method) => {
        if (url.startsWith('/api/admin/contributions') && method === 'GET') return new Response(JSON.stringify({ ok: true, contributions: [contribution] }));
        if (url.startsWith('/api/admin/reports') && method === 'GET') return new Response(JSON.stringify({ ok: true, reports: [report] }));
        if (url.includes('action=approve')) return new Response(JSON.stringify({ ok: true, result: { vtuber_id: 'v9', slug: 'newbie' } }));
        return new Response(JSON.stringify({ ok: true }));
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        return respond(url, method);
    }));
});
afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
});

const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

describe('投稿審核', () => {
    it('顯示投稿與自動檢查提醒；核准送出既有團體名稱與帶 token', async () => {
        wrap(<ContributionsTab />);
        expect(await screen.findByText('新人')).toBeTruthy();
        expect(screen.getByText('頭像不是頻道頭像')).toBeTruthy();
        // 台灣以外又沒附證據：提醒人工確認
        expect(screen.getByText('沒有證據連結，需人工確認')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /核准/ }));
        await waitFor(() => expect(calls.some((c) => c.url.includes('action=approve'))).toBe(true));
        const call = calls.find((c) => c.url.includes('action=approve'))!;
        const overrides = (call.body as { overrides: Record<string, unknown> }).overrides;
        expect(overrides).toMatchObject({ name: '新人', nationality: 'HK', affiliation_type: 'agency', group_name: '某公司' });
        expect(overrides.new_group).toBeUndefined();
        expect(await screen.findByText('/schedule/newbie')).toBeTruthy();
    });

    it('勾選「這是新團體」→ 送 new_group；後端回 group_exists 時顯示可讀訊息', async () => {
        respond = (url, method) =>
            method === 'GET'
                ? new Response(JSON.stringify({ ok: true, contributions: [contribution] }))
                : new Response(JSON.stringify({ ok: false, error: 'group_exists' }), { status: 409 });
        wrap(<ContributionsTab />);
        await screen.findByText('新人');
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: /核准/ }));
        expect(await screen.findByText(/已有同名團體/)).toBeTruthy();
        const overrides = (calls.find((c) => c.url.includes('action=approve'))!.body as { overrides: Record<string, unknown> }).overrides;
        expect(overrides.new_group).toEqual({ name: '某公司', kind: 'agency', nationality: 'HK' });
        expect(overrides.group_name).toBeUndefined();
    });

    it('駁回帶備註', async () => {
        wrap(<ContributionsTab />);
        await screen.findByText('新人');
        fireEvent.change(screen.getByPlaceholderText('審核備註（選填）'), { target: { value: '不是 VTuber' } });
        fireEvent.click(screen.getByRole('button', { name: /駁回/ }));
        await waitFor(() => expect(calls.find((c) => c.url.includes('action=reject'))?.body).toEqual({ notes: '不是 VTuber' }));
    });

    it('沒有 token：顯示輸入列；401 顯示可讀訊息', async () => {
        localStorage.clear();
        respond = () => new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 });
        wrap(<ContributionsTab />);
        expect(screen.getByLabelText('Admin API Token')).toBeTruthy();
        expect(await screen.findByText(/Token 無效/)).toBeTruthy();
    });
});

describe('資料回報', () => {
    it('列出回報與對象；改狀態後儲存', async () => {
        wrap(<ReportsTab />);
        expect(await screen.findByText('其實是港V')).toBeTruthy();
        expect(screen.getByText('台一')).toBeTruthy();
        fireEvent.change(screen.getByPlaceholderText('處理備註'), { target: { value: '已改成 HK' } });
        fireEvent.click(screen.getByRole('button', { name: /儲存/ }));
        await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ status: 'open', admin_notes: '已改成 HK' }));
    });
});
