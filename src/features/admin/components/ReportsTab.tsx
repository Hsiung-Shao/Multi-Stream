// 後台「資料回報」：使用者回報的 VTuber 資料、單場直播、公司名冊錯誤（vtuber_reports）。
// 依狀態／類型篩選；每筆附對象的快速連結（個人頁、直播、名冊），改狀態並留備註。
// 「補充資料」（add_info）的回報可逐欄核對「目前值 → 建議值」、修改後一鍵套用（apply_vtuber_report_info）。

import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { RouteLink } from '../../../components/Navigation/RouteLink';
import { schedulePersonPage } from '../../../config/schedulePerson';
import {
    formatSubmissionError,
    isUnauthorized,
    useApplyReport,
    useReports,
    useUpdateReport,
    type ApplyField,
    type ReportRecord,
} from '../hooks/useAdminSubmissions';
import { AdminTokenInline, useAdminTokenPresent } from './AdminTokenInline';

const STATUS: Record<ReportRecord['status'] | 'all', string> = { open: '未處理', resolved: '已修正', wontfix: '不處理', duplicate: '重複', spam: '垃圾', all: '全部' };
const KIND: Record<ReportRecord['kind'] | 'all', string> = { all: '全部類型', vtuber_info: 'VTuber 資料', stream: '單場直播', roster: '公司名冊', missing_vtuber: '找不到' };
const REASON: Record<string, string> = {
    name: '名字', group: '所屬團體', nationality: '地區', graduated: '已畢業', channel_link: '頻道連結', not_vtuber: '不是 VTuber',
    wrong_time: '時間不對', cancelled: '已取消', duplicate: '重複', missing_member: '漏成員', wrong_member: '多的人', add_info: '補充資料', other: '其他',
};

const APPLY_FIELDS: { key: ApplyField; label: string; current: keyof NonNullable<ReportRecord['vtuber']>; fillOnly?: boolean }[] = [
    { key: 'x', label: 'X', current: 'x_url' },
    { key: 'facebook', label: 'Facebook', current: 'facebook_url' },
    { key: 'instagram', label: 'Instagram', current: 'instagram_url' },
    { key: 'youtube', label: 'YouTube', current: 'youtube_channel_id', fillOnly: true },
    { key: 'twitch', label: 'Twitch', current: 'twitch_channel_id', fillOnly: true },
    { key: 'bio', label: '簡介', current: 'bio' },
];

/** 補充資料：逐欄「目前值 → 建議值（可改）」，勾選的欄位一起套用並把回報標為已修正 */
function SuggestedPanel({ r, notes }: { r: ReportRecord; notes: string }) {
    const suggested = r.suggested ?? {};
    const rows = APPLY_FIELDS.filter((f) => suggested[f.key]);
    const currentOf = (f: (typeof APPLY_FIELDS)[number]) => (r.vtuber?.[f.current] as string | null | undefined) ?? null;
    // YouTube／Twitch 只補缺：已有值的預設不勾（後端也會擋）
    const [values, setValues] = useState(() => Object.fromEntries(rows.map((f) => [f.key, suggested[f.key] ?? ''])) as Record<ApplyField, string>);
    const [checked, setChecked] = useState(() => Object.fromEntries(rows.map((f) => [f.key, !(f.fillOnly && currentOf(f))])) as Record<ApplyField, boolean>);
    const apply = useApplyReport();
    if (!rows.length) return null;
    const picked = rows.filter((f) => checked[f.key]);
    const open = r.status === 'open';

    return (
        <section className="mt-3 rounded-lg border border-border p-3">
            <h3 className="text-[13px] font-medium">補充資料</h3>
            <div className="mt-2 space-y-2">
                {rows.map((f) => {
                    const cur = currentOf(f);
                    return (
                        <div key={f.key} className="grid items-center gap-2 text-[13px] sm:grid-cols-[auto_5rem_minmax(0,1fr)_minmax(0,1.4fr)]">
                            <Checkbox
                                aria-label={`套用 ${f.label}`}
                                checked={checked[f.key]}
                                disabled={!open}
                                onCheckedChange={(c: boolean | 'indeterminate') => setChecked((s) => ({ ...s, [f.key]: c === true }))}
                            />
                            <span className="font-medium">{f.label}</span>
                            <span className="truncate text-muted-foreground" title={cur ?? ''}>
                                目前：{cur || '（無）'}
                                {f.fillOnly && cur && <span className="ml-1 text-amber-600 dark:text-amber-400">已有，只能補缺</span>}
                            </span>
                            <Input
                                aria-label={`${f.label} 建議值`}
                                value={values[f.key]}
                                disabled={!open}
                                onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                                className="h-8"
                            />
                        </div>
                    );
                })}
            </div>
            {open && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                        size="sm"
                        disabled={apply.isPending || !picked.length}
                        onClick={() => apply.mutate({ id: r.id, fields: Object.fromEntries(picked.map((f) => [f.key, values[f.key]])), admin_notes: notes })}
                    >
                        {apply.isPending && <Loader2 className="size-3.5 animate-spin" />}套用並標記已修正
                    </Button>
                    <span className="text-[12px] text-muted-foreground">YouTube／Twitch 會先查頻道確認存在；社群與簡介會覆蓋目前值</span>
                    {apply.error && <p role="alert" className="w-full text-[13px] text-destructive">{formatSubmissionError(apply.error)}</p>}
                </div>
            )}
        </section>
    );
}

function streamUrl(r: ReportRecord): string | null {
    if (!r.stream_external_id) return null;
    if (r.stream_platform === 'youtube') return `https://www.youtube.com/watch?v=${r.stream_external_id}`;
    return null;
}

function ReportCard({ r }: { r: ReportRecord }) {
    const [status, setStatus] = useState(r.status);
    const [notes, setNotes] = useState(r.admin_notes ?? '');
    const update = useUpdateReport();
    const url = streamUrl(r);
    return (
        <article className="rounded-xl border border-border bg-card p-4">
            <header className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{KIND[r.kind]}</span>
                {r.reasons.map((x) => (
                    <span key={x} className="rounded-full border border-border px-2 py-0.5">{REASON[x] ?? x}</span>
                ))}
                <span className="ml-auto text-[12px] text-muted-foreground">{new Date(r.created_at).toLocaleString('zh-TW')}</span>
            </header>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                {r.vtuber && (
                    <RouteLink to={schedulePersonPage(r.vtuber.slug)} className="font-medium underline-offset-4 hover:underline">{r.vtuber.name}</RouteLink>
                )}
                {r.group && <span>名冊：{r.group.name}</span>}
                {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-600 hover:underline dark:text-sky-400">
                        直播 {r.stream_external_id}<ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                )}
                {r.stream_platform === 'twitch' && <span className="text-muted-foreground">Twitch 場次 {r.stream_external_id}</span>}
                {r.page_url && <span className="text-[12px] text-muted-foreground">來自 {r.page_url}</span>}
            </div>
            {r.description && <p className="mt-2 whitespace-pre-line break-words text-sm">{r.description}</p>}
            {(r.source_urls?.length || r.contact) && (
                <div className="mt-2 space-y-0.5 text-[13px] text-muted-foreground">
                    {r.source_urls?.map((u) => (
                        <div key={u}>
                            <a href={u} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-sky-600 hover:underline dark:text-sky-400">{u}</a>
                        </div>
                    ))}
                    {r.contact && <p>聯絡：{r.contact}</p>}
                </div>
            )}
            {r.suggested && <SuggestedPanel r={r} notes={notes} />}
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <Select value={status} onValueChange={(v: string) => setStatus(v as ReportRecord['status'])}>
                    <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {(Object.keys(STATUS) as (keyof typeof STATUS)[]).filter((s) => s !== 'all').map((s) => (
                            <SelectItem key={s} value={s}>{STATUS[s]}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="處理備註" className="h-8 max-w-sm" />
                <Button size="sm" disabled={update.isPending || (status === r.status && notes === (r.admin_notes ?? ''))} onClick={() => update.mutate({ id: r.id, status, admin_notes: notes })}>
                    {update.isPending && <Loader2 className="size-3.5 animate-spin" />}儲存
                </Button>
                {update.error && <p role="alert" className="w-full text-[13px] text-destructive">{formatSubmissionError(update.error)}</p>}
            </div>
        </article>
    );
}

export function ReportsTab() {
    const [status, setStatus] = useState<string>('open');
    const [kind, setKind] = useState<string>('all');
    const hasToken = useAdminTokenPresent();
    const query = useReports(status, kind);
    // 沒存 token，或存了但後端回 401（token 錯）：都顯示輸入列
    const needToken = !hasToken || isUnauthorized(query.error);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold">資料回報</h2>
                <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.entries(STATUS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={kind} onValueChange={setKind}>
                    <SelectTrigger className="h-8 w-32">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.entries(KIND).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                </Select>
                {query.data && <span className="text-[12px] text-muted-foreground">{query.data.length} 筆</span>}
            </div>
            {needToken && <AdminTokenInline />}
            {query.isLoading ? (
                <p className="text-sm text-muted-foreground">載入中…</p>
            ) : query.isError ? (
                <p role="alert" className="text-sm text-destructive">{formatSubmissionError(query.error)}</p>
            ) : query.data?.length ? (
                <div className="space-y-3">{/* key 帶狀態：套用補充資料後回報變 resolved，卡片要重新掛載，否則狀態選單停在舊值、誤按儲存會改回 open */}
                {query.data.map((r) => <ReportCard key={`${r.id}:${r.status}`} r={r} />)}</div>
            ) : (
                <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">沒有符合條件的回報</p>
            )}
        </div>
    );
}
