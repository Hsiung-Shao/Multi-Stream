// 共用片段編輯器：匯入預覽可勾選排除、沒寫結束的列標「估計」、改過結束時間後標記消失
import { describe, it, expect, beforeAll } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import i18n from '../../../src/i18n/i18n';
import { SegmentEditor } from '../../../src/features/songs/components/SegmentEditor';
import { computeRowIssues, prepareImport, lineHasExplicitEnd, type SegmentRowDraft } from '../../../src/features/songs/components/segmentRows';
import { parseTimelineDetailed } from '../../../src/features/songs/lib/timelineParser';

beforeAll(async () => {
    await i18n.changeLanguage('zh-TW');
});

const TEXT = ['1. 0:00 歌A / 原唱A', '2. 10:00 歌B / 原唱B', '3. 12:00-14:00 歌C / 原唱C'].join('\n');

function Harness({ duration = 1000 }: { duration?: number }) {
    const [rows, setRows] = useState<SegmentRowDraft[]>([]);
    return <SegmentEditor rows={rows} onRowsChange={setRows} issues={computeRowIssues(rows, duration)} player={null} duration={duration} />;
}

const table = () => screen.getByRole('table');

describe('prepareImport', () => {
    it('原文沒寫區間的列改用估計結束，有區間的保留原值', () => {
        const lines = TEXT.split('\n');
        const rows = prepareImport(parseTimelineDetailed(TEXT).rows, lines, 1000);
        expect(rows.map((r) => [r.end, r.endEstimated])).toEqual([[360, true], [720, true], [840, false]]);
    });

    it('全形與數學粗體數字的區間也認得', () => {
        expect(lineHasExplicitEnd('𝟏𝟏. １２：００－１４：００ 歌')).toBe(true);
        expect(lineHasExplicitEnd('11. 12:00 歌 - 原唱')).toBe(false);
    });
});

describe('SegmentEditor', () => {
    it('取消勾選的列不匯入，估計只看留下的列', () => {
        render(<Harness />);
        fireEvent.change(screen.getByRole('textbox', { name: '時間軸文字' }), { target: { value: TEXT } });
        fireEvent.click(screen.getByRole('checkbox', { name: '匯入「歌B」' }));
        expect(screen.getByText(/目前 2 首/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /取代現有片段/ }));

        expect(screen.getByRole('textbox', { name: '第 1 首歌名' })).toHaveValue('歌A');
        expect(screen.getByRole('textbox', { name: '第 2 首歌名' })).toHaveValue('歌C');
        expect(screen.queryByRole('textbox', { name: '第 3 首歌名' })).toBeNull();
        // 歌B 被排除：歌A 的結束取「開始＋6 分鐘」而不是歌B 的開始
        expect(screen.getByRole('textbox', { name: '第 1 首結束時間' })).toHaveValue('6:00');
    });

    it('估計的結束時間顯示標記，改過結束時間後標記消失', () => {
        render(<Harness />);
        fireEvent.change(screen.getByRole('textbox', { name: '時間軸文字' }), { target: { value: TEXT } });
        fireEvent.click(screen.getByRole('button', { name: /取代現有片段/ }));

        const rows = within(table()).getAllByRole('row').slice(1);
        expect(within(rows[0]).getByText('估計')).toBeInTheDocument();
        expect(within(rows[1]).getByText('估計')).toBeInTheDocument();
        expect(within(rows[2]).queryByText('估計')).toBeNull();

        fireEvent.change(screen.getByRole('textbox', { name: '第 1 首結束時間' }), { target: { value: '4:30' } });
        expect(within(within(table()).getAllByRole('row')[1]).queryByText('估計')).toBeNull();
        expect(within(within(table()).getAllByRole('row')[2]).getByText('估計')).toBeInTheDocument();
    });

    it('顯示略過其他版本行數與停止解析的行號', () => {
        render(<Harness />);
        const text = ['0:00 歌A', ' └ 1:00 歌A（重唱）', '5:00 歌B', '時間軸', '0:30 聊天精華'].join('\n');
        fireEvent.change(screen.getByRole('textbox', { name: '時間軸文字' }), { target: { value: text } });
        expect(screen.getByText('已略過 1 行其他版本（└ ├ 開頭）')).toBeInTheDocument();
        expect(screen.getByText('第 4 行起是「時間軸」段落，之後未解析')).toBeInTheDocument();
    });
});
