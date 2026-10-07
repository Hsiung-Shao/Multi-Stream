// 後台「投稿審核」的週表投稿卡片（vtuber_contributions.action='schedule'）：
//   - 使用者投稿（source='user'）：手動填的表格
//   - 自動解析（source='vision'）：低信心的社群貼文週表圖，附原圖與貼文連結讓人工對照
// 表格可編輯（日期、時間、標題、平台、刪列／加列），核准時送出目前表格內容（approve_schedule_contribution 單一交易）。
// 時間一律是台北時間。後台頁只有站方使用，文案沿用本分頁的中文寫法（同 ContributionsTab）。

import { useState } from 'react';
import { Check, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { RouteLink } from '../../../components/Navigation/RouteLink';
import { schedulePersonPage } from '../../../config/schedulePerson';
import {
    formatSubmissionError,
    useApproveScheduleContribution,
    useRejectContribution,
    type ContributionRecord,
    type ScheduleEntry,
} from '../hooks/useAdminSubmissions';

const STATUS_LABEL: Record<string, string> = { pending: '待審', approved: '已核准', rejected: '已駁回' };
const MAX_ROWS = 14; // 與 approve_schedule_contribution 的上限一致
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const HTTPS = /^https:\/\//;

type Row = ScheduleEntry & { key: number };

let rowKey = 0;
const withKey = (e: ScheduleEntry): Row => ({ ...e, key: ++rowKey });

const rowValid = (r: Row) => DATE_RE.test(r.date) && TIME_RE.test(r.time) && !!r.title.trim() && r.title.trim().length <= 80;

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-[13px] text-sky-600 hover:underline dark:text-sky-400">
            {children}
        </a>
    );
}

function sourceLabel(c: ContributionRecord): string {
    const p = c.payload;
    if (p.source !== 'vision') return '使用者投稿';
    return typeof p.confidence === 'number' ? `自動解析（信心 ${Math.round(p.confidence * 100)}%）` : '自動解析';
}

export function ScheduleContributionCard({ c }: { c: ContributionRecord }) {
    const p = c.payload;
    const pending = c.status === 'pending';
    const [rows, setRows] = useState<Row[]>(() => (p.entries ?? []).map(withKey));
    const [notes, setNotes] = useState('');
    const [zoom, setZoom] = useState(false);
    const approve = useApproveScheduleContribution();
    const reject = useRejectContribution();
    const [result, setResult] = useState<{ slug: string; written: number; canceled: number } | null>(null);
    const busy = approve.isPending || reject.isPending;
    const error = approve.error ?? reject.error;
    const allValid = rows.length > 0 && rows.length <= MAX_ROWS && rows.every(rowValid);

    const setRow = (key: number, patch: Partial<ScheduleEntry>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    const addRow = () => setRows((prev) => [...prev, withKey({ date: prev.at(-1)?.date ?? '', time: '', title: '', platform: 'youtube' })]);
    const entries = (): ScheduleEntry[] => rows.map(({ date, time, title, platform }) => ({ date, time, title: title.trim(), platform }));

    const name = p.vtuber_name || p.vtuber_slug || c.target_vtuber_id || '（未知 VTuber）';
    const imageUrl = p.image_url && HTTPS.test(p.image_url) ? p.image_url : null;
    const postUrl = p.post_url && HTTPS.test(p.post_url) ? p.post_url : null;

    return (
        <article className="rounded-xl border border-border bg-card p-4">
            <header className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[12px] font-medium text-sky-700 dark:text-sky-300">週表</span>
                        {p.vtuber_slug ? (
                            <RouteLink to={schedulePersonPage(p.vtuber_slug)} className="truncate hover:underline">{name}</RouteLink>
                        ) : (
                            <span className="truncate">{name}</span>
                        )}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleString('zh-TW')} · {STATUS_LABEL[c.status] ?? c.status} · {sourceLabel(c)} · {c.submitted_by}
                    </p>
                    {postUrl && <Ext href={postUrl}>社群貼文</Ext>}
                </div>
                {imageUrl && (
                    <button
                        type="button"
                        onClick={() => setZoom(true)}
                        className="overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="放大週表圖"
                    >
                        <img src={imageUrl} alt="週表圖" referrerPolicy="no-referrer" loading="lazy" className="h-28 w-auto max-w-[200px] object-contain" />
                    </button>
                )}
            </header>

            {imageUrl && (
                <Dialog open={zoom} onOpenChange={setZoom}>
                    <DialogContent className="sm:max-w-4xl">
                        <DialogHeader>
                            <DialogTitle>{name} 的週表圖</DialogTitle>
                            <DialogDescription>時間以台北時間對照下方表格</DialogDescription>
                        </DialogHeader>
                        <img src={imageUrl} alt="週表圖" referrerPolicy="no-referrer" className="max-h-[75vh] w-full object-contain" />
                    </DialogContent>
                </Dialog>
            )}

            <div className="mt-3">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-40">日期</TableHead>
                            <TableHead className="w-28">時間（台北）</TableHead>
                            <TableHead>標題</TableHead>
                            <TableHead className="w-32">平台</TableHead>
                            {pending && <TableHead className="w-10"><span className="sr-only">刪除</span></TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((r) => (
                            <TableRow key={r.key} className={rowValid(r) ? undefined : 'bg-destructive/5'}>
                                <TableCell>
                                    <Input type="date" value={r.date} onChange={(e) => setRow(r.key, { date: e.target.value })} disabled={!pending} className="h-8" aria-label="日期" />
                                </TableCell>
                                <TableCell>
                                    <Input type="time" value={r.time} onChange={(e) => setRow(r.key, { time: e.target.value })} disabled={!pending} className="h-8" aria-label="時間" />
                                </TableCell>
                                <TableCell>
                                    <Input value={r.title} maxLength={80} onChange={(e) => setRow(r.key, { title: e.target.value })} disabled={!pending} className="h-8" aria-label="標題" />
                                </TableCell>
                                <TableCell>
                                    <Select value={r.platform} onValueChange={(v: string) => setRow(r.key, { platform: v === 'twitch' ? 'twitch' : 'youtube' })} disabled={!pending}>
                                        <SelectTrigger className="h-8" aria-label="平台">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="youtube">YouTube</SelectItem>
                                            <SelectItem value="twitch">Twitch</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                                {pending && (
                                    <TableCell>
                                        <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="刪除這一列" onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}>
                                            <Trash2 className="size-3.5" aria-hidden="true" />
                                        </Button>
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                {pending && rows.length < MAX_ROWS && (
                    <Button type="button" variant="outline" size="sm" className="mt-2 gap-1" onClick={addRow}>
                        <Plus className="size-3.5" aria-hidden="true" />新增一列
                    </Button>
                )}
                <p className="mt-1 text-[12px] text-muted-foreground">已過去超過 3 小時的場次核准時不會寫入；同來源、日期重疊的舊場次會被取代。</p>
            </div>

            {(c.source_note || c.submitter_contact) && (
                <div className="mt-3 space-y-1 rounded-lg bg-muted/40 px-3 py-2 text-[13px]">
                    {c.source_note && <p className="whitespace-pre-line text-muted-foreground">補充：{c.source_note}</p>}
                    {c.submitter_contact && <p className="text-muted-foreground">聯絡：{c.submitter_contact}</p>}
                </div>
            )}

            {pending ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="審核備註（選填）" maxLength={500} className="h-8 max-w-xs" />
                    <Button
                        size="sm"
                        disabled={busy || !allValid}
                        onClick={() => approve.mutate({ id: c.id, entries: entries(), notes }, { onSuccess: (r) => setResult(r.result) })}
                        className="gap-1"
                    >
                        {approve.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}核准
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => reject.mutate({ id: c.id, notes })} className="gap-1">
                        <X className="size-3.5" />駁回
                    </Button>
                    {!allValid && rows.length > 0 && <p className="w-full text-[12px] text-amber-600">有列的日期、時間或標題未填（標題最多 80 字）</p>}
                    {error && <p role="alert" className="w-full text-[13px] text-destructive">{formatSubmissionError(error)}</p>}
                </div>
            ) : (
                <p className="mt-3 text-[12px] text-muted-foreground">
                    {c.reviewed_at && `審核於 ${new Date(c.reviewed_at).toLocaleString('zh-TW')}`}
                    {c.reviewer_notes && ` · ${c.reviewer_notes}`}
                </p>
            )}
            {result && (
                <p className="mt-2 text-[13px] text-emerald-600">
                    已核准：寫入 {result.written} 場、取代 {result.canceled} 場舊場次。個人頁：
                    <RouteLink to={schedulePersonPage(result.slug)} className="underline">/schedule/{result.slug}</RouteLink>
                </p>
            )}
        </article>
    );
}
