// 個人週表頁的「相關推薦」：同公司／同團、同時段常開台兩個區塊，與名錄麵包屑（M9）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../src/i18n/i18n';
import type { SchedulePerson } from '../../src/features/schedule/personSource';

const NOW = Date.parse('2026-09-29T04:00:00Z');

const h = vi.hoisted(() => ({ fetchPerson: vi.fn(), fetchPersonRelated: vi.fn() }));
// 相關推薦與個人資料分兩支查（fetchPersonRelated 另一個 useQuery）
vi.mock('../../src/features/schedule/personSource', () => ({
    fetchPerson: (slug: string) => h.fetchPerson(slug),
    fetchPersonRelated: (slug: string) => h.fetchPersonRelated(slug),
}));
vi.mock('../../src/utils/analytics', () => ({
    logEvent: vi.fn(),
    track: { scheduleFilterChange: vi.fn(), scheduleOpenMulti: vi.fn(), scheduleWatch: vi.fn() },
}));
vi.mock('../../src/store/useStreamStore', () => ({
    useStreamStore: Object.assign(
        (selector: (s: { streams: unknown[] }) => unknown) => selector({ streams: [] }),
        { getState: () => ({ streams: [], addStream: vi.fn() }) },
    ),
}));

import { SchedulePersonPage } from '../../src/components/Pages/SchedulePersonPage';
import { useUIStore } from '../../src/store/useUIStore';

type Related = {
    agency: { name: string } | null;
    siblings: Array<{ slug: string; name: string; img_url: string | null; group: string }>;
    neighbors: Array<{ slug: string; name: string; img_url: string | null; last_live_at: string | null }>;
};

const RELATED: Related = {
    agency: { name: '子午計畫' },
    siblings: [
        { slug: 'sib1', name: '同事甲', img_url: null, group: '子午計畫' },
        { slug: 'sib2', name: '同事乙', img_url: null, group: '子午計畫' },
    ],
    neighbors: [{ slug: 'nb1', name: '鄰居丙', img_url: null, last_live_at: '2026-09-28T12:00:00Z' }],
};

const PERSON = {
    id: 'v1',
    indexable: true,
    channel: { name: '台一', nationality: 'TW', group: '子午計畫', slug: 'taione', youtube: null, twitch: null },
    live: [],
    upcoming: [],
    recent: [],
} as unknown as SchedulePerson;

/** 個人資料照常回；related：物件／null＝RPC 回的結果，'pending'＝還沒回來 */
function mockData(related: Related | null | 'pending') {
    h.fetchPerson.mockResolvedValue(PERSON);
    if (related === 'pending') h.fetchPersonRelated.mockReturnValue(new Promise(() => {}));
    else h.fetchPersonRelated.mockResolvedValue(related);
}

/** 等相關推薦查詢被呼叫並讓結果渲染完，再斷言「不存在」才有意義 */
async function settleRelated() {
    await waitFor(() => expect(h.fetchPersonRelated).toHaveBeenCalledWith('taione'));
    await new Promise((r) => setTimeout(r, 0));
}

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <SchedulePersonPage slug="taione" />
        </QueryClientProvider>,
    );
}

const agencySection = () => document.querySelector('[aria-labelledby="person-related-agency"]');
const neighborSection = () => document.querySelector('[aria-labelledby="person-related-neighbors"]');

describe('M9 SchedulePersonPage 相關推薦', () => {
    beforeEach(async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        await i18n.changeLanguage('zh-TW');
        vi.clearAllMocks();
        useUIStore.setState({ page: 'schedule:taione' });
        // 歌回區會打 /api/songs/catalog：回空目錄，與本測試無關
        vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('M9 有 related：兩區塊都在，標題含公司名，每人是帶 /zh-TW 前綴的連結', async () => {
        mockData(RELATED);
        renderPage();
        await screen.findByRole('heading', { level: 1, name: '台一' });
        await waitFor(() => expect(agencySection()).not.toBeNull());

        const agency = agencySection() as HTMLElement;
        expect(agency, '同公司區塊').not.toBeNull();
        expect(document.getElementById('person-related-agency')?.textContent).toContain('子午計畫');
        const sib1 = within(agency).getByRole('link', { name: /同事甲/ });
        expect(sib1).toHaveAttribute('href', '/zh-TW/schedule/sib1');
        expect(within(agency).getByRole('link', { name: /同事乙/ })).toHaveAttribute('href', '/zh-TW/schedule/sib2');
        expect(within(agency).getAllByRole('link')).toHaveLength(2);

        const neighbors = neighborSection() as HTMLElement;
        expect(neighbors, '同時段常開台區塊').not.toBeNull();
        expect(document.getElementById('person-related-neighbors')).not.toBeNull();
        expect(within(neighbors).getByRole('link', { name: /鄰居丙/ })).toHaveAttribute('href', '/zh-TW/schedule/nb1');
        expect(within(neighbors).getAllByRole('link')).toHaveLength(1);
    });

    it('M9 麵包屑含名錄連結 /zh-TW/vtubers', async () => {
        mockData(RELATED);
        renderPage();
        await screen.findByRole('heading', { level: 1, name: '台一' });
        expect(document.querySelector('nav a[href="/zh-TW/vtubers"]')).not.toBeNull();
    });

    it('M9 siblings 為空：不渲染同公司區塊；neighbors 為空：不渲染同時段區塊', async () => {
        mockData({ ...RELATED, siblings: [] });
        const first = renderPage();
        await screen.findByRole('heading', { level: 1, name: '台一' });
        await waitFor(() => expect(neighborSection()).not.toBeNull());
        expect(agencySection()).toBeNull();
        expect(neighborSection()).not.toBeNull();
        first.unmount();

        mockData({ ...RELATED, neighbors: [] });
        renderPage();
        await screen.findByRole('heading', { level: 1, name: '台一' });
        await waitFor(() => expect(agencySection()).not.toBeNull());
        expect(neighborSection()).toBeNull();
    });

    it('M9 related 為 null 或還沒回來：兩區塊都不渲染', async () => {
        mockData(null);
        const first = renderPage();
        await screen.findByRole('heading', { level: 1, name: '台一' });
        await settleRelated();
        expect(agencySection()).toBeNull();
        expect(neighborSection()).toBeNull();
        first.unmount();

        vi.clearAllMocks();
        mockData('pending');
        renderPage();
        await screen.findByRole('heading', { level: 1, name: '台一' });
        await settleRelated();
        expect(agencySection()).toBeNull();
        expect(neighborSection()).toBeNull();
    });
});
