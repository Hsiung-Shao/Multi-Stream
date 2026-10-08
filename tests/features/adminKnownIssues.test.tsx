// 後台「已知問題」：新增送出、取消鍵不 disabled、晚到的儲存／刪除不會關掉之後重開的對話框；回饋詳情的公開提示
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FeedbackRecord } from '../../src/features/admin/types';

vi.mock('../../src/features/admin/hooks/useFeedbacks', () => ({
    useUpdateFeedback: () => ({ mutate: vi.fn(), isPending: false }),
    useDeleteFeedback: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { KnownIssueEditDialog } from '../../src/features/admin/components/KnownIssueEditDialog';
import { KnownIssuesTab } from '../../src/features/admin/components/KnownIssuesTab';
import { FeedbackDetail } from '../../src/features/admin/components/FeedbackDetail';

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let respond: (url: string, method: string) => Response | Promise<Response>;

const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, ...(data as object) }), { headers: { 'Content-Type': 'application/json' } });

/** 可以手動決定何時完成的 Response（模擬卡住的請求） */
function deferred() {
    let resolve!: (r: Response) => void;
    const promise = new Promise<Response>((r) => { resolve = r; });
    return { promise, resolve };
}

const issue = (id: string, title: string) => ({
    id, title, body: null, status: 'investigating' as const, severity: 'minor' as const, areas: [], is_public: true,
    created_at: '2026-10-08T00:00:00Z', updated_at: '2026-10-08T00:00:00Z', resolved_at: null,
});

function wrap(ui: React.ReactNode) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const utils = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
    return { ...utils, rerenderWithClient: (next: React.ReactNode) => utils.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>) };
}

beforeEach(() => {
    calls = [];
    localStorage.setItem('ms_admin_api_token', 'tok');
    respond = () => ok({});
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
        const method = init.method ?? 'GET';
        calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
        return respond(url, method);
    }));
});

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
});

/** 對話框外層：記錄 onOpenChange，並提供「重新打開」按鈕 */
function DialogHarness({ onChange }: { onChange: (open: boolean) => void }) {
    const [open, setOpen] = useState(true);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>reopen</button>
            <KnownIssueEditDialog open={open} onOpenChange={(o) => { onChange(o); setOpen(o); }} target={null} />
        </>
    );
}

describe('KnownIssueEditDialog', () => {
    it('新增：送出標題與欄位（空白回應送 null），成功後關閉', async () => {
        respond = (url, method) => (method === 'POST' ? ok({ issue: issue('n1', '新問題') }) : ok({ issues: [] }));
        const onChange = vi.fn();
        wrap(<DialogHarness onChange={onChange} />);

        fireEvent.change(screen.getByLabelText('標題'), { target: { value: '  新問題  ' } });
        fireEvent.click(screen.getByRole('button', { name: '新增' }));

        await waitFor(() => expect(onChange).toHaveBeenCalledWith(false));
        const post = calls.find((c) => c.method === 'POST');
        expect(post?.url).toBe('/api/admin/known-issues');
        expect(post?.body).toEqual({ title: '新問題', body: null, status: 'investigating', severity: 'minor', areas: [], is_public: false });
        expect(screen.queryByText('新增已知問題')).not.toBeInTheDocument();
    });

    it('儲存卡住時取消鍵仍可按，按下就關閉', async () => {
        const pending = deferred();
        respond = (url, method) => (method === 'POST' ? pending.promise : ok({ issues: [] }));
        const onChange = vi.fn();
        wrap(<DialogHarness onChange={onChange} />);

        fireEvent.change(screen.getByLabelText('標題'), { target: { value: '卡住' } });
        fireEvent.click(screen.getByRole('button', { name: '新增' }));
        await waitFor(() => expect(screen.getByRole('button', { name: '新增' })).toBeDisabled());

        const cancel = screen.getByRole('button', { name: '取消' });
        expect(cancel).not.toBeDisabled();
        fireEvent.click(cancel);
        expect(onChange).toHaveBeenLastCalledWith(false);
        await waitFor(() => expect(screen.queryByText('新增已知問題')).not.toBeInTheDocument());
        pending.resolve(ok({ issue: issue('n1', '卡住') }));
    });

    it('取消後先前卡住的儲存晚到成功，不會關掉之後重新打開的對話框', async () => {
        const pending = deferred();
        respond = (url, method) => (method === 'POST' ? pending.promise : ok({ issues: [] }));
        const onChange = vi.fn();
        wrap(<DialogHarness onChange={onChange} />);

        fireEvent.change(screen.getByLabelText('標題'), { target: { value: '第一次' } });
        fireEvent.click(screen.getByRole('button', { name: '新增' }));
        await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
        fireEvent.click(screen.getByRole('button', { name: '取消' }));
        await waitFor(() => expect(screen.queryByText('新增已知問題')).not.toBeInTheDocument());

        fireEvent.click(screen.getByText('reopen'));
        expect(await screen.findByText('新增已知問題')).toBeInTheDocument();
        onChange.mockClear();

        await act(async () => {
            pending.resolve(ok({ issue: issue('n1', '第一次') }));
            await new Promise((r) => setTimeout(r, 20));
        });
        expect(onChange).not.toHaveBeenCalledWith(false);
        expect(screen.getByText('新增已知問題')).toBeInTheDocument();
    });
});

describe('KnownIssuesTab 刪除', () => {
    it('A 的刪除卡住、取消後改刪 B：A 晚到成功不會關掉 B 的確認框', async () => {
        const pendingA = deferred();
        respond = (url, method) => {
            if (method === 'GET') return ok({ issues: [issue('a', '問題A'), issue('b', '問題B')] });
            if (method === 'DELETE' && url.includes('id=a')) return pendingA.promise;
            return ok({});
        };
        wrap(<KnownIssuesTab />);

        fireEvent.click(await screen.findByLabelText('刪除「問題A」'));
        fireEvent.click(await screen.findByRole('button', { name: '刪除' }));
        await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
        fireEvent.click(screen.getByRole('button', { name: '取消' }));
        await waitFor(() => expect(screen.queryByText('刪除這個已知問題？')).not.toBeInTheDocument());

        fireEvent.click(screen.getByLabelText('刪除「問題B」'));
        expect(await screen.findByText(/「問題B」會從後台與公開頁移除/)).toBeInTheDocument();

        await act(async () => {
            pendingA.resolve(ok({}));
            await new Promise((r) => setTimeout(r, 20));
        });
        expect(screen.getByText(/「問題B」會從後台與公開頁移除/)).toBeInTheDocument();
    });
});

describe('FeedbackDetail 公開提示', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const record = (over: Partial<FeedbackRecord> = {}): FeedbackRecord => ({
        id: 'fb1', created_at: new Date(Date.now() - 2 * DAY).toISOString(), feedback_type: 'bug', content: '聲音不見',
        source: null, usage_time: null, usage_duration: null, rating: null, nps_score: null, user_agent: null,
        screen_resolution: null, window_size: null, theme: null, app_version: null, status: 'read', admin_notes: null,
        public_notice: true, ...over,
    });
    const hint = () => screen.getByTestId('feedback-public-hint').textContent ?? '';

    it('送出時未告知會公開：不會出現在 /status', () => {
        wrap(<FeedbackDetail record={record({ public_notice: false })} open onClose={() => {}} />);
        expect(hint()).toContain('送出時尚未告知會公開');
    });

    it('已封存：不會公開', () => {
        wrap(<FeedbackDetail record={record({ status: 'archived' })} open onClose={() => {}} />);
        expect(hint()).toContain('已封存');
    });

    it('超過 30 天：已不在公開頁（即使狀態是已讀）', () => {
        wrap(<FeedbackDetail record={record({ created_at: new Date(Date.now() - 31 * DAY).toISOString() })} open onClose={() => {}} />);
        expect(hint()).toContain('超過 30 天，已不在公開頁');
    });

    it('已讀且 30 天內：已公開；未讀：尚未公開、要儲存後才生效', () => {
        const { unmount } = wrap(<FeedbackDetail record={record()} open onClose={() => {}} />);
        expect(hint()).toContain('已公開在 /status');
        expect(hint()).not.toContain('自動隱藏）');
        unmount();
        wrap(<FeedbackDetail record={record({ status: 'unread' })} open onClose={() => {}} />);
        expect(hint()).toContain('未讀不會公開');
        expect(hint()).toContain('儲存後');
    });

    it('資料庫舊值 processed 顯示成「已修正」並視為公開', () => {
        wrap(<FeedbackDetail record={record({ status: 'processed' })} open onClose={() => {}} />);
        expect(hint()).toContain('已公開在 /status');
        expect(screen.getByRole('combobox')).toHaveTextContent('已修正');
        // 舊值等同 fixed，不算有變更
        expect(screen.getByRole('button', { name: /儲存變更/ })).toBeDisabled();
    });

    it('換一筆記錄時，上一筆開著的「建立已知問題」對話框會關閉', async () => {
        const { rerenderWithClient } = wrap(<FeedbackDetail record={record()} open onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: '建立公開的已知問題' }));
        expect(await screen.findByText('新增已知問題')).toBeInTheDocument();

        rerenderWithClient(<FeedbackDetail record={record({ id: 'fb2' })} open onClose={() => {}} />);
        await waitFor(() => expect(screen.queryByText('新增已知問題')).not.toBeInTheDocument());
    });
});
