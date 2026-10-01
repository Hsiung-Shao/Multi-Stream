// 後台「資料回報」：使用者回報的 VTuber 資料、單場直播、公司名冊錯誤（vtuber_reports）。
// 依狀態／類型篩選；每筆附對象的快速連結（個人頁、直播、名冊），改狀態並留備註。

import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { RouteLink } from '../../../components/Navigation/RouteLink';
import { schedulePersonPage } from '../../../config/schedulePerson';
import { formatSubmissionError, useReports, useUpdateReport, type ReportRecord } from '../hooks/useAdminSubmissions';
import { AdminTokenInline, useAdminTokenPresent } from './AdminTokenInline';

const STATUS: Record<ReportRecord['status'] | 'all', string> = { open: '未處理', resolved: '已修正', wontfix: '不處理', duplicate: '重複', spam: '垃圾', all: '全部' };
const KIND: Record<ReportRecord['kind'] | 'all', string> = { all: '全部類型', vtuber_info: 'VTuber 資料', stream: '單場直播', roster: '公司名冊', missing_vtuber: '找不到' };
const REASON: Record<string, string> = {
    name: '名字', group: '所屬團體', nationality: '地區', graduated: '已畢業', channel_link: '頻道連結', not_vtuber: '不是 VTuber',
    wrong_time: '時間不對', cancelled: '已取消', duplicate: '重複', missing_member: '漏成員', wrong_member: '多的人', other: '其他',
};

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
    const [hasToken, recheck] = useAdminTokenPresent();
    const query = useReports(status, kind);

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
            {!hasToken && <AdminTokenInline onSaved={() => { recheck(); query.refetch(); }} />}
            {query.isLoading ? (
                <p className="text-sm text-muted-foreground">載入中…</p>
            ) : query.isError ? (
                <p role="alert" className="text-sm text-destructive">{formatSubmissionError(query.error)}</p>
            ) : query.data?.length ? (
                <div className="space-y-3">{query.data.map((r) => <ReportCard key={r.id} r={r} />)}</div>
            ) : (
                <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">沒有符合條件的回報</p>
            )}
        </div>
    );
}
