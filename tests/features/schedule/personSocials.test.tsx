// 個人頁社群連結新增 Threads、Discord：fetchPerson 帶出欄位（P1）、個人頁顯示與順序（P2）、沒有值不顯示（P3）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../src/i18n/i18n';
import { resetPersonSourceCache, type SchedulePerson } from '../../../src/features/schedule/personSource';

// 頁面測試只換掉 fetchPerson（外部 I/O 入口），其餘匯出保留；P1 透過 actual 取真的 fetchPerson，只 mock 底層 fetch
const h = vi.hoisted(() => ({ fetchPerson: vi.fn(), real: { fn: null as null | ((...a: unknown[]) => Promise<unknown>) } }));
vi.mock('../../../src/features/schedule/personSource', async (importActual) => {
    const actual = await importActual<typeof import('../../../src/features/schedule/personSource')>();
    h.real.fn = actual.fetchPerson as unknown as (...a: unknown[]) => Promise<unknown>;
    return { ...actual, fetchPerson: (slug: string) => h.fetchPerson(slug) };
});
vi.mock('../../../src/utils/analytics', () => ({
    logEvent: vi.fn(),
    track: { scheduleFilterChange: vi.fn(), scheduleOpenMulti: vi.fn(), scheduleWatch: vi.fn() },
}));

import { SchedulePersonPage } from '../../../src/components/Pages/SchedulePersonPage';
import { useUIStore } from '../../../src/store/useUIStore';

const THREADS = 'https://www.threads.net/@taione';
const DISCORD = 'https://discord.gg/taione';

beforeEach(async () => {
    await i18n.changeLanguage('zh-TW');
    vi.clearAllMocks();
});

describe('fetchPerson 社群欄位', () => {
    beforeEach(() => resetPersonSourceCache());
    const env = { envUrl: 'http://127.0.0.1:57321/', envAnonKey: 'anon-test', now: Date.parse('2026-10-01T00:00:00Z') };
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const vt = { id: 'v1', name: '台一', img_url: null, nationality: 'TW', youtube_channel_id: null, twitch_channel_id: null, slug: 'taione', schedule_indexable: true, vtuber_groups: null };

    async function run(extra: Record<string, unknown>) {
        const urls: string[] = [];
        const fetchFn = vi.fn(async (url: string) => {
            urls.push(decodeURIComponent(url));
            return url.includes('/vtubers?') ? json([{ ...vt, ...extra }]) : json([]);
        });
        const p = (await h.real.fn!('taione', { ...env, fetchFn: fetchFn as unknown as typeof fetch })) as SchedulePerson | null;
        return { p, urls };
    }

    it('P1 回應含 threads_url、discord_url 時 profile 帶出，且 select 有選這兩欄', async () => {
        const { p, urls } = await run({ threads_url: THREADS, discord_url: DISCORD });
        expect(urls[0]).toContain('threads_url');
        expect(urls[0]).toContain('discord_url');
        expect(p?.profile.threads).toBe(THREADS);
        expect(p?.profile.discord).toBe(DISCORD);
    });

    it('P1 threads_url、discord_url 為 null 時 profile 不帶這兩個鍵', async () => {
        const { p } = await run({ threads_url: null, discord_url: null, x_url: 'https://x.com/a' });
        expect(p?.profile).toEqual({ x: 'https://x.com/a' });
        expect(p?.profile).not.toHaveProperty('threads');
        expect(p?.profile).not.toHaveProperty('discord');
    });
});

describe('個人頁社群連結', () => {
    function person(profile: Record<string, string>): SchedulePerson {
        return {
            id: 'v1',
            indexable: true,
            channel: { name: '台一', nationality: 'TW', group: '子午計畫', slug: 'taione', youtube: 'UC0000000000000000000001' },
            profile,
            live: [],
            upcoming: [],
            recent: [],
        };
    }
    function renderPage() {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        return render(
            <QueryClientProvider client={client}>
                <SchedulePersonPage slug="taione" />
            </QueryClientProvider>,
        );
    }
    beforeEach(() => useUIStore.setState({ page: 'schedule:taione' }));
    // 站台頁尾本身就有 Discord 社群連結：只在個人頁頭部（h1 所在的 header）內找
    async function headerOf() {
        const h1 = await screen.findByRole('heading', { level: 1, name: '台一' });
        return within(h1.closest('header') as HTMLElement);
    }

    it('P2 有 Threads、Discord 時顯示外連，href 與 rel 正確，且在 Instagram 之後', async () => {
        h.fetchPerson.mockResolvedValue(person({
            x: 'https://x.com/taione',
            facebook: 'https://www.facebook.com/taione',
            instagram: 'https://www.instagram.com/taione',
            threads: THREADS,
            discord: DISCORD,
        }));
        renderPage();
        const head = await headerOf();
        const threads = head.getByRole('link', { name: 'Threads' });
        const discord = head.getByRole('link', { name: 'Discord' });
        expect(threads).toHaveAttribute('href', THREADS);
        expect(discord).toHaveAttribute('href', DISCORD);
        for (const a of [threads, discord]) {
            expect(a).toHaveAttribute('target', '_blank');
            const rel = (a.getAttribute('rel') ?? '').split(/\s+/);
            expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer', 'nofollow']));
        }
        const order = ['X', 'Facebook', 'Instagram', 'Threads', 'Discord'].map((n) => head.getByRole('link', { name: n }));
        for (let i = 0; i < order.length - 1; i++) {
            expect(order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
    });

    it('P3 profile 沒有 Threads、Discord 時不顯示這兩個連結', async () => {
        h.fetchPerson.mockResolvedValue(person({ instagram: 'https://www.instagram.com/taione' }));
        renderPage();
        const head = await headerOf();
        expect(head.getByRole('link', { name: 'Instagram' })).toBeInTheDocument();
        expect(head.queryByRole('link', { name: 'Threads' })).not.toBeInTheDocument();
        expect(head.queryByRole('link', { name: 'Discord' })).not.toBeInTheDocument();
    });
});
