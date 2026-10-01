// 後台「投稿審核」：使用者推薦的新 VTuber（vtuber_contributions）。
// 每筆可修改欄位後核准（approve_vtuber_contribution 單一交易：建團體→vtubers→vtuber_channels→稽核）或駁回。
// 地區只收本人自稱或所屬公司證據（見 Obsidian 決策紀錄 2026-09-30 地區檢查）：證據連結放在地區旁邊提醒人工判斷。

import { useState } from 'react';
import { AlertTriangle, Check, ExternalLink, Loader2, X } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';
import { Checkbox } from '../../../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { RouteLink } from '../../../components/Navigation/RouteLink';
import { schedulePersonPage } from '../../../config/schedulePerson';
import {
    formatSubmissionError,
    isUnauthorized,
    useApproveContribution,
    useContributions,
    useRejectContribution,
    type ApproveOverrides,
    type ContributionRecord,
} from '../hooks/useAdminSubmissions';
import { AdminTokenInline, useAdminTokenPresent } from './AdminTokenInline';

const NATIONALITIES = ['TW', 'HK', 'MY', 'JP', 'KR', 'OTHER'];
const YT_AVATAR = /^https:\/\/yt3\.(ggpht|googleusercontent)\.com\//;
const STATUS_LABEL: Record<string, string> = { pending: '待審', approved: '已核准', rejected: '已駁回', all: '全部' };

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 break-all text-[13px] text-sky-600 hover:underline dark:text-sky-400">
            {children}
            <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
        </a>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[88px_1fr] items-start gap-2">
            <Label className="pt-2 text-[12px] text-muted-foreground">{label}</Label>
            <div className="min-w-0">{children}</div>
        </div>
    );
}

function ContributionCard({ c }: { c: ContributionRecord }) {
    const p = c.payload;
    const pending = c.status === 'pending';
    const [f, setF] = useState({
        name: p.name ?? '',
        nationality: p.nationality ?? 'TW',
        avatar: p.avatar_url ?? '',
        bio: p.bio ?? '',
        x: p.x_url ?? '',
        facebook: p.facebook_url ?? '',
        instagram: p.instagram_url ?? '',
        twitch: p.twitch_login ?? '',
        affiliation: (p.affiliation_type ?? 'personal') as 'personal' | 'agency' | 'circle',
        groupName: p.group_name ?? '',
        createGroup: false,
        notes: '',
    });
    const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }));
    const approve = useApproveContribution();
    const reject = useRejectContribution();
    const [result, setResult] = useState<{ slug: string } | null>(null);
    const busy = approve.isPending || reject.isPending;
    const error = approve.error ?? reject.error;

    const overrides = (): ApproveOverrides => {
        const o: ApproveOverrides = {
            name: f.name,
            nationality: f.nationality,
            avatar_url: f.avatar,
            bio: f.bio,
            x_url: f.x,
            facebook_url: f.facebook,
            instagram_url: f.instagram,
            twitch_login: f.twitch,
            affiliation_type: f.affiliation,
            reviewer_notes: f.notes,
        };
        if (f.affiliation !== 'personal') {
            if (f.createGroup) o.new_group = { name: f.groupName, kind: f.affiliation, nationality: f.nationality };
            else o.group_name = f.groupName;
        }
        return o;
    };

    return (
        <article className="rounded-xl border border-border bg-card p-4">
            <header className="flex flex-wrap items-start gap-3">
                {YT_AVATAR.test(f.avatar) ? (
                    <img src={f.avatar} alt="" referrerPolicy="no-referrer" className="size-12 rounded-full bg-muted object-cover" />
                ) : (
                    <span className="size-12 rounded-full bg-muted" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="text-[12px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleString('zh-TW')} · {STATUS_LABEL[c.status]} · {c.submitted_by}
                    </p>
                    {c.youtube_channel_id && <Ext href={`https://www.youtube.com/channel/${c.youtube_channel_id}`}>YouTube：{p.channel_title || c.youtube_channel_id}</Ext>}
                </div>
            </header>

            <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
                {c.auto_check?.name_matches_title === false && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="size-3" aria-hidden="true" />名稱與頻道名不同（頻道：{c.auto_check.channel_title}）
                    </span>
                )}
                {c.auto_check?.avatar_is_channel_avatar === false && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="size-3" aria-hidden="true" />頭像不是頻道頭像
                    </span>
                )}
                {p.subscriber_count_claimed && <span className="rounded-full bg-muted px-2 py-0.5">自填訂閱數：{p.subscriber_count_claimed}</span>}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="space-y-2">
                    <Row label="名稱">
                        <Input value={f.name} onChange={(e) => set('name', e.target.value)} disabled={!pending} className="h-8" />
                    </Row>
                    <Row label="地區">
                        <div className="space-y-1">
                            <Select value={f.nationality} onValueChange={(v: string) => set('nationality', v)} disabled={!pending}>
                                <SelectTrigger className="h-8 w-40">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {NATIONALITIES.map((n) => (
                                        <SelectItem key={n} value={n}>{n}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {p.nationality_evidence_url ? (
                                <Ext href={p.nationality_evidence_url}>地區證據</Ext>
                            ) : (
                                p.nationality !== 'TW' && <p className="text-[12px] text-amber-600">沒有證據連結，需人工確認</p>
                            )}
                        </div>
                    </Row>
                    <Row label="所屬">
                        <div className="space-y-1.5">
                            <Select value={f.affiliation} onValueChange={(v: string) => set('affiliation', v as typeof f.affiliation)} disabled={!pending}>
                                <SelectTrigger className="h-8 w-40">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="personal">個人勢</SelectItem>
                                    <SelectItem value="agency">企業勢</SelectItem>
                                    <SelectItem value="circle">社團</SelectItem>
                                </SelectContent>
                            </Select>
                            {f.affiliation !== 'personal' && (
                                <>
                                    <Input value={f.groupName} onChange={(e) => set('groupName', e.target.value)} placeholder="團體名稱（對到同名既有團體）" disabled={!pending} className="h-8" />
                                    <label className="inline-flex items-center gap-2 text-[12px]">
                                        <Checkbox checked={f.createGroup} onCheckedChange={(v: boolean | 'indeterminate') => set('createGroup', v === true)} disabled={!pending} />
                                        這是新團體（建立）
                                    </label>
                                </>
                            )}
                        </div>
                    </Row>
                    <Row label="頭像">
                        <Input value={f.avatar} onChange={(e) => set('avatar', e.target.value)} disabled={!pending} className="h-8" />
                    </Row>
                </div>
                <div className="space-y-2">
                    <Row label="簡介">
                        <Textarea value={f.bio} onChange={(e) => set('bio', e.target.value)} rows={3} disabled={!pending} />
                    </Row>
                    {(['x', 'facebook', 'instagram', 'twitch'] as const).map((k) => (
                        <Row key={k} label={k === 'x' ? 'X' : k === 'facebook' ? 'Facebook' : k === 'instagram' ? 'Instagram' : 'Twitch'}>
                            <Input value={f[k]} onChange={(e) => set(k, e.target.value)} disabled={!pending} className="h-8" />
                        </Row>
                    ))}
                </div>
            </div>

            {(c.source_urls?.length || c.source_note || c.submitter_contact) && (
                <div className="mt-3 space-y-1 rounded-lg bg-muted/40 px-3 py-2 text-[13px]">
                    {c.source_urls?.map((u) => <div key={u}><Ext href={u}>{u}</Ext></div>)}
                    {c.source_note && <p className="whitespace-pre-line text-muted-foreground">補充：{c.source_note}</p>}
                    {c.submitter_contact && <p className="text-muted-foreground">聯絡：{c.submitter_contact}</p>}
                </div>
            )}

            {pending ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Input value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="審核備註（選填）" className="h-8 max-w-xs" />
                    <Button size="sm" disabled={busy || !f.name.trim()} onClick={() => approve.mutate({ id: c.id, overrides: overrides() }, { onSuccess: (r) => setResult(r.result) })} className="gap-1">
                        {approve.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}核准
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => reject.mutate({ id: c.id, notes: f.notes })} className="gap-1">
                        <X className="size-3.5" />駁回
                    </Button>
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
                    已核准，個人頁：<RouteLink to={schedulePersonPage(result.slug)} className="underline">/schedule/{result.slug}</RouteLink>
                </p>
            )}
        </article>
    );
}

export function ContributionsTab() {
    const [status, setStatus] = useState('pending');
    const hasToken = useAdminTokenPresent();
    const query = useContributions(status);
    // 沒存 token，或存了但後端回 401（token 錯）：都顯示輸入列
    const needToken = !hasToken || isUnauthorized(query.error);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold">投稿審核</h2>
                <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.entries(STATUS_LABEL).map(([v, l]) => (
                            <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
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
                <div className="space-y-3">
                    {query.data.map((c) => <ContributionCard key={c.id} c={c} />)}
                </div>
            ) : (
                <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">沒有{STATUS_LABEL[status]}的投稿</p>
            )}
        </div>
    );
}
