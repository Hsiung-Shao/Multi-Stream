// 週表「依時段分帶」：bandOf／groupByBand 的分帶規則、DayBands 的區塊與收合、密度切換的記憶
// U 編號對應計畫〈週表 VOD 與時段分帶〉的測試規格表
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../src/i18n/i18n';
import { bandOf, groupByBand, type Band } from '../../../src/features/schedule/bands';
import { DayBands } from '../../../src/features/schedule/DayBands';
import { ScheduleBoard } from '../../../src/features/schedule/ScheduleBoard';
import { PRESERVED_KEYS } from '../../../src/utils/versionCheck';
import { streamKey, type ScheduleChannel, type ScheduleStream } from '../../../src/features/schedule/types';
import { makeSnapshot } from './fixtures';

// 一律用本地時間建立，測試不受執行環境時區影響
const local = (h: number, mi = 0, day = 14) => new Date(2026, 9, day, h, mi).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

describe('U3 bandOf：依觀眾裝置時區的小時分帶', () => {
    // now 放在前一天凌晨，所有當天場次都離「現在」很遠，只看小時規則
    const FAR_NOW = local(3, 0, 13);

    it('09:30／14:00／19:00／01:00 依序落 morning／afternoon／evening／night（now=14:42）', () => {
        const now = local(14, 42);
        expect(bandOf(local(9, 30), now)).toBe('morning');
        // 14:00 已過 15 分鐘寬限，不能留在「進行中／即將」
        expect(bandOf(local(14, 0), now)).toBe('afternoon');
        expect(bandOf(local(19, 0), now)).toBe('evening');
        expect(bandOf(local(1, 0), now)).toBe('night');
    });

    it('now=13:50 時 14:00 的場次落 now', () => {
        expect(bandOf(local(14, 0), local(13, 50))).toBe('now');
    });

    it('now 帶的下限：剛好 15 分鐘前仍是 now，再早 1 分鐘就回到小時分帶', () => {
        const now = local(14, 42);
        expect(bandOf(local(14, 27), now)).toBe('now');
        expect(bandOf(local(14, 26), now)).toBe('afternoon');
    });

    it('now 帶優先於小時分帶：寬限內剛開始的下午場次算 now 而不是 afternoon', () => {
        expect(bandOf(local(14, 30), local(14, 42))).toBe('now');
    });

    it('離現在很遠的下午場次不算 now', () => {
        expect(bandOf(local(16, 0), local(14, 42))).toBe('afternoon');
    });

    it.each<[number, number, Band]>([
        [0, 0, 'night'],
        [5, 59, 'night'],
        [6, 0, 'morning'],
        [11, 59, 'morning'],
        [12, 0, 'afternoon'],
        [17, 59, 'afternoon'],
        [18, 0, 'evening'],
        [23, 59, 'evening'],
    ])('邊界 %i:%i → %s', (h, mi, expected) => {
        expect(bandOf(local(h, mi), FAR_NOW)).toBe(expected);
    });
});

describe('U3 groupByBand', () => {
    type S = { scheduled_start?: string; actual_start?: string; tag: string };
    const s = (tag: string, startMs: number): S => ({ tag, scheduled_start: iso(startMs) });

    it('只回有場次的分帶，順序 now → morning → afternoon → evening → night', () => {
        const now = local(14, 42);
        const groups = groupByBand<S>([s('night', local(1)), s('eve', local(19)), s('now', local(14, 30)), s('morn', local(9, 30))], now);
        expect(groups.map((g) => g.band)).toEqual(['now', 'morning', 'evening', 'night']);
    });

    it('分帶內依時間升冪，與輸入順序無關', () => {
        const now = local(14, 42);
        const groups = groupByBand<S>([s('c', local(17, 30)), s('a', local(15, 30)), s('b', local(16, 0))], now);
        expect(groups).toHaveLength(1);
        expect(groups[0].band).toBe('afternoon');
        expect(groups[0].items.map((x) => x.tag)).toEqual(['a', 'b', 'c']);
    });

    it('沒有 scheduled_start 的場次改用 actual_start', () => {
        const now = local(14, 42);
        const groups = groupByBand<S>([{ tag: 'live', actual_start: iso(local(14, 40)) }], now);
        expect(groups.map((g) => g.band)).toEqual(['now']);
    });

    it('空輸入回傳空陣列', () => {
        expect(groupByBand([], local(12))).toEqual([]);
    });
});

describe('U4 DayBands', () => {
    const NOW = local(7, 0);
    const channels: Record<string, ScheduleChannel> = {};
    const mk = (i: number, startMs: number): ScheduleStream => {
        channels[`v${i}`] = { name: `人${i}`, nationality: 'TW' };
        return { vtuber_id: `v${i}`, platform: 'youtube', external_id: `vid${i}`, source: 'yt_waiting_room', status: 'scheduled', title: `場${i}`, scheduled_start: iso(startMs) };
    };
    /** 下午 12:00 起每 5 分鐘一場 */
    const afternoon = (n: number) => Array.from({ length: n }, (_, i) => mk(i + 1, local(12, 0) + i * 5 * 60_000));
    const boxes = () => screen.queryAllByRole('checkbox');

    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        for (const k of Object.keys(channels)) delete channels[k];
    });

    const base = { channels, now: NOW, selected: new Set<string>(), onToggle: () => {} };

    it('每個有場次的分帶一個區塊，標題用繁中文案', () => {
        const now = local(14, 42);
        const streams = [mk(1, local(9, 30)), mk(2, local(14, 30)), mk(3, local(16, 0)), mk(4, local(19, 0)), mk(5, local(1, 0))];
        render(<DayBands {...base} now={now} streams={streams} />);
        expect(screen.getByText('進行中／即將')).toBeTruthy();
        expect(screen.getByText('上午')).toBeTruthy();
        expect(screen.getByText('下午')).toBeTruthy();
        expect(screen.getByText('晚上')).toBeTruthy();
        expect(screen.getByText('深夜')).toBeTruthy();
        expect(boxes()).toHaveLength(5);
    });

    it('沒有場次的分帶不出標題', () => {
        render(<DayBands {...base} streams={[mk(1, local(9, 30))]} />);
        expect(screen.getByText('上午')).toBeTruthy();
        expect(screen.queryByText('下午')).toBeNull();
        expect(screen.queryByText('深夜')).toBeNull();
    });

    it('每場是 label＋checkbox：aria-label「勾選 名字」、title「名字 · HH:MM」', () => {
        const { container } = render(<DayBands {...base} streams={[mk(1, local(9, 30))]} />);
        const box = screen.getByRole('checkbox', { name: '勾選 人1' });
        const label = box.closest('label');
        expect(label).not.toBeNull();
        expect(label?.getAttribute('title')).toBe('人1 · 09:30');
        expect(container.querySelectorAll('label')).toHaveLength(1);
    });

    it('勾選狀態來自 selected，點擊呼叫 onToggle 並帶該場次', () => {
        const streams = [mk(1, local(9, 30)), mk(2, local(10, 0))];
        const onToggle = vi.fn();
        render(<DayBands {...base} streams={streams} selected={new Set([streamKey(streams[1])])} onToggle={onToggle} />);
        expect((screen.getByRole('checkbox', { name: '勾選 人1' }) as HTMLInputElement).checked).toBe(false);
        expect((screen.getByRole('checkbox', { name: '勾選 人2' }) as HTMLInputElement).checked).toBe(true);
        fireEvent.click(screen.getByRole('checkbox', { name: '勾選 人1' }));
        expect(onToggle).toHaveBeenCalledTimes(1);
        expect(onToggle.mock.calls[0][0]).toMatchObject({ external_id: 'vid1' });
    });

    it('30 場、rowLimit 14 → 先顯示 14 個 checkbox 與「+16」按鈕，按下後 30 個', () => {
        render(<DayBands {...base} streams={afternoon(30)} rowLimit={14} />);
        expect(boxes()).toHaveLength(14);
        const more = screen.getByRole('button', { name: '展開其餘 16 場' });
        expect(more.textContent).toContain('+16');
        // 被收起的場次不能偷偷渲染在畫面外
        expect(screen.queryByLabelText('勾選 人30')).toBeNull();
        fireEvent.click(more);
        expect(boxes()).toHaveLength(30);
        expect(screen.queryByRole('button', { name: /展開其餘/ })).toBeNull();
    });

    it('沒給 rowLimit 時預設 14', () => {
        render(<DayBands {...base} streams={afternoon(20)} />);
        expect(boxes()).toHaveLength(14);
        expect(screen.getByRole('button', { name: '展開其餘 6 場' })).toBeTruthy();
    });

    it('剛好等於 rowLimit 不出展開按鈕', () => {
        render(<DayBands {...base} streams={afternoon(14)} rowLimit={14} />);
        expect(boxes()).toHaveLength(14);
        expect(screen.queryByRole('button', { name: /展開其餘/ })).toBeNull();
    });

    it('收藏的人排該分帶最前面，即使時間最晚也不會被收進「+N」', () => {
        const streams = afternoon(20);
        render(<DayBands {...base} streams={streams} rowLimit={14} favorites={new Set(['v20'])} />);
        expect(boxes()[0].getAttribute('aria-label')).toBe('勾選 人20');
        expect(screen.getByRole('checkbox', { name: '勾選 人20' })).toBeTruthy();
        // 沒收藏的人保持時間順序
        expect(boxes()[1].getAttribute('aria-label')).toBe('勾選 人1');
    });

    it('收藏只影響分帶內順序，不會把人搬到別的分帶', () => {
        const streams = [mk(1, local(9, 30)), mk(2, local(19, 0))];
        render(<DayBands {...base} streams={streams} favorites={new Set(['v2'])} />);
        const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        const morning = screen.getByText('上午');
        const evening = screen.getByText('晚上');
        const p1 = screen.getByRole('checkbox', { name: '勾選 人1' });
        const p2 = screen.getByRole('checkbox', { name: '勾選 人2' });
        expect(before(morning, p1)).toBe(true);
        expect(before(p1, evening)).toBe(true);
        expect(before(evening, p2)).toBe(true);
    });
});

describe('U5 密度切換與保留清單', () => {
    it('schedule_density 在發版清除 localStorage 時要保留', () => {
        expect(PRESERVED_KEYS).toContain('schedule_density');
    });

    describe('ScheduleBoard', () => {
        beforeEach(async () => {
            await i18n.changeLanguage('zh-TW');
            localStorage.clear();
            vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 404 })));
        });
        afterEach(() => vi.unstubAllGlobals());

        it('切到「詳細」後 localStorage 寫入 schedule_density=detailed', () => {
            const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
            render(
                <QueryClientProvider client={qc}>
                    <ScheduleBoard snapshot={makeSnapshot()} />
                </QueryClientProvider>,
            );
            // 先確認週表本身有畫出來，紅燈才會落在密度切換而不是 render 失敗
            expect(screen.getByText('直播中')).toBeTruthy();
            const group = screen.getByRole('radiogroup', { name: '密度' });
            expect(within(group).getByRole('radio', { name: '簡潔' })).toBeTruthy();
            fireEvent.click(within(group).getByRole('radio', { name: '詳細' }));
            expect(localStorage.getItem('schedule_density')).toBe('detailed');
        });
    });
});
