// 時間未定場次（time_tbd）在時間軸列 SlotRow 顯示「時間未定」，不顯示存放用的 00:00
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import i18n from '../../../src/i18n/i18n';
import { SlotRow } from '../../../src/features/schedule/ScheduleCard';
import { formatClock } from '../../../src/features/schedule/formatTime';
import type { ScheduleStream } from '../../../src/features/schedule/types';

/** 台北 10/15 00:00（時間未定場次存當天 00:00） */
const TBD_1015 = '2026-10-14T16:00:00.000Z';
const NOW = Date.parse('2026-10-14T10:00:00+08:00');
const channel = { name: '台一', nationality: 'TW' } as never;
const base: ScheduleStream = { vtuber_id: 'v1', platform: 'youtube', external_id: 'post:UgkxTbd:1', source: 'community_post', status: 'scheduled', title: '雜談', scheduled_start: TBD_1015 };

function renderRow(stream: ScheduleStream) {
    return render(
        <ul>
            <SlotRow stream={stream} channel={channel} now={NOW} selected={false} onToggle={() => {}} />
        </ul>,
    );
}

beforeEach(async () => {
    await i18n.changeLanguage('zh-TW');
});

describe('SlotRow 時間未定', () => {
    it('T16 時間未定場次顯示「時間未定」，不顯示存放用的時刻', () => {
        const { container } = renderRow({ ...base, time_tbd: true });
        expect(container.textContent).toContain('時間未定');
        // 存放時刻在執行環境時區下的顯示（台北時區即 00:00）不能出現
        expect(container.textContent).not.toContain(formatClock(TBD_1015, 'zh-TW'));
        expect(container.textContent).toContain('雜談');
    });

    it('T16 一般場次照常顯示時刻、沒有「時間未定」', () => {
        const { container } = renderRow({ ...base, source: 'yt_waiting_room', external_id: 'AbCdEfGhIjK' });
        expect(container.textContent).not.toContain('時間未定');
        expect(container.textContent).toContain(formatClock(TBD_1015, 'zh-TW'));
    });
});
