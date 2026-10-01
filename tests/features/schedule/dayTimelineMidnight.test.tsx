// 「接下來」寬限 15 分鐘跨午夜：昨天 23:55 的場次在 00:05 仍顯示在今天，整點標「昨天」；
// 只剩過了時間的場次時「現在」線畫在最後（原本整個不畫、全部變淡）
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../../src/i18n/i18n';
import { DayTimeline } from '../../../src/features/schedule/DayTimeline';
import type { ScheduleStream } from '../../../src/features/schedule/types';

// 用本地時區的午夜，測試不受執行環境時區影響
const midnight = new Date(2026, 9, 2, 0, 0, 0, 0).getTime();
const at = (offsetMin: number) => new Date(midnight + offsetMin * 60_000).toISOString();
const s = (id: string, start: string): ScheduleStream => ({ vtuber_id: id, platform: 'youtube', external_id: id, source: 'yt_waiting_room', status: 'scheduled', scheduled_start: start });
const channels = { a: { name: '昨晚的人' }, b: { name: '今晚的人' } } as never;
const props = { channels, selected: new Set<string>(), onToggle: () => {}, onSelectMany: () => {} };

beforeEach(async () => {
    await i18n.changeLanguage('zh-TW');
});

describe('DayTimeline 跨午夜', () => {
    it('昨天 23:55 的寬限場次放今天、整點標「昨天」，「現在」線在它之後', () => {
        const { container } = render(<DayTimeline {...props} streams={[s('a', at(-5)), s('b', at(20 * 60))]} now={midnight + 5 * 60_000} />);
        expect(screen.getByText('昨天')).toBeTruthy();
        const items = [...container.querySelectorAll('ol > li')];
        expect(items).toHaveLength(2);
        // 第一組是昨天 23 點（沒有現在線）；現在線畫在 20 點那組前面
        expect(items[0].textContent).toContain('昨晚的人');
        expect(items[0].querySelector('[aria-label="現在"]')).toBeNull();
        expect(items[1].textContent).toContain('今晚的人');
        expect(items[1].querySelector('[aria-label="現在"]')).not.toBeNull();
    });

    it('今天只剩寬限內的昨天場次：仍畫「現在」線（在最後）', () => {
        const { container } = render(<DayTimeline {...props} streams={[s('a', at(-5))]} now={midnight + 5 * 60_000} />);
        const items = [...container.querySelectorAll('ol > li')];
        expect(items).toHaveLength(2);
        expect(items[0].textContent).toContain('昨天');
        expect(items[1].querySelector('[aria-label="現在"]')).not.toBeNull();
    });

    it('一般日子不標「昨天」', () => {
        render(<DayTimeline {...props} streams={[s('b', at(20 * 60))]} now={midnight + 60 * 60_000} />);
        expect(screen.queryByText('昨天')).toBeNull();
    });
});
