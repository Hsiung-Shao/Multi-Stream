// 公開狀態頁：載入中、四區顯示、部分來源失敗逐區顯示、整份失敗可重試、最近更新與回報入口
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../src/i18n/i18n';
import type { StatusResponse } from '../../src/features/status/api';

vi.mock('../../src/utils/analytics', () => ({ logEvent: vi.fn(), track: {} }));

import { StatusPage } from '../../src/components/Pages/StatusPage';
import { useUIStore } from '../../src/store/useUIStore';
import { versionHistoryData } from '../../src/config/versionHistoryData';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const ago = (m: number) => new Date(NOW - m * 60_000).toISOString();

const payload = (over: Partial<StatusResponse> = {}): StatusResponse => ({
    success: true,
    checkedAt: ago(0),
    overall: 'degraded',
    site: {
        status: 'operational',
        jobs: [
            { key: 'live', status: 'operational', lastRunAt: ago(5) },
            { key: 'light', status: 'operational', lastRunAt: ago(3) },
            { key: 'heavy', status: 'operational', lastRunAt: ago(30) },
            { key: 'twitchSchedule', status: 'operational', lastRunAt: ago(30) },
        ],
    },
    youtube: { status: 'operational', checked: 120, failed: 4, quotaExceeded: false, lastRunAt: ago(5) },
    twitch: { status: 'degraded', components: [{ name: 'Chat', status: 'degraded' }], incidents: [{ name: 'Chat delays', status: 'identified', url: 'https://stspg.io/x', updatedAt: null }], updatedAt: null },
    issues: [
        { id: 'r1', title: '已修好的問題', body: null, status: 'resolved', severity: 'minor', areas: ['chat'], created_at: ago(3000), updated_at: ago(60), resolved_at: ago(60) },
        { id: 'o1', title: '聊天室偶爾空白', body: '重新整理可暫時解決', status: 'fixing', severity: 'major', areas: ['chat', 'twitch'], created_at: ago(200), updated_at: ago(90), resolved_at: null },
    ],
    announcements: [{ id: 'a1', title: '週末維護通知', body: '週六凌晨維護 30 分鐘', starts_at: ago(1000), ends_at: null }],
    feedbacks: [
        { id: 'f1', content: '切換版型後聲音不見', status: 'processing', created_at: ago(30) },
        { id: 'f3', content: '手機上聊天室太窄', status: 'fixed', created_at: ago(2000) },
        { id: 'f4', content: 'YouTube 有時偵測不到開台', status: 'read', created_at: ago(3000) },
    ],
    ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;
const jsonRes = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <StatusPage />
        </QueryClientProvider>,
    );
}

const section = (name: string) => screen.getByRole('region', { name });

describe('StatusPage', () => {
    beforeEach(async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        await i18n.changeLanguage('zh-TW');
        fetchMock = vi.fn(async () => jsonRes(payload()));
        vi.stubGlobal('fetch', fetchMock);
        useUIStore.setState({ page: 'status' });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('先顯示載入中與各區標題（預渲染殼層），資料回來後顯示總燈號與四區', async () => {
        renderPage();
        expect(screen.getByRole('heading', { level: 1, name: '服務狀態與已知問題' })).toBeInTheDocument();
        expect(screen.getByText('正在檢查服務狀態…')).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 2, name: '已知問題' })).toBeInTheDocument();

        // 總燈號標題直接點名出問題的服務，內文帶出未解決的已知問題數
        expect(await screen.findByText('Twitch Chat目前有延遲')).toBeInTheDocument();
        expect(screen.getByText('其他服務運作正常；站方也在處理 1 個已知問題。')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '查看已知問題（1）' })).toHaveAttribute('href', '#status-issues-h');
        expect(fetchMock).toHaveBeenCalledWith('/api/status', expect.objectContaining({ credentials: 'same-origin' }));

        const services = section('服務狀態');
        expect(within(services).getByText('本站偵測，非 YouTube 官方狀態')).toBeInTheDocument();
        expect(within(services).getByText('116')).toBeInTheDocument();
        expect(within(services).getByRole('img', { name: '120 個頻道中 4 個讀取失敗' })).toBeInTheDocument();
        expect(within(services).getByText('116 / 120 個頻道讀取成功')).toBeInTheDocument();
        expect(within(services).getByText('Chat 有狀況・其餘 0 項正常')).toBeInTheDocument();
        expect(within(services).getByRole('link', { name: /Chat delays/ })).toHaveAttribute('href', 'https://stspg.io/x');
        // 燈號圖例：形狀＋文字
        expect(within(services).getByRole('list', { name: '燈號說明' })).toBeInTheDocument();

        expect(within(section('公告')).getByText('週末維護通知')).toBeInTheDocument();
    });

    it('已知問題：未解決的排在前面，顯示狀態、影響程度與範圍', async () => {
        renderPage();
        // 卡片內還有進度條的 <li>，用每張卡片的標題（h3）往上找卡片本身
        const issues = await waitFor(() => {
            const titles = within(section('已知問題')).getAllByRole('heading', { level: 3 });
            expect(titles.length).toBe(2);
            return titles.map((h) => h.closest('li') as HTMLElement);
        });
        expect(within(issues[0]).getByText('聊天室偶爾空白')).toBeInTheDocument();
        expect(within(issues[0]).getAllByText('修復中').length).toBeGreaterThan(0);
        expect(within(issues[0]).getByRole('list', { name: '處理進度：修復中（第 3 步，共 5 步）' })).toBeInTheDocument();
        expect(within(issues[0]).getByText('影響較大')).toBeInTheDocument();
        expect(within(issues[0]).getByText('聊天室')).toBeInTheDocument();
        expect(within(issues[issues.length - 1]).getByText('已修好的問題')).toBeInTheDocument();
        expect(within(issues[issues.length - 1]).getByRole('list', { name: '處理進度：已修復（第 5 步，共 5 步）' })).toBeInTheDocument();
    });

    it('使用者回報：每筆顯示狀態與內容，三種公開狀態都有文字標示', async () => {
        renderPage();
        const list = await waitFor(() => {
            const s = section('使用者回報');
            expect(within(s).getAllByRole('listitem')).toHaveLength(3);
            return s;
        });
        expect(within(list).getByText('切換版型後聲音不見')).toBeInTheDocument();
        for (const label of ['處理中', '已修正', '已讀']) expect(within(list).getByText(label)).toBeInTheDocument();
    });

    it('使用者回報：空清單與取不到資料分開顯示', async () => {
        fetchMock.mockImplementation(async () => jsonRes(payload({ feedbacks: [] })));
        const { unmount } = renderPage();
        expect(await within(await waitFor(() => section('使用者回報'))).findByText('近 30 天沒有公開的回報。')).toBeInTheDocument();
        unmount();
        fetchMock.mockImplementation(async () => jsonRes(payload({ feedbacks: null })));
        renderPage();
        expect(await within(await waitFor(() => section('使用者回報'))).findByText('這部分資料暫時無法取得，請稍後再試。')).toBeInTheDocument();
    });

    it('單一來源失敗（null）只影響該區；空清單顯示空狀態', async () => {
        fetchMock.mockImplementation(async () => jsonRes(payload({ twitch: null, issues: [], announcements: null })));
        renderPage();
        // Twitch 拿不到、其他項目都正常：沒有可點名的服務，退回通用標題
        await screen.findByText('部分服務延遲或不穩定');
        expect(within(section('已知問題')).getByText('目前沒有已知問題。遇到狀況歡迎回報給我們。')).toBeInTheDocument();
        expect(within(section('公告')).getByText('這部分資料暫時無法取得，請稍後再試。')).toBeInTheDocument();
        // Twitch 卡片：手機摘要與桌機明細各一份（jsdom 不套 CSS 的 hidden）
        expect(within(section('服務狀態')).getAllByText('這部分資料暫時無法取得，請稍後再試。').length).toBeGreaterThan(0);
    });

    it('整份請求失敗：顯示錯誤與重試，重試成功後恢復', async () => {
        // useStatus 自帶 retry: 1，要連續失敗才會進錯誤狀態
        fetchMock.mockImplementation(async () => jsonRes({ error: 'boom' }, 500));
        renderPage();
        expect(await screen.findByText('暫時無法取得服務狀態', {}, { timeout: 5000 })).toBeInTheDocument();
        fetchMock.mockImplementation(async () => jsonRes(payload()));
        fireEvent.click(screen.getByRole('button', { name: '重試' }));
        expect(await screen.findByText('Twitch Chat目前有延遲')).toBeInTheDocument();
    });

    it('最近更新列出最新 3 版；按鈕開啟版本紀錄與回報視窗', async () => {
        renderPage();
        const updates = section('最近更新');
        for (const v of versionHistoryData.slice(0, 3)) expect(within(updates).getByText(v.version)).toBeInTheDocument();
        expect(within(updates).queryByText(versionHistoryData[3].version)).not.toBeInTheDocument();

        fireEvent.click(within(updates).getByRole('button', { name: /完整版本紀錄/ }));
        expect(useUIStore.getState().modals.history).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: '回報問題' }));
        expect(useUIStore.getState().modals.feedback).toBe(true);
    });
});
