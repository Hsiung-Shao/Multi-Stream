// VTuber 名錄頁（React 版）：公司分組、個人勢、每人連結、載入與錯誤狀態（M10）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../src/i18n/i18n';
import zhTWSchedule from '../../src/i18n/locales/zh-TW/schedule';

const h = vi.hoisted(() => ({ fetchDirectory: vi.fn() }));
vi.mock('../../src/features/schedule/directorySource', () => ({ fetchDirectory: () => h.fetchDirectory() }));
vi.mock('../../src/utils/analytics', () => ({
    logEvent: vi.fn(),
    track: { scheduleFilterChange: vi.fn(), scheduleOpenMulti: vi.fn(), scheduleWatch: vi.fn() },
}));

import { useUIStore } from '../../src/store/useUIStore';

// 頁面檔還不存在：動態載入，讓各 it 各自紅
const PAGE_MODULE = '../../src/components/Pages/VtuberDirectoryPage';
async function renderPage() {
    const { default: VtuberDirectoryPage } = await import(/* @vite-ignore */ PAGE_MODULE);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <VtuberDirectoryPage />
        </QueryClientProvider>,
    );
}

const DATA = {
    groups: [
        { id: 'g1', name: '子午計畫', parent_id: null, kind: 'agency' },
        { id: 'g2', name: '子午計畫二期生', parent_id: 'g1', kind: 'circle' },
        { id: 'g3', name: '獨立公司', parent_id: null, kind: 'agency' },
    ],
    people: [
        { slug: 'a1', name: '甲', img_url: null, group_id: 'g1', last_live_at: '2026-10-01T00:00:00Z' },
        { slug: 'b2', name: '乙', img_url: null, group_id: 'g2', last_live_at: null },
        { slug: 'c3', name: '丙', img_url: null, group_id: 'g3', last_live_at: '2026-09-20T00:00:00Z' },
        { slug: 'solo', name: '獨立丁', img_url: null, group_id: null, last_live_at: null },
    ],
};

const personLinks = () => screen.getAllByRole('link').filter((a) => (a.getAttribute('href') ?? '').startsWith('/zh-TW/schedule/'));

describe('M10 VtuberDirectoryPage', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        vi.clearAllMocks();
        useUIStore.setState({ page: 'vtubers' } as never);
    });

    it('M10 成功：h1 為 directory.title、公司各自一個區塊（子團成員歸頂層公司）、個人勢區、每人帶前綴連結', async () => {
        h.fetchDirectory.mockResolvedValue(DATA);
        await renderPage();
        const title = (zhTWSchedule as Record<string, string>)['directory.title'];
        expect(typeof title).toBe('string');
        expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();

        // 公司區塊：子午計畫含甲（直屬）與乙（子團），不含丙；子團名當小標出現
        const corpSection = (await screen.findByRole('heading', { level: 2, name: /子午計畫/ })).closest('section') as HTMLElement;
        expect(corpSection).not.toBeNull();
        expect(within(corpSection).getByRole('link', { name: /甲/ })).toHaveAttribute('href', '/zh-TW/schedule/a1');
        expect(within(corpSection).getByRole('link', { name: /乙/ })).toHaveAttribute('href', '/zh-TW/schedule/b2');
        expect(within(corpSection).queryByRole('link', { name: /丙/ })).toBeNull();
        expect(within(corpSection).getByText('子午計畫二期生')).toBeInTheDocument();

        const otherSection = screen.getByRole('heading', { level: 2, name: '獨立公司' }).closest('section') as HTMLElement;
        expect(within(otherSection).getByRole('link', { name: /丙/ })).toHaveAttribute('href', '/zh-TW/schedule/c3');

        // 個人勢區
        const indepSection = screen.getByRole('heading', { level: 2, name: /個人勢/ }).closest('section') as HTMLElement;
        expect(within(indepSection).getByRole('link', { name: /獨立丁/ })).toHaveAttribute('href', '/zh-TW/schedule/solo');
        expect(within(indepSection).queryByRole('link', { name: /甲|乙|丙/ })).toBeNull();

        // 總連結數：每人恰好一個，沒有重複也沒有漏掉
        expect(personLinks()).toHaveLength(4);
    });

    it('M10 載入中：顯示載入文案，還沒有任何人物連結', async () => {
        h.fetchDirectory.mockReturnValue(new Promise(() => {}));
        await renderPage();
        expect(await screen.findByText(/載入/)).toBeInTheDocument();
        expect(screen.queryAllByRole('link').filter((a) => (a.getAttribute('href') ?? '').startsWith('/zh-TW/schedule/'))).toHaveLength(0);
    });

    it('M10 失敗：顯示 role=alert，不顯示名單', async () => {
        h.fetchDirectory.mockRejectedValue(new Error('boom'));
        await renderPage();
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(screen.queryAllByRole('link').filter((a) => (a.getAttribute('href') ?? '').startsWith('/zh-TW/schedule/'))).toHaveLength(0);
    });
});
