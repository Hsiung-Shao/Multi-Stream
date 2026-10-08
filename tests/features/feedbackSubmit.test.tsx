// 意見回饋：送出帶 publicNotice:true（後端只公開有這個旗標的回報）；getSession 卡住 2 秒後當匿名送出
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '../../src/i18n/i18n';

vi.mock('../../src/utils/analytics', () => ({ logEvent: vi.fn(), track: {} }));

const getSupabase = vi.fn();
vi.mock('../../src/lib/supabase', () => ({ getSupabase: () => getSupabase() }));

import { FeedbackModal } from '../../src/features/feedback/FeedbackModal';
import { FeedbackService, type FeedbackPayload } from '../../src/features/feedback/FeedbackService';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
    await i18n.changeLanguage('zh-TW');
    getSupabase.mockReset();
    getSupabase.mockResolvedValue(null);
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const sentBody = (i = 0) => JSON.parse(String((fetchMock.mock.calls[i][1] as RequestInit).body));

describe('FeedbackModal', () => {
    it('內容欄下方顯示公開告知（非保證語氣），送出時帶 publicNotice:true', async () => {
        render(<FeedbackModal theme="dark" onClose={() => {}} />);
        expect(screen.getByText(/會盡量自動隱藏/)).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText('請詳細描述您的問題或建議...'), { target: { value: '切換版型後聲音不見' } });
        fireEvent.click(screen.getByRole('button', { name: /送出回饋/ }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        expect(fetchMock.mock.calls[0][0]).toBe('/api/feedback/submit');
        expect(sentBody()).toMatchObject({ content: '切換版型後聲音不見', feedbackType: 'bug', publicNotice: true });
        expect(await screen.findByText('感謝您的回饋！')).toBeInTheDocument();
    });
});

describe('FeedbackService.sendFeedback', () => {
    const payload = { feedbackType: 'bug', content: 'x', userAgent: 'ua', screenResolution: '1x1', windowSize: '1x1', theme: 'dark', version: '0', publicNotice: true } as FeedbackPayload;

    it('有 session 時帶 Authorization', async () => {
        getSupabase.mockResolvedValue({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok123' } } }) } });
        await FeedbackService.sendFeedback(payload);
        expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok123' });
    });

    it('supabase client 載入慢（5 秒）但 getSession 正常：仍帶 Authorization，不被 2 秒逾時當成匿名', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'slowtok' } } }) } };
        getSupabase.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(client), 5_000)));
        const done = FeedbackService.sendFeedback(payload);
        await vi.advanceTimersByTimeAsync(4_999);
        expect(fetchMock).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await done;
        expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer slowtok' });
    });

    it('supabase client 載入超過 10 秒：當匿名送出，不會永遠卡住', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        getSupabase.mockImplementation(() => new Promise(() => {}));
        const done = FeedbackService.sendFeedback(payload);
        await vi.advanceTimersByTimeAsync(9_999);
        expect(fetchMock).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await done;
        expect((fetchMock.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty('Authorization');
    });

    it('getSession 卡住：2 秒後當匿名送出，不會永遠卡在送出中', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        getSupabase.mockResolvedValue({ auth: { getSession: () => new Promise(() => {}) } });
        const done = FeedbackService.sendFeedback(payload);
        await vi.advanceTimersByTimeAsync(1_999);
        expect(fetchMock).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await done;
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect((fetchMock.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty('Authorization');
    });
});
