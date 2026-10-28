// 共用片段編輯器：匯入預覽可勾選排除、沒寫結束的列標「估計」、改過結束時間後標記消失
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type React from 'react';
import { useState } from 'react';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
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
        expect(rows.map((r) => [r.end, r.endEstimated])).toEqual([[270, true], [720, true], [840, false]]);
    });

    it('全形與數學粗體數字的區間也認得', () => {
        expect(lineHasExplicitEnd('𝟏𝟏. １２：００－１４：００ 歌')).toBe(true);
        expect(lineHasExplicitEnd('11. 12:00 歌 - 原唱')).toBe(false);
    });
});

const parse = (text: string) => parseTimelineDetailed(text).rows;

describe('prepareImport 結束估計新規格', () => {
    it('E1 多首且影片很長時，沒寫結束的列以開始後 4 分 30 秒封頂', () => {
        const text = '0:00 歌A\n10:00 歌B';
        const rows = prepareImport(parse(text), text.split('\n'), 1000);
        expect(rows[0]).toMatchObject({ end: 270, endEstimated: true });
    });

    it('E2 短影片只有一首時結束用影片長度而不是 4:30', () => {
        const text = '0:00 歌A';
        const rows = prepareImport(parse(text), text.split('\n'), 400);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ end: 400, endEstimated: true });
    });

    it('E3 長影片單列仍套 4:30 上限', () => {
        const text = '1:00 歌A';
        const rows = prepareImport(parse(text), text.split('\n'), 7200);
        expect(rows[0]).toMatchObject({ end: 60 + 270, endEstimated: true });
    });

    it('E3 短影片但有兩首時仍套 4:30，第二首收在影片長度', () => {
        const text = '0:00 歌A\n2:00 歌B';
        const rows = prepareImport(parse(text), text.split('\n'), 300);
        expect(rows.map((r) => r.end)).toEqual([120, 300]);
    });

    it('E3 影片剛好 600 秒的單列結束用影片長度；601 秒則套 4:30', () => {
        const text = '0:00 歌A';
        expect(prepareImport(parse(text), text.split('\n'), 600)[0].end).toBe(600);
        expect(prepareImport(parse(text), text.split('\n'), 601)[0].end).toBe(270);
    });

    it('E2 單列且已寫明結束時，保留原文結束不被影片長度蓋過', () => {
        const text = '0:00-2:00 歌A';
        const rows = prepareImport(parse(text), text.split('\n'), 310);
        expect(rows[0]).toMatchObject({ end: 120, endEstimated: false });
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
        // 歌B 被排除：歌A 的結束取「開始＋4 分 30 秒」而不是歌B 的開始
        expect(screen.getByRole('textbox', { name: '第 1 首結束時間' })).toHaveValue('4:30');
    });

    it('估計的結束時間顯示標記，改過結束時間後標記消失', () => {
        render(<Harness />);
        fireEvent.change(screen.getByRole('textbox', { name: '時間軸文字' }), { target: { value: TEXT } });
        fireEvent.click(screen.getByRole('button', { name: /取代現有片段/ }));

        const rows = within(table()).getAllByRole('row').slice(1);
        expect(within(rows[0]).getByText('估計')).toBeInTheDocument();
        expect(within(rows[1]).getByText('估計')).toBeInTheDocument();
        expect(within(rows[2]).queryByText('估計')).toBeNull();

        fireEvent.change(screen.getByRole('textbox', { name: '第 1 首結束時間' }), { target: { value: '4:00' } });
        expect(within(within(table()).getAllByRole('row')[1]).queryByText('估計')).toBeNull();
        expect(within(within(table()).getAllByRole('row')[2]).getByText('估計')).toBeInTheDocument();
    });

    it('E2 兩行時間軸取消勾選一行後只剩一列，短影片結束用影片長度 6:40', () => {
        render(<Harness duration={400} />);
        fireEvent.change(screen.getByRole('textbox', { name: '時間軸文字' }), { target: { value: '1. 0:00 歌A / 原唱A\n2. 2:00 歌B / 原唱B' } });
        fireEvent.click(screen.getByRole('checkbox', { name: '匯入「歌B」' }));
        fireEvent.click(screen.getByRole('button', { name: /取代現有片段/ }));
        expect(screen.queryByRole('textbox', { name: '第 2 首歌名' })).toBeNull();
        expect(screen.getByRole('textbox', { name: '第 1 首結束時間' })).toHaveValue('6:40');
    });

    it('E4 空白表格新增一列，短影片（240 秒）自動帶整支 0:00～4:00', () => {
        render(<Harness duration={240} />);
        fireEvent.click(screen.getByRole('button', { name: '新增一列' }));
        expect(screen.getByRole('textbox', { name: '第 1 首開始時間' })).toHaveValue('0:00');
        expect(screen.getByRole('textbox', { name: '第 1 首結束時間' })).toHaveValue('4:00');
    });

    it('E4 空白表格新增一列，長影片（1000 秒）結束維持空白', () => {
        render(<Harness duration={1000} />);
        fireEvent.click(screen.getByRole('button', { name: '新增一列' }));
        expect(screen.getByRole('textbox', { name: '第 1 首結束時間' })).toHaveValue('');
    });

    it('E4 已有一列時再新增，短影片也不自動帶整支（開始接上一列結束、結束空白）', () => {
        render(<Harness duration={240} />);
        fireEvent.click(screen.getByRole('button', { name: '新增一列' }));
        fireEvent.click(screen.getByRole('button', { name: '新增一列' }));
        expect(screen.getByRole('textbox', { name: '第 2 首開始時間' })).toHaveValue('4:00');
        expect(screen.getByRole('textbox', { name: '第 2 首結束時間' })).toHaveValue('');
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

    it('沒有播放器時四顆按鈕都停用並提示播放器載入後才能使用', () => {
        render(<TimeHarness initial={[mkTimed('歌A', '0:00', '3:00')]} player={null} />);
        for (const name of ['跳到第 1 首開始時間', '第 1 首開始設為目前時間', '跳到第 1 首結束時間', '第 1 首結束設為目前時間']) {
            expect(btn(name)).toBeDisabled();
        }
        expect(screen.getByText('播放器載入後才能使用')).toBeInTheDocument();
    });

    it('有片段時標題列顯示按鈕說明，沒有片段時不顯示', () => {
        const p = fakePlayer();
        const { unmount } = render(<TimeHarness initial={[mkTimed('歌A', '0:00', '3:00')]} player={p} />);
        expect(screen.getByText('跳到這個時間')).toBeInTheDocument();
        expect(screen.getByText('設為播放器目前時間')).toBeInTheDocument();
        expect(screen.queryByText('播放器載入後才能使用')).toBeNull();
        unmount();

        render(<TimeHarness initial={[]} player={p} />);
        expect(screen.queryByText('跳到這個時間')).toBeNull();
        expect(screen.queryByText('設為播放器目前時間')).toBeNull();
    });
});

// ---------- 匯入預覽依歌曲長度估計結束（C9～C10b） ----------
describe('SegmentEditor 依歌曲長度估計結束', () => {
    const LEN_TEXT = ['0:10 歌A / 手A', '20:00 歌B / 手B'].join('\n');
    const LABEL = '估計（依歌曲長度）';

    type LenCall = { url: string; method: string; body: any };
    let lenCalls: LenCall[] = [];

    function stubLengths(handler: () => Promise<Response>) {
        lenCalls = [];
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            lenCalls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
            return handler();
        }));
    }
    const okLengths = () => new Response(JSON.stringify({
        ok: true,
        items: [{ seconds: 200, source: 'itunes' }, { seconds: null, source: 'miss' }],
    }));

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const typeTimeline = () =>
        fireEvent.change(screen.getByRole('textbox', { name: '時間軸文字' }), { target: { value: LEN_TEXT } });
    const previewItem = (title: string) => screen.getByRole('checkbox', { name: `匯入「${title}」` }).closest('li') as HTMLElement;

    it('C9 匯入預覽套用歌曲長度並標示來源', async () => {
        stubLengths(async () => okLengths());
        render(<Harness duration={3600} />);
        typeTimeline();

        await waitFor(() => expect(lenCalls).toHaveLength(1), { timeout: 3000 });
        expect(lenCalls[0].url).toContain('/api/songs/lengths');
        expect(lenCalls[0].method).toBe('POST');
        expect(lenCalls[0].body).toEqual({ items: [{ title: '歌A', artist: '手A' }, { title: '歌B', artist: '手B' }] });

        // 10 + 200 + 10 = 220 秒 → 3:40
        await waitFor(() => expect(within(previewItem('歌A')).getByText(LABEL)).toBeInTheDocument(), { timeout: 3000 });
        expect(previewItem('歌A').textContent).toContain('3:40');
        expect(within(previewItem('歌B')).getByText('估計')).toBeInTheDocument();
        expect(within(previewItem('歌B')).queryByText(LABEL)).toBeNull();
        expect(screen.getByText('結束時間依歌曲長度估計；主播唱短版或只唱一段時請自行調整')).toBeInTheDocument();
    });

    it('C9b 查詢中顯示提示', async () => {
        stubLengths(() => new Promise<Response>(() => {}));
        render(<Harness duration={3600} />);
        typeTimeline();
        expect(await screen.findByText('正在查歌曲長度…', {}, { timeout: 3000 })).toBeInTheDocument();
    });

    it('C10 查詢失敗時照舊估計且可套用，不顯示錯誤', async () => {
        stubLengths(async () => { throw new Error('network down'); });
        render(<Harness duration={3600} />);
        typeTimeline();

        await waitFor(() => expect(lenCalls.length).toBeGreaterThan(0), { timeout: 3000 });
        // 失敗後提示消失，預覽維持 10 + 270 = 4:40
        await waitFor(() => expect(screen.queryByText('正在查歌曲長度…')).toBeNull(), { timeout: 3000 });
        expect(previewItem('歌A').textContent).toContain('4:40');
        expect(within(previewItem('歌A')).getByText('估計')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.queryByText(/失敗|錯誤/)).toBeNull();

        const replace = screen.getByRole('button', { name: /取代現有片段/ });
        expect(replace).toBeEnabled();
        fireEvent.click(replace);
        expect(screen.getByRole('textbox', { name: '第 1 首結束時間' })).toHaveValue('4:40');
    });

    it('C10b 套用後表格保留「依歌曲長度」標記', async () => {
        stubLengths(async () => okLengths());
        render(<Harness duration={3600} />);
        typeTimeline();
        await waitFor(() => expect(within(previewItem('歌A')).getByText(LABEL)).toBeInTheDocument(), { timeout: 3000 });

        fireEvent.click(screen.getByRole('button', { name: /附加到最後/ }));

        expect(screen.getByRole('textbox', { name: '第 1 首結束時間' })).toHaveValue('3:40');
        const rows = within(table()).getAllByRole('row').slice(1);
        expect(within(rows[0]).getByText(LABEL)).toBeInTheDocument();
        expect(within(rows[1]).getByText('估計')).toBeInTheDocument();
    });
});

describe('SegmentEditor 只查沒寫結束的列', () => {
    type LenCall = { body: { items: { title: string; artist: string | null }[] } };
    let lenCalls: LenCall[] = [];

    beforeEach(() => {
        lenCalls = [];
        vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body));
            lenCalls.push({ body });
            return new Response(JSON.stringify({ ok: true, items: body.items.map(() => ({ seconds: null, source: 'miss' })) }));
        }));
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const typeTimeline = (v: string) => fireEvent.change(screen.getByRole('textbox', { name: '時間軸文字' }), { target: { value: v } });
    const settle = (ms = 1000) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

    it('Q1 貼兩首、一首寫了區間：請求只有沒寫區間的那一首', async () => {
        render(<Harness duration={3600} />);
        typeTimeline('0:10-3:00 歌A / 手A\n20:00 歌B / 手B');
        await waitFor(() => expect(lenCalls).toHaveLength(1), { timeout: 3000 });
        // 寫了區間的列不會用到長度，查它只是白白消耗 iTunes 額度
        expect(lenCalls[0].body.items).toEqual([{ title: '歌B', artist: '手B' }]);
    });

    it('Q2 全部都寫區間時不發請求', async () => {
        render(<Harness duration={3600} />);
        typeTimeline('0:10-3:00 歌A / 手A\n20:00-24:00 歌B / 手B');
        await settle(1200);
        expect(lenCalls).toHaveLength(0);
    });

    it('Q3 被勾掉排除的列不送', async () => {
        render(<Harness duration={3600} />);
        typeTimeline('0:10 歌A / 手A\n20:00 歌B / 手B');
        fireEvent.click(screen.getByRole('checkbox', { name: '匯入「歌B」' }));
        await waitFor(() => expect(lenCalls).toHaveLength(1), { timeout: 3000 });
        expect(lenCalls[0].body.items).toEqual([{ title: '歌A', artist: '手A' }]);
    });

    it('Q4 單曲影片（短影片只有一首）不送', async () => {
        render(<Harness duration={400} />);
        typeTimeline('0:00 歌A / 手A');
        await settle(1200);
        expect(lenCalls).toHaveLength(0);
    });

    it('Q4b 短影片但有兩首仍會送', async () => {
        render(<Harness duration={400} />);
        typeTimeline('0:00 歌A / 手A\n2:00 歌B / 手B');
        await waitFor(() => expect(lenCalls).toHaveLength(1), { timeout: 3000 });
        expect(lenCalls[0].body.items.map((x) => x.title)).toEqual(['歌A', '歌B']);
    });
});
