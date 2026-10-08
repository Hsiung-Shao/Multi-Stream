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
    const SESSION_KEY = 'sb-testref-auth-token';
    const headersOf = (i = 0) => (fetchMock.mock.calls[i][1] as RequestInit).headers;

    // tests/setup.ts 的 localStorage mock 沒有 length／key（無法列舉），這裡補上模擬「存了一個 Supabase session」
    const ls = window.localStorage as unknown as Record<string, unknown>;
    const setStoredSession = () => Object.assign(ls, { length: 1, key: (i: number) => (i === 0 ? SESSION_KEY : null) });
    afterEach(() => { delete ls.length; delete ls.key; });

    it('匿名（本機沒有 Supabase session）：不載入 SDK、立即送出、不帶 Authorization', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        // 就算 SDK 會卡住也不該被碰到
        getSupabase.mockImplementation(() => new Promise(() => {}));
        await FeedbackService.sendFeedback(payload); // 不推進任何計時器也能完成＝沒有等待
        expect(getSupabase).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(headersOf()).not.toHaveProperty('Authorization');
    });

    it('有 session 時帶 Authorization', async () => {
        setStoredSession();
        getSupabase.mockResolvedValue({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok123' } } }) } });
        await FeedbackService.sendFeedback(payload);
        expect(headersOf()).toMatchObject({ Authorization: 'Bearer tok123' });
    });

    it('有 session、SDK 載入慢但在 5 秒內（4 秒）：仍帶 Authorization', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        setStoredSession();
        const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'slowtok' } } }) } };
        getSupabase.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(client), 4_000)));
        const done = FeedbackService.sendFeedback(payload);
        await vi.advanceTimersByTimeAsync(3_999);
        expect(fetchMock).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await done;
        expect(headersOf()).toMatchObject({ Authorization: 'Bearer slowtok' });
    });

    it('有 session 但 SDK 載入卡住：5 秒後當匿名送出', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        setStoredSession();
        getSupabase.mockImplementation(() => new Promise(() => {}));
        const done = FeedbackService.sendFeedback(payload);
        await vi.advanceTimersByTimeAsync(4_999);
        expect(fetchMock).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await done;
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(headersOf()).not.toHaveProperty('Authorization');
    });

    it('有 session、SDK 載入 3 秒後 getSession 卡住：總上限仍是 5 秒（不是 3＋2 以上分段累加）', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        setStoredSession();
        const client = { auth: { getSession: () => new Promise(() => {}) } };
        getSupabase.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(client), 3_000)));
        const done = FeedbackService.sendFeedback(payload);
        await vi.advanceTimersByTimeAsync(4_999);
        expect(fetchMock).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await done;
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(headersOf()).not.toHaveProperty('Authorization');
    });
});
