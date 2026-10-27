// 共用片段編輯器：匯入預覽可勾選排除、沒寫結束的列標「估計」、改過結束時間後標記消失
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type React from 'react';
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import i18n from '../../../src/i18n/i18n';
import { SegmentEditor } from '../../../src/features/songs/components/SegmentEditor';
import { computeRowIssues, emptyRow, prepareImport, lineHasExplicitEnd, type SegmentRowDraft } from '../../../src/features/songs/components/segmentRows';
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

// ---------- v1.3 C1：備註欄與配對標籤 ----------
type MatchInfoMap = NonNullable<React.ComponentProps<typeof SegmentEditor>['matchInfo']>;

const mkRow = (title: string, artist = ''): SegmentRowDraft => ({ ...emptyRow('0:00'), end: '3:00', title, artist });

function NoteHarness({ initial, matchInfo, onRows }: { initial: SegmentRowDraft[]; matchInfo?: MatchInfoMap; onRows?: (rows: SegmentRowDraft[]) => void }) {
    const [rows, setRows] = useState<SegmentRowDraft[]>(initial);
    onRows?.(rows);
    return (
        <SegmentEditor
            rows={rows}
            onRowsChange={setRows}
            issues={computeRowIssues(rows, 1000)}
            player={null}
            duration={1000}
            matchInfo={matchInfo}
        />
    );
}

const noteBoxes = () => screen.getAllByRole('textbox').filter((el) => (el.getAttribute('aria-label') ?? '').includes('備註'));

describe('SegmentEditor 備註欄（C1）', () => {
    it('每列有一個備註輸入框，上限 30 字', () => {
        render(<NoteHarness initial={[mkRow('歌A'), mkRow('歌B')]} />);
        const boxes = noteBoxes();
        expect(boxes).toHaveLength(2);
        boxes.forEach((b) => expect(b).toHaveAttribute('maxlength', '30'));
    });

    it('輸入備註後，列資料的 note 變成新值，其他列不受影響', () => {
        let latest: SegmentRowDraft[] = [];
        render(<NoteHarness initial={[mkRow('歌A'), mkRow('歌B')]} onRows={(r) => { latest = r; }} />);
        fireEvent.change(noteBoxes()[1], { target: { value: '清唱' } });
        expect(latest.map((r) => r.note)).toEqual(['', '清唱']);
        expect(noteBoxes()[1]).toHaveValue('清唱');
    });

    it('備註超過 30 字時，該列顯示「備註最多 30 字」', () => {
        render(<NoteHarness initial={[mkRow('歌A')]} />);
        expect(screen.queryByText(/備註最多 30 字/)).toBeNull();
        fireEvent.change(noteBoxes()[0], { target: { value: '字'.repeat(31) } });
        expect(screen.getByText(/備註最多 30 字/)).toBeInTheDocument();
    });
});

describe('SegmentEditor 配對標籤 matchInfo（C1）', () => {
    const song = (title: string, artist: string | null, versions: number) => ({ id: 1, title, artist, versions });

    it('existing 顯示「已配對：歌名（N 個版本）」', () => {
        const rows = [mkRow('想你時風起', '原唱A')];
        const info: MatchInfoMap = new Map([[rows[0].key, { status: 'existing', song: song('想你時風起', '原唱A', 4) }]]);
        render(<NoteHarness initial={rows} matchInfo={info} />);
        expect(screen.getByText('已配對：想你時風起（4 個版本）')).toBeInTheDocument();
    });

    it('new 顯示「新歌曲」', () => {
        const rows = [mkRow('全新的歌')];
        const info: MatchInfoMap = new Map([[rows[0].key, { status: 'new' }]]);
        render(<NoteHarness initial={rows} matchInfo={info} />);
        expect(screen.getByText('新歌曲')).toBeInTheDocument();
    });

    it('similar 顯示同名歌的歌名／原唱與版本數；同名歌沒填原唱時顯示「未填原唱」', () => {
        const rows = [mkRow('同名歌', '原唱B'), mkRow('同名歌', '原唱C')];
        const info: MatchInfoMap = new Map([
            [rows[0].key, { status: 'similar', similar: [song('同名歌', '原唱A', 2)] }],
            [rows[1].key, { status: 'similar', similar: [song('同名歌', null, 3)] }],
        ]);
        render(<NoteHarness initial={rows} matchInfo={info} />);
        expect(screen.getByText('新歌曲・同名：同名歌／原唱A（2）')).toBeInTheDocument();
        expect(screen.getByText('新歌曲・同名：同名歌／未填原唱（3）')).toBeInTheDocument();
    });

    it('只在對應的列顯示：matchInfo 沒有的列不出現標籤', () => {
        const rows = [mkRow('歌A'), mkRow('歌B')];
        const info: MatchInfoMap = new Map([[rows[1].key, { status: 'new' }]]);
        render(<NoteHarness initial={rows} matchInfo={info} />);
        const bodyRows = within(table()).getAllByRole('row').slice(1);
        expect(within(bodyRows[0]).queryByText('新歌曲')).toBeNull();
        expect(within(bodyRows[1]).getByText('新歌曲')).toBeInTheDocument();
    });

    it('沒傳 matchInfo 時三種標籤都不出現', () => {
        render(<NoteHarness initial={[mkRow('歌A')]} />);
        expect(screen.queryByText(/已配對：/)).toBeNull();
        expect(screen.queryByText('新歌曲')).toBeNull();
        expect(screen.queryByText(/新歌曲・同名/)).toBeNull();
    });
});

// ---------- 時間欄按鈕：跳到／設為目前時間 ----------
type PlayerProp = React.ComponentProps<typeof SegmentEditor>['player'];

const mkTimed = (title: string, start: string, end: string, extra: Partial<SegmentRowDraft> = {}): SegmentRowDraft => ({
    ...emptyRow(start),
    end,
    title,
    ...extra,
});

function fakePlayer(currentTime = 0) {
    return { getCurrentTime: vi.fn(() => currentTime), seekTo: vi.fn() };
}

function TimeHarness({ initial, player }: { initial: SegmentRowDraft[]; player: PlayerProp }) {
    const [rows, setRows] = useState<SegmentRowDraft[]>(initial);
    return (
        <SegmentEditor
            rows={rows}
            onRowsChange={setRows}
            issues={computeRowIssues(rows, 1000)}
            player={player}
            duration={1000}
        />
    );
}

const btn = (name: string) => screen.getByRole('button', { name });

describe('SegmentEditor 時間欄按鈕', () => {
    it('有播放器時每列開始與結束各有跳到與設為目前時間按鈕', () => {
        const p = fakePlayer();
        render(<TimeHarness initial={[mkTimed('歌A', '0:00', '3:00'), mkTimed('歌B', '4:00', '7:00')]} player={p} />);
        for (const n of [1, 2]) {
            for (const name of [`跳到第 ${n} 首開始時間`, `第 ${n} 首開始設為目前時間`, `跳到第 ${n} 首結束時間`, `第 ${n} 首結束設為目前時間`]) {
                expect(btn(name)).toBeEnabled();
            }
        }
        expect(screen.queryByRole('button', { name: '從第 1 首開始播' })).toBeNull();
    });

    it('按跳到開始時間會從開始秒數播放', () => {
        const p = fakePlayer();
        render(<TimeHarness initial={[mkTimed('歌A', '1:15', '4:00')]} player={p} />);
        fireEvent.click(btn('跳到第 1 首開始時間'));
        expect(p.seekTo).toHaveBeenCalledTimes(1);
        expect(p.seekTo).toHaveBeenCalledWith(75);
    });

    it('按跳到結束時間會跳到結束秒數', () => {
        const p = fakePlayer();
        render(<TimeHarness initial={[mkTimed('歌A', '1:15', '4:30')]} player={p} />);
        fireEvent.click(btn('跳到第 1 首結束時間'));
        expect(p.seekTo).toHaveBeenCalledTimes(1);
        expect(p.seekTo).toHaveBeenCalledWith(270);
    });

    it('按設為目前時間會填入播放器目前時間', () => {
        const p = fakePlayer(125.7);
        render(<TimeHarness initial={[mkTimed('歌A', '0:10', '0:20')]} player={p} />);
        fireEvent.click(btn('第 1 首開始設為目前時間'));
        expect(screen.getByRole('textbox', { name: '第 1 首開始時間' })).toHaveValue('2:05');
        fireEvent.click(btn('第 1 首結束設為目前時間'));
        expect(screen.getByRole('textbox', { name: '第 1 首結束時間' })).toHaveValue('2:05');
    });

    it('結束設為目前時間後估計標記消失', () => {
        const p = fakePlayer(125.7);
        render(<TimeHarness initial={[mkTimed('歌A', '0:00', '6:00', { endEstimated: true })]} player={p} />);
        const row = () => within(table()).getAllByRole('row')[1];
        expect(within(row()).getByText('估計')).toBeInTheDocument();
        fireEvent.click(btn('第 1 首結束設為目前時間'));
        expect(within(row()).queryByText('估計')).toBeNull();
    });

    it('時間格式錯誤時該欄跳轉按鈕停用', () => {
        const p = fakePlayer();
        render(<TimeHarness initial={[mkTimed('歌A', '1:00', 'abc')]} player={p} />);
        expect(btn('跳到第 1 首結束時間')).toBeDisabled();
        expect(btn('跳到第 1 首開始時間')).toBeEnabled();
    });

    it('沒有播放器時四顆按鈕都停用並提示先載入播放器', () => {
        render(<TimeHarness initial={[mkTimed('歌A', '0:00', '3:00')]} player={null} />);
        for (const name of ['跳到第 1 首開始時間', '第 1 首開始設為目前時間', '跳到第 1 首結束時間', '第 1 首結束設為目前時間']) {
            expect(btn(name)).toBeDisabled();
        }
        expect(screen.getByText('貼上影片網址載入播放器後才能使用')).toBeInTheDocument();
    });

    it('有片段時標題列顯示按鈕說明，沒有片段時不顯示', () => {
        const p = fakePlayer();
        const { unmount } = render(<TimeHarness initial={[mkTimed('歌A', '0:00', '3:00')]} player={p} />);
        expect(screen.getByText('跳到這個時間')).toBeInTheDocument();
        expect(screen.getByText('設為播放器目前時間')).toBeInTheDocument();
        expect(screen.queryByText('貼上影片網址載入播放器後才能使用')).toBeNull();
        unmount();

        render(<TimeHarness initial={[]} player={p} />);
        expect(screen.queryByText('跳到這個時間')).toBeNull();
        expect(screen.queryByText('設為播放器目前時間')).toBeNull();
    });
});
