// 片段表格＋貼上時間軸匯入（後台歌回編輯器、社群投稿頁共用）。
//
// - 匯入預覽：每列可勾選排除；顯示「已略過 N 行其他版本（└├）」「第 N 行起是『時間軸』段落，之後未解析」「第 N 行未解析」。
// - 匯入時原文沒寫區間的列，結束時間改為估計（prepareImport → estimateEnds，影片長度取播放器），
//   表格顯示「估計」標記；使用者改過該列結束時間後標記消失。
// - 開始、結束欄各有「跳到這個時間」「設為目前時間」，透過 player（PreviewPlayer 的 API）；沒有播放器時按鈕停用，
//   標題列顯示兩個圖示的說明。跳到開始＝從這首開始播，所以不另設「從這裡播」。
// - 取代／刪除的確認（會讓分享連結失效）由呼叫端透過 onReplace／onRemoveRow 處理；沒給就直接套用。
// - 文字一律 i18n（songs:editor.*）：投稿頁是公開頁，後台也共用同一份。
// - 備註欄：上限 30 字，datalist 提供常用值（仍可自由輸入）；matchInfo（只有後台會給）在歌名下顯示配對結果。

import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocateFixed, Plus, Timer, Trash2, Upload } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Checkbox } from '../../../components/ui/checkbox';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { cn } from '../../../components/ui/utils';
import { formatTimecode, parseTimecode } from '../lib/timecode';
import { parseTimelineDetailed } from '../lib/timelineParser';
import {
    emptyRow, fromImported, prepareImport, type ImportedRow, type RowIssueCode, type SegmentRowDraft,
} from './segmentRows';
import type { PreviewApi } from './PreviewPlayer';

export type RowDiff = 'new' | 'changed';

/** 歌曲摘要（admin_match_songs／_song_brief 的格式） */
export interface SongBrief {
    id: number;
    title: string;
    artist: string | null;
    versions: number;
}

/** 一列的配對預覽：已配對既有歌曲／新歌曲／新歌曲但有同名（原唱不同）的歌 */
export type SegmentMatch =
    | { status: 'existing'; song: SongBrief }
    | { status: 'new' }
    | { status: 'similar'; similar: SongBrief[] };

/** 備註欄的建議值（資料值，存進資料庫後原樣公開顯示，不翻譯） */
const NOTE_PRESETS = ['練歌版', '清唱', '合唱', '重唱', '弾き語り', 'Short'];
const NOTE_MAX = 30;

export interface SegmentEditorProps {
    rows: SegmentRowDraft[];
    onRowsChange: (updater: (rows: SegmentRowDraft[]) => SegmentRowDraft[]) => void;
    /** computeRowIssues 的結果（index → 代碼），呼叫端也拿它判斷能不能存檔 */
    issues: ReadonlyMap<number, RowIssueCode[]>;
    player: PreviewApi | null;
    /** 影片長度（秒）；估計結束時間用 */
    duration: number | null;
    /** 「取代現有片段」：沒給就直接取代 */
    onReplace?: (imported: ImportedRow[]) => void;
    /** 刪除一列：沒給就直接刪 */
    onRemoveRow?: (key: string) => void;
    /** 任何一列被改動（後台用來清掉伺服器回的錯誤） */
    onEdit?: () => void;
    /** 顯示 code 欄（後台） */
    showCode?: boolean;
    /** 差異標記（後台審核修正型投稿） */
    diff?: ReadonlyMap<string, RowDiff>;
    /** 配對預覽（列 key → 結果，後台用）；沒有的列不顯示 */
    matchInfo?: ReadonlyMap<string, SegmentMatch>;
}

/** 行號清單 → 「第 1、3 行」；超過 10 筆加「等 N 行」 */
function lineList(lines: number[], t: (k: string, o?: Record<string, unknown>) => string): string {
    const shown = lines.slice(0, 10).map((l) => l + 1).join('、');
    return lines.length > 10 ? t('editor.import.linesMore', { lines: shown, count: lines.length }) : t('editor.import.lines', { lines: shown });
}

export function SegmentEditor({
    rows, onRowsChange, issues, player, duration, onReplace, onRemoveRow, onEdit, showCode = false, diff, matchInfo,
}: SegmentEditorProps) {
    const { t } = useTranslation('songs');
    const tf = t as unknown as (k: string, o?: Record<string, unknown>) => string;
    const [text, setText] = useState('');
    const [excluded, setExcluded] = useState<ReadonlySet<number>>(new Set());
    const notePresetsId = useId();

    const matchLabel = (m: SegmentMatch): string => {
        if (m.status === 'existing') return t('editor.match.existing', { title: m.song.title, versions: m.song.versions });
        if (m.status === 'new') return t('editor.match.new');
        const list = m.similar
            .map((x) => t('editor.match.similarItem', { title: x.title, artist: x.artist || t('editor.match.noArtist'), versions: x.versions }))
            .join('、');
        return t('editor.match.similar', { list });
    };

    const parsed = useMemo(
        () => (text.trim() ? parseTimelineDetailed(text) : { rows: [], unparsed: [], variants: [], stoppedAt: null }),
        [text],
    );
    const lines = useMemo(() => text.split(/\r\n|\r|\n/), [text]);
    // 估計只看「要匯入」的列：排除的列不該成為上一首的「下一首開始」
    const prepared = useMemo(
        () => prepareImport(parsed.rows.filter((_, i) => !excluded.has(i)), lines, duration),
        [parsed.rows, excluded, lines, duration],
    );
    const preparedByLine = useMemo(() => new Map(prepared.map((r) => [r.line, r])), [prepared]);

    const changeText = (v: string) => {
        setText(v);
        setExcluded(new Set());
    };
    const toggleExcluded = (i: number) =>
        setExcluded((cur) => {
            const next = new Set(cur);
            if (next.has(i)) next.delete(i);
            else next.add(i);
            return next;
        });

    const apply = (mode: 'replace' | 'append') => {
        if (prepared.length === 0) return;
        if (mode === 'append') onRowsChange((rs) => [...rs, ...prepared.map(fromImported)]);
        else if (onReplace) onReplace(prepared);
        else onRowsChange(() => prepared.map(fromImported));
        changeText('');
    };

    const updateRow = (key: string, patch: Partial<SegmentRowDraft>) => {
        onRowsChange((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch, ...('end' in patch ? { endEstimated: false } : {}) } : r)));
        onEdit?.();
    };
    const removeRow = (key: string) => {
        if (onRemoveRow) onRemoveRow(key);
        else onRowsChange((rs) => rs.filter((r) => r.key !== key));
        onEdit?.();
    };
    // 新列的開始預設接上一列的結束
    const addRow = () => onRowsChange((rs) => [...rs, emptyRow(rs[rs.length - 1]?.end ?? '')]);
    const currentTimecode = () => formatTimecode(Math.floor(player?.getCurrentTime() ?? 0));

    const hasPlayer = !!player;
    const estimatedCount = rows.filter((r) => r.endEstimated).length;

    const timeButtons = (r: SegmentRowDraft, field: 'start' | 'end', n: number) => {
        const sec = parseTimecode(r[field]);
        return (
            <>
                <Button type="button" variant="ghost" size="icon" className="size-8" disabled={!hasPlayer || sec === null} onClick={() => sec !== null && player?.seekTo(sec)} title={t('editor.jumpTo')} aria-label={t(field === 'start' ? 'editor.aria.startJump' : 'editor.aria.endJump', { n })}>
                    <LocateFixed className="size-3.5" aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-8" disabled={!hasPlayer} onClick={() => updateRow(r.key, { [field]: currentTimecode() })} title={t('editor.setNow')} aria-label={t(field === 'start' ? 'editor.aria.startNow' : 'editor.aria.endNow', { n })}>
                    <Timer className="size-3.5" aria-hidden="true" />
                </Button>
            </>
        );
    };

    return (
        <div className="space-y-4">
            {/* 貼上時間軸 */}
            <details className="rounded-lg border border-border bg-card p-3" open={rows.length === 0 ? true : undefined}>
                <summary className="cursor-pointer text-sm font-medium">{t('editor.import.title')}</summary>
                <div className="mt-3 space-y-2">
                    <Textarea
                        value={text}
                        onChange={(e) => changeText(e.target.value)}
                        rows={6}
                        placeholder={t('editor.import.placeholder')}
                        aria-label={t('editor.import.label')}
                    />
                    {parsed.variants.length > 0 && (
                        <p className="text-[12px] text-muted-foreground">{t('editor.import.variants', { count: parsed.variants.length })}</p>
                    )}
                    {parsed.stoppedAt !== null && (
                        <p className="text-[12px] text-muted-foreground">{t('editor.import.stopped', { line: parsed.stoppedAt + 1 })}</p>
                    )}
                    {parsed.unparsed.length > 0 && (
                        <p role="alert" className="text-[12px] text-amber-600 dark:text-amber-400">
                            {t('editor.import.unparsed', { lines: lineList(parsed.unparsed, tf) })}
                        </p>
                    )}
                    {text.trim() && (
                        parsed.rows.length === 0 ? (
                            <p className="text-[12px] text-muted-foreground">{t('editor.import.none')}</p>
                        ) : (
                            <>
                                <p className="text-[12px] text-muted-foreground">
                                    {t('editor.import.summary', { count: parsed.rows.length, selected: prepared.length })}
                                </p>
                                <ScrollArea className="rounded border border-border [&>[data-radix-scroll-area-viewport]]:max-h-64 [&>div>div]:!block">
                                    <ol className="text-[12.5px]">
                                        {parsed.rows.map((r, i) => {
                                            const on = !excluded.has(i);
                                            const prep = preparedByLine.get(r.line);
                                            const checkboxId = `seg-import-${i}`;
                                            return (
                                                <li key={r.line} className={cn('flex items-center gap-2 border-t border-border/60 px-2 py-1 first:border-t-0', !on && 'opacity-50')}>
                                                    <Checkbox
                                                        id={checkboxId}
                                                        checked={on}
                                                        onCheckedChange={() => toggleExcluded(i)}
                                                        aria-label={t('editor.import.include', { title: r.title || t('editor.import.untitled') })}
                                                    />
                                                    <label htmlFor={checkboxId} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                                                        <span className="w-32 shrink-0 tabular-nums text-muted-foreground">
                                                            {formatTimecode(r.start)} – {prep ? formatTimecode(prep.end) : '—'}
                                                            {prep?.endEstimated && <span className="ml-1 text-amber-600 dark:text-amber-400">{t('editor.estimated')}</span>}
                                                        </span>
                                                        <span className={cn('min-w-0 flex-1 truncate', !on && 'line-through')}>
                                                            {r.title || t('editor.import.untitled')}{r.artist ? ` / ${r.artist}` : ''}
                                                        </span>
                                                    </label>
                                                </li>
                                            );
                                        })}
                                    </ol>
                                </ScrollArea>
                                <div className="flex flex-wrap gap-2">
                                    <Button type="button" size="sm" onClick={() => apply('replace')} disabled={prepared.length === 0}>
                                        <Upload className="size-3.5" aria-hidden="true" />{t('editor.import.replace')}
                                    </Button>
                                    <Button type="button" size="sm" variant="outline" onClick={() => apply('append')} disabled={prepared.length === 0}>
                                        <Plus className="size-3.5" aria-hidden="true" />{t('editor.import.append')}
                                    </Button>
                                </div>
                            </>
                        )
                    )}
                </div>
            </details>

            {/* 片段表格 */}
            <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{t('editor.segments', { count: rows.length })}</h3>
                    {issues.size > 0 && <span className="text-[12px] text-destructive">{t('editor.issueCount', { count: issues.size })}</span>}
                    {estimatedCount > 0 && <span className="text-[12px] text-amber-600 dark:text-amber-400">{t('editor.estimatedCount', { count: estimatedCount })}</span>}
                    {rows.length > 0 && (
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><LocateFixed className="size-3.5" aria-hidden="true" />{t('editor.jumpTo')}</span>
                            <span className="inline-flex items-center gap-1"><Timer className="size-3.5" aria-hidden="true" />{t('editor.legend.setNow')}</span>
                            {!hasPlayer && <span>{t('editor.legend.needPlayer')}</span>}
                        </span>
                    )}
                    <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={addRow}>
                        <Plus className="size-3.5" aria-hidden="true" />{t('editor.addRow')}
                    </Button>
                </div>
                {rows.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">{t('editor.empty')}</p>
                ) : (
                    <div className="overflow-x-auto rounded-lg border border-border">
                        <table className={cn('w-full text-sm', showCode ? 'min-w-[1000px]' : 'min-w-[900px]')}>
                            <thead className="bg-muted/40 text-[12px] text-muted-foreground">
                                <tr>
                                    <th className="w-10 px-2 py-1.5 text-left font-medium">#</th>
                                    <th className="w-44 px-2 py-1.5 text-left font-medium">{t('editor.col.start')}</th>
                                    <th className="w-56 px-2 py-1.5 text-left font-medium">{t('editor.col.end')}</th>
                                    <th className="px-2 py-1.5 text-left font-medium">{t('editor.col.title')}</th>
                                    <th className="px-2 py-1.5 text-left font-medium">{t('editor.col.artist')}</th>
                                    <th className="w-32 px-2 py-1.5 text-left font-medium">{t('editor.col.note')}</th>
                                    {showCode && <th className="w-24 px-2 py-1.5 text-left font-medium">code</th>}
                                    <th className="w-12 px-2 py-1.5"><span className="sr-only left-0 top-0">{t('editor.col.actions')}</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r, i) => {
                                    const rowIssues = issues.get(i);
                                    const n = i + 1;
                                    const mark = diff?.get(r.key);
                                    const match = matchInfo?.get(r.key);
                                    return (
                                        <tr key={r.key} className={cn('border-t border-border align-top', rowIssues && 'bg-destructive/5')}>
                                            <td className="px-2 py-1.5 text-[12px] tabular-nums text-muted-foreground">
                                                {n}
                                                {mark && (
                                                    <span className={cn('mt-0.5 block text-[10.5px] font-semibold', mark === 'new' ? 'text-emerald-600 dark:text-emerald-400' : 'text-sky-600 dark:text-sky-400')}>
                                                        {t(`editor.diff.${mark}`)}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5">
                                                <div className="flex items-center gap-1">
                                                    <Input value={r.start} onChange={(e) => updateRow(r.key, { start: e.target.value })} className="h-8 w-20 tabular-nums" aria-label={t('editor.aria.start', { n })} />
                                                    {timeButtons(r, 'start', n)}
                                                </div>
                                            </td>
                                            <td className="px-2 py-1.5">
                                                <div className="flex items-center gap-1">
                                                    <Input value={r.end} onChange={(e) => updateRow(r.key, { end: e.target.value })} className="h-8 w-20 tabular-nums" aria-label={t('editor.aria.end', { n })} />
                                                    {timeButtons(r, 'end', n)}
                                                    {r.endEstimated && (
                                                        <span className="shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-1 text-[10.5px] font-semibold text-amber-700 dark:text-amber-300" title={t('editor.estimatedHint')}>
                                                            {t('editor.estimated')}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-2 py-1.5">
                                                <Input value={r.title} onChange={(e) => updateRow(r.key, { title: e.target.value })} maxLength={200} className="h-8" aria-label={t('editor.aria.title', { n })} />
                                                {rowIssues && <p className="mt-1 text-[11.5px] text-destructive">{rowIssues.map((c) => t(`editor.issue.${c}`)).join('、')}</p>}
                                                {match && (
                                                    <p className={cn('mt-1 text-[11.5px]', match.status === 'existing' ? 'text-emerald-600 dark:text-emerald-400' : match.status === 'similar' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                                                        {matchLabel(match)}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5">
                                                <Input value={r.artist} onChange={(e) => updateRow(r.key, { artist: e.target.value })} maxLength={200} className="h-8" aria-label={t('editor.aria.artist', { n })} />
                                            </td>
                                            <td className="px-2 py-1.5">
                                                <Input
                                                    value={r.note}
                                                    onChange={(e) => updateRow(r.key, { note: e.target.value })}
                                                    maxLength={NOTE_MAX}
                                                    list={notePresetsId}
                                                    // 帶 list 的 input 隱含角色是 combobox；建議值只是輔助、仍是自由輸入，維持 textbox 語意
                                                    role="textbox"
                                                    placeholder={t('editor.notePlaceholder')}
                                                    className="h-8"
                                                    aria-label={t('editor.aria.note', { n })}
                                                />
                                            </td>
                                            {showCode && <td className="px-2 py-1.5 font-mono text-[11.5px] text-muted-foreground">{r.code ?? t('editor.newCode')}</td>}
                                            <td className="px-2 py-1.5">
                                                <div className="flex justify-end gap-0.5">
                                                    <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => removeRow(r.key)} title={t('editor.removeRow')} aria-label={t('editor.aria.remove', { n })}>
                                                        <Trash2 className="size-3.5" aria-hidden="true" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <datalist id={notePresetsId}>
                            {NOTE_PRESETS.map((v) => <option key={v} value={v} />)}
                        </datalist>
                    </div>
                )}
            </div>
        </div>
    );
}
