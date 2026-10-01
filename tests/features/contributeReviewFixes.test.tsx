// 新增 VTuber 與資料回報（前端 code review 修正）：
//   網址檢查、自動帶入跟著頻道換、自動帶入的頭像不送、台灣不送地區證據、
//   Turnstile 設定失敗可重試、回報來源網址檢查
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '../../src/i18n/i18n';
import { isHttpUrl } from '../../src/features/contribute/urlValidation';
import { ContributeForm } from '../../src/features/contribute/ContributeForm';
import { TurnstileWidget } from '../../src/components/turnstile/TurnstileWidget';
import ReportDialog from '../../src/features/report/ReportDialog';
import { resetTurnstileConfigCache } from '../../src/features/contribute/api';

// 團體名稱建議走 react-query＋PostgREST，與這裡的行為無關
vi.mock('../../src/features/contribute/useGroupNames', () => ({ useGroupNames: () => [] }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const CHANNELS: Record<string, { title: string; avatarUrl: string }> = {
    '@alpha_ch': { title: 'Alpha', avatarUrl: 'https://yt3.googleusercontent.com/alpha=s900' },
    '@beta_ch': { title: 'Beta', avatarUrl: 'https://yt3.googleusercontent.com/beta=s900' },
    '@gamma_ch': { title: 'Gamma', avatarUrl: 'https://yt3.googleusercontent.com/gamma=s900' },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
    await i18n.changeLanguage('zh-TW');
    resetTurnstileConfigCache();
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/turnstile-config')) return json({ ok: true, siteKey: null, enforced: false });
        if (url.startsWith('/api/vtuber/channel-lookup')) {
            const q = decodeURIComponent(url.split('url=')[1] ?? '');
            const ch = CHANNELS[q];
            return ch ? json({ ok: true, channel: { channelId: 'UC' + q, handle: q, ...ch }, exists: null, pending: false }) : json({ ok: false, error: 'youtube_not_found' }, 404);
        }
        if (url.startsWith('/api/vtuber/contribute') || url.startsWith('/api/report')) return json({ ok: true }, 201);
        return json({ ok: false, error: 'unexpected' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('isHttpUrl', () => {
    it('收 http(s) 與省略協定的網址，拒絕其他協定、沒有網域、過長', () => {
        expect(isHttpUrl('https://x.com/abc')).toBe(true);
        expect(isHttpUrl('x.com/abc')).toBe(true);
        expect(isHttpUrl('http://example.org')).toBe(true);
        expect(isHttpUrl('javascript:alert(1)')).toBe(false);
        expect(isHttpUrl('ftp://example.org')).toBe(false);
        expect(isHttpUrl('not a url')).toBe(false);
        expect(isHttpUrl('localhost')).toBe(false);
        expect(isHttpUrl('')).toBe(false);
        expect(isHttpUrl('https://a.com/' + 'x'.repeat(2048))).toBe(false);
    });
});

describe('投稿表單', () => {
    const typeChannel = (v: string) => fireEvent.change(screen.getByLabelText(/YouTube 頻道網址/), { target: { value: v } });
    const nameInput = () => screen.getByLabelText(/顯示名稱/) as HTMLInputElement;
    const avatarInput = () => screen.getByLabelText(/頭像圖片網址/) as HTMLInputElement;

    it('自動帶入的名稱與頭像跟著頻道換；使用者改過的名稱不被覆蓋', async () => {
        render(<ContributeForm />);
        typeChannel('@alpha_ch');
        await waitFor(() => expect(nameInput().value).toBe('Alpha'), { timeout: 3000 });
        expect(avatarInput().value).toBe(CHANNELS['@alpha_ch'].avatarUrl);

        typeChannel('@beta_ch');
        await waitFor(() => expect(nameInput().value).toBe('Beta'), { timeout: 3000 });
        expect(avatarInput().value).toBe(CHANNELS['@beta_ch'].avatarUrl);

        fireEvent.change(nameInput(), { target: { value: '自訂名稱' } });
        typeChannel('@gamma_ch');
        await waitFor(() => expect(avatarInput().value).toBe(CHANNELS['@gamma_ch'].avatarUrl), { timeout: 3000 });
        expect(nameInput().value).toBe('自訂名稱');

        // 查不到的頻道：自動帶入的頭像清掉，不留上一個頻道的
        typeChannel('@nobody_here');
        await waitFor(() => expect(avatarInput().value).toBe(''), { timeout: 3000 });
        expect(nameInput().value).toBe('自訂名稱');
    });

    it('送出時不送自動帶入的頭像；台灣不送地區證據', async () => {
        render(<ContributeForm />);
        typeChannel('@alpha_ch');
        await waitFor(() => expect(nameInput().value).toBe('Alpha'), { timeout: 3000 });
        const submit = screen.getByRole('button', { name: '送出推薦' });
        await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(submit);
        await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith('/api/vtuber/contribute'))).toBe(true));
        const [, init] = fetchMock.mock.calls.find(([u]) => String(u).startsWith('/api/vtuber/contribute'))!;
        const body = JSON.parse(String((init as RequestInit).body));
        expect(body.name).toBe('Alpha');
        expect(body.avatarUrl).toBeUndefined();
        expect(body.nationalityEvidenceUrl).toBeUndefined();
    });

    it('換頻道後查詢完成前不能送出（避免舊頻道名稱配新網址）', async () => {
        render(<ContributeForm />);
        typeChannel('@alpha_ch');
        await waitFor(() => expect(nameInput().value).toBe('Alpha'), { timeout: 3000 });
        const submit = screen.getByRole('button', { name: '送出推薦' }) as HTMLButtonElement;
        await waitFor(() => expect(submit.disabled).toBe(false));
        typeChannel('@beta_ch');
        expect(submit.disabled).toBe(true);
        await waitFor(() => expect(nameInput().value).toBe('Beta'), { timeout: 3000 });
        await waitFor(() => expect(submit.disabled).toBe(false));
    });

    it('欄位用 aria-describedby 連到提示，必填欄位有 aria-required；預覽卡只有一份', () => {
        render(<ContributeForm />);
        const yt = screen.getByLabelText(/YouTube 頻道網址/);
        expect(yt.getAttribute('aria-required')).toBe('true');
        expect(yt.getAttribute('aria-describedby')).toBe('cf-youtube-hint');
        expect(document.getElementById('cf-youtube-hint')).toBeTruthy();
        expect(document.querySelectorAll('#contribute-preview-h')).toHaveLength(1);
    });
});

describe('Turnstile', () => {
    it('設定讀取失敗顯示錯誤與重試；重試成功後依設定隱藏', async () => {
        let fail = true;
        fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
            if (String(input).startsWith('/api/turnstile-config')) return fail ? json({ ok: false, error: 'boom' }, 500) : json({ ok: true, siteKey: null, enforced: false });
            return json({ ok: false }, 500);
        });
        const onToken = vi.fn();
        const { container } = render(<TurnstileWidget onToken={onToken} />);
        expect(await screen.findByText('人機驗證暫時無法使用')).toBeTruthy();
        expect(onToken).not.toHaveBeenCalledWith('');
        fail = false;
        fireEvent.click(screen.getByRole('button', { name: '重試' }));
        await waitFor(() => expect(onToken).toHaveBeenCalledWith(''));
        expect(container.textContent).toBe('');
    });
});

describe('回報對話框', () => {
    it('來源網址格式不對時擋下並顯示錯誤，不送出', async () => {
        render(<ReportDialog target={{ kind: 'vtuber_info', vtuberId: 'v1', name: '台一' }} onClose={() => {}} />);
        expect(screen.getByText('我們會查證後修正，謝謝你幫忙。')).toBeTruthy();
        fireEvent.click(screen.getByText('地區錯誤'));
        fireEvent.change(screen.getByLabelText('來源連結（選填）'), { target: { value: 'not a url' } });
        const submit = screen.getByRole('button', { name: '送出回報' });
        await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(submit);
        expect(await screen.findByText('來源連結格式不正確（需以 http 或 https 開頭）')).toBeTruthy();
        expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith('/api/report'))).toBe(false);
    });

    it('取消勾選「其他」後，「請填寫說明」的錯誤消失', async () => {
        render(<ReportDialog target={{ kind: 'vtuber_info', vtuberId: 'v1', name: '台一' }} onClose={() => {}} />);
        fireEvent.click(screen.getByText('其他'));
        const submit = screen.getByRole('button', { name: '送出回報' });
        await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(submit);
        const required = i18n.t('report.descriptionRequired', { ns: 'schedule' });
        expect(await screen.findByText(required)).toBeTruthy();
        fireEvent.click(screen.getByText('其他'));
        await waitFor(() => expect(screen.queryByText(required)).toBeNull());
    });
});
