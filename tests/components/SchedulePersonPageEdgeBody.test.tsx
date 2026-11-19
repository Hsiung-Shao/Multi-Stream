// 個人頁載入中／查詢失敗時沿用 edge 預渲染內文，避免畫面先清空再補（CLS）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../src/i18n/i18n';
import type { SchedulePerson } from '../../src/features/schedule/personSource';

const h = vi.hoisted(() => ({
    fetchPerson: vi.fn(),
    addStream: vi.fn(async (_url: string, _opts?: unknown) => ({ success: true })),
}));
vi.mock('../../src/features/schedule/personSource', () => ({ fetchPerson: (slug: string) => h.fetchPerson(slug) }));
vi.mock('../../src/utils/analytics', () => ({
    logEvent: vi.fn(),
    track: { scheduleFilterChange: vi.fn(), scheduleOpenMulti: vi.fn(), scheduleWatch: vi.fn() },
}));
vi.mock('../../src/store/useStreamStore', () => ({
    useStreamStore: Object.assign(
        (selector: (s: { streams: unknown[] }) => unknown) => selector({ streams: [] }),
        { getState: () => ({ streams: [], addStream: h.addStream }) },
    ),
}));

import { SchedulePersonPage } from '../../src/components/Pages/SchedulePersonPage';
import { useUIStore } from '../../src/store/useUIStore';
import { captureEdgeBody, resetEdgeBody } from '../../src/features/schedule/edgeBody';

const PATH = '/schedule/taione';
const EDGE_NAME = '預渲染小明';

const person: SchedulePerson = {
    id: 'v1',
    indexable: false,
    channel: { name: '台一', nationality: 'TW', group: null, slug: 'taione', youtube: null, twitch: null },
    live: [],
    upcoming: [],
    recent: [],
} as unknown as SchedulePerson;

function capture(path: string) {
    const root = document.createElement('div');
    root.innerHTML = `<h1>${EDGE_NAME}</h1>`;
    captureEdgeBody(root, path);
}

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <SchedulePersonPage slug="taione" />
        </QueryClientProvider>,
    );
}

describe('SchedulePersonPage edge 內文', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        vi.clearAllMocks();
        resetEdgeBody();
        window.history.pushState({}, '', PATH);
        useUIStore.setState({ page: 'schedule:taione' });
    });

    it('載入中顯示 edge 內文', () => {
        capture(PATH);
        h.fetchPerson.mockReturnValue(new Promise(() => {}));
        renderPage();
        expect(screen.getByText(EDGE_NAME)).toBeInTheDocument();
        expect(document.querySelector('[data-edge-body]')).not.toBeNull();
        expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    });

    it('查詢失敗仍顯示 edge 內文', async () => {
        capture(PATH);
        h.fetchPerson.mockRejectedValue(new Error('boom'));
        renderPage();
        // 元件自帶 retry:1（約 1 秒後才進入失敗狀態）
        expect(await screen.findByRole('button', { name: '重試' }, { timeout: 5000 })).toBeInTheDocument();
        expect(screen.getByText(EDGE_NAME)).toBeInTheDocument();
        expect(document.querySelector('[data-edge-body]')).not.toBeNull();
    }, 10000);

    it('換到別人的頁不沿用舊內文', () => {
        capture('/schedule/someone-else');
        h.fetchPerson.mockReturnValue(new Promise(() => {}));
        renderPage();
        expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
        expect(screen.queryByText(EDGE_NAME)).toBeNull();
        expect(document.querySelector('[data-edge-body]')).toBeNull();
    });

    it('資料到了換成正式介面', async () => {
        capture(PATH);
        h.fetchPerson.mockResolvedValue(person);
        renderPage();
        expect(await screen.findByRole('heading', { level: 1, name: '台一' })).toBeInTheDocument();
        expect(document.querySelector('[data-edge-body]')).toBeNull();
        expect(screen.queryByText(EDGE_NAME)).toBeNull();
    });
});
