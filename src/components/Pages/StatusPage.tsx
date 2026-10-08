// 公開狀態頁（/status）：服務狀態、已知問題、使用者回報、公告、最近更新。視覺依 Claude Design 設計稿（2026-10-08）。
// 服務狀態／已知問題／使用者回報（feedbacks）／公告由 /api/status 一次取得（edge 快取 60 秒）；最近更新是前端內建資料。
// 任一 API 區塊可能是 null（該來源暫時取不到），逐區顯示「暫時無法取得」。
// 使用者回報的 created_at 只到日期（'YYYY-MM-DD'，隱私：條款只說「送出日期」），要當本地日期解析。
// SEO（WebPage + Breadcrumb）由 App.tsx 統一處理；預渲染只輸出殼層（SSR 的 QueryClient 不抓資料），所以殼層要有 h1 與各區標題。
// 燈號一律「形狀＋文字」並用（✓ ▲ ✕ －），不只靠顏色區分。

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ChevronDown, RefreshCw, ArrowUpRight, MessageSquareWarning, Check, X, Minus, Triangle, TriangleAlert, LayoutGrid, Youtube, Twitch, Eye, Wrench } from 'lucide-react';
import { StaticPageHeader } from '../StaticPageHeader';
import { RouteLink } from '../Navigation/RouteLink';
import { SiteFooter } from '../SiteFooter';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../ui/utils';
import { useStatus, type Health, type IssueStatus, type KnownIssue, type PublicFeedback, type PublicFeedbackStatus, type StatusResponse } from '../../features/status/api';
import { formatRelative, formatDayTime } from '../../features/schedule/formatTime';
import { versionHistoryData } from '../../config/versionHistoryData';
import { useUIStore } from '../../store/useUIStore';

type TFn = (key: string, options?: Record<string, unknown>) => string;

const RECENT_VERSIONS = 3;
/** 總燈號標題最多點名幾個出問題的服務，再多就改說「N 項服務」 */
const MAX_NAMED = 3;
const ISSUE_STAGES: IssueStatus[] = ['investigating', 'identified', 'fixing', 'monitoring', 'resolved'];

/** 文字色（淺色主題用深一階，維持 4.5:1） */
const HEALTH_TEXT: Record<Health, string> = {
    operational: 'text-emerald-600 dark:text-emerald-400',
    degraded: 'text-amber-600 dark:text-amber-400',
    down: 'text-red-600 dark:text-red-400',
    unknown: 'text-muted-foreground',
};
const HEALTH_PILL: Record<Health, string> = {
    operational: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    degraded: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    down: 'bg-red-500/15 text-red-700 dark:text-red-300',
    unknown: 'bg-muted text-muted-foreground',
};
const HERO: Record<Health, { box: string; tile: string }> = {
    operational: { box: 'border-emerald-500/35 bg-emerald-500/[0.07]', tile: 'bg-emerald-400' },
    degraded: { box: 'border-amber-500/35 bg-amber-500/[0.07]', tile: 'bg-amber-400' },
    down: { box: 'border-red-500/40 bg-red-500/[0.07]', tile: 'bg-red-400' },
    unknown: { box: 'border-border bg-muted/40', tile: 'bg-muted-foreground/40' },
};

/** 燈號形狀（裝飾用；旁邊一定有文字） */
function HealthMark({ status, size = 14, className }: { status: Health; size?: number; className?: string }) {
    const props = { size, strokeWidth: 3, 'aria-hidden': true as const, className: cn('shrink-0', HEALTH_TEXT[status], className) };
    if (status === 'operational') return <Check {...props} />;
    if (status === 'degraded') return <Triangle {...props} />;
    if (status === 'down') return <X {...props} />;
    return <Minus {...props} />;
}

function HealthPill({ status, label }: { status: Health; label: string }) {
    return (
        <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-bold', HEALTH_PILL[status])}>
            <HealthMark status={status} size={13} className="text-current" />
            {label}
        </span>
    );
}

function Unavailable({ children }: { children: ReactNode }) {
    return <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function LoadingBlock({ tall = false }: { tall?: boolean }) {
    return (
        <div className="space-y-3" aria-hidden="true">
            <Skeleton className={cn('w-full rounded-2xl', tall ? 'h-44' : 'h-24')} />
            <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
    );
}

/** 「A、B 和 C」：Intl.ListFormat（ES2021，專案 TS lib 未含）不存在時退回頓號／逗號串接 */
function formatList(items: string[], locale: string): string {
    const LF = (Intl as unknown as { ListFormat?: new (l: string, o: { type: string }) => { format: (x: string[]) => string } }).ListFormat;
    if (LF) return new LF(locale, { type: 'conjunction' }).format(items);
    return items.join(/^(zh|ja)/.test(locale) ? '、' : ', ');
}

/** 'YYYY-MM-DD' → 依 locale 的日期；當本地日期用正午建立，避免時區把日期推到前一天。格式不符回空字串 */
function formatPublicDate(day: string | null | undefined, locale: string): string {
    const m = day ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null;
    if (!m) return '';
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'numeric', day: 'numeric' }).format(date);
}

/** 出問題的項目名稱（給總燈號標題點名用） */
function problemNames(data: StatusResponse, tx: TFn): { names: string[]; worst: Health } {
    const names: string[] = [];
    const bad: Health[] = [];
    const push = (status: Health, name: string) => {
        if (status === 'degraded' || status === 'down') {
            names.push(name);
            bad.push(status);
        }
    };
    data.site?.jobs.forEach((j) => push(j.status, tx(`status:services.site.jobs.${j.key}`)));
    if (data.youtube) push(data.youtube.status, tx('status:services.youtube.detection'));
    if (data.twitch) {
        const before = names.length;
        data.twitch.components.forEach((c) => push(c.status, `Twitch ${c.name}`));
        // 官方總燈號不正常、但沒有單一元件標示時，至少點名 Twitch
        if (names.length === before) push(data.twitch.status, 'Twitch');
    }
    return { names, worst: bad.includes('down') ? 'down' : 'degraded' };
}

function Hero({ data, locale, openIssues }: { data: StatusResponse; locale: string; openIssues: number }) {
    const { t } = useTranslation('status');
    const tx = t as unknown as TFn;
    const overall = data.overall;

    let title: string;
    let body: string;
    if (overall === 'operational') {
        title = tx('overall.operational');
        body = openIssues > 0 ? tx('headline.okBodyIssues', { count: openIssues }) : tx('headline.okBody');
    } else if (overall === 'unknown') {
        title = tx('overall.unknown');
        body = tx('headline.unknownBody');
    } else {
        const { names, worst } = problemNames(data, tx);
        title = names.length === 0
            ? tx(`overall.${overall}`)
            : names.length > MAX_NAMED
                ? tx(`headline.many.${worst}`, { count: names.length })
                : tx(`headline.named.${worst}`, { names: formatList(names, locale) });
        body = openIssues > 0 ? tx('headline.otherOkIssues', { count: openIssues }) : tx('headline.otherOk');
    }

    const Icon = overall === 'operational' ? Check : overall === 'degraded' ? TriangleAlert : overall === 'down' ? X : Minus;
    return (
        <div className={cn('flex flex-wrap items-center gap-x-8 gap-y-5 rounded-3xl border p-6 sm:px-10 sm:py-9', HERO[overall].box)}>
            <span className={cn('flex size-14 shrink-0 items-center justify-center rounded-2xl sm:size-[72px] sm:rounded-[20px]', HERO[overall].tile)}>
                <Icon className="size-7 text-slate-950 sm:size-9" strokeWidth={2.6} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-[1_1_320px]">
                {/* 只有總燈號標題放 live region：相對時間每分鐘都會變，放進去會一直被朗讀 */}
                <p role="status" aria-live="polite" className="text-[1.375rem] font-black leading-snug tracking-tight [text-wrap:balance] sm:text-[2rem]">{title}</p>
                <p className="mt-2 text-[15px] text-muted-foreground sm:text-base">{body}</p>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                <span className="text-[13px] text-muted-foreground">
                    {t('lastChecked', { time: formatRelative(data.checkedAt, Date.now(), locale) })}・{t('autoRefresh')}
                </span>
                {openIssues > 0 && (
                    <a
                        href="#status-issues"
                        className="inline-flex min-h-10 items-center rounded-xl border border-border px-3.5 text-sm font-medium transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {t('viewIssues', { count: openIssues })}
                    </a>
                )}
            </div>
        </div>
    );
}

function ServiceCard({ icon, iconTint, title, note, status, children, summary, footer }: {
    icon: ReactNode; iconTint: string; title: string; note: string; status: Health; children: ReactNode; summary: ReactNode;
    /** 手機與桌機都顯示（事件連結、配額提示、官方狀態頁連結等不能只在桌機看到的資訊） */
    footer?: ReactNode;
}) {
    const { t } = useTranslation('status');
    return (
        <article className="flex flex-col gap-4 rounded-2xl border border-border bg-card/50 p-4 md:p-[22px]">
            <div className="flex items-center gap-3">
                <span className={cn('hidden size-10 shrink-0 items-center justify-center rounded-xl md:inline-flex', iconTint)}>{icon}</span>
                <div className="min-w-0 flex-1">
                    <h3 className="font-bold">{title}</h3>
                    <p className="text-[12.5px] text-muted-foreground">{note}</p>
                </div>
                <HealthPill status={status} label={t(`health.${status}`)} />
            </div>
            {/* 手機只顯示一行摘要（設計稿：精簡列表），桌機顯示完整明細 */}
            <div className="-mt-2 text-[13px] text-muted-foreground md:hidden">{summary}</div>
            <div className="hidden flex-1 flex-col gap-4 md:flex">{children}</div>
            {footer && <div className="flex flex-col gap-4">{footer}</div>}
        </article>
    );
}

function Services({ data, locale }: { data: StatusResponse; locale: string }) {
    const { t } = useTranslation('status');
    const now = Date.now();
    const ago = (iso: string | null) => (iso ? formatRelative(iso, now, locale) : t('noData'));
    const unavailable = <p className="text-sm text-muted-foreground">{t('unavailable')}</p>;

    const site = data.site;
    const latestJob = site?.jobs.map((j) => j.lastRunAt).filter((x): x is string => !!x).sort().pop() ?? null;
    const yt = data.youtube;
    const tw = data.twitch;
    // 手機摘要的「受影響」只算確定有狀況的；unknown（官方沒給燈號）不算
    const twBad = tw?.components.filter((c) => c.status === 'degraded' || c.status === 'down') ?? [];
    // 最近一輪整輪失敗：og 數字不可信，不顯示成功數，也不說「沒有要查的頻道」
    const ytRunFailed = yt?.runFailed === true;
    const ytSummary = !yt ? t('unavailable')
        : ytRunFailed ? t('services.youtube.runFailed')
            : yt.checked > 0 ? t('services.youtube.summary', { ok: yt.checked - yt.failed, checked: yt.checked })
                : t('services.youtube.noChecks');

    return (
        <div className="grid gap-3 md:grid-cols-3 md:gap-4">
            <ServiceCard
                icon={<LayoutGrid size={20} className="text-violet-600 dark:text-violet-300" aria-hidden="true" />}
                iconTint="bg-violet-500/15"
                title={t('services.site.title')}
                note={t('services.site.note')}
                status={site?.status ?? 'unknown'}
                summary={site ? t('services.site.summary', { count: site.jobs.length, time: ago(latestJob) }) : t('unavailable')}
            >
                {site ? (
                    <ul className="flex flex-col gap-2.5 text-sm">
                        {site.jobs.map((job) => (
                            <li key={job.key} className="flex items-center gap-2.5">
                                <HealthMark status={job.status} />
                                <span className="flex-1">{t(`services.site.jobs.${job.key}`)}</span>
                                {/* 色盲與螢幕閱讀器也要知道是哪一項有狀況：正常以外都寫出文字 */}
                                {job.status !== 'operational' && <span className={cn('text-xs font-bold', HEALTH_TEXT[job.status])}>{t(`health.${job.status}`)}</span>}
                                {job.status === 'operational' && <span className="sr-only">{t('health.operational')}</span>}
                                <span className="font-mono text-[12.5px] tabular-nums text-muted-foreground">{ago(job.lastRunAt)}</span>
                            </li>
                        ))}
                    </ul>
                ) : unavailable}
            </ServiceCard>

            <ServiceCard
                icon={<Youtube size={20} className="text-red-600 dark:text-red-300" aria-hidden="true" />}
                iconTint="bg-red-500/15"
                title={t('services.youtube.title')}
                note={t('services.youtube.note')}
                status={yt?.status ?? 'unknown'}
                summary={ytSummary}
                footer={yt && (
                    <>
                        {yt.quotaExceeded && <p className="text-sm text-amber-700 dark:text-amber-300">{t('services.youtube.quota')}</p>}
                        <p className="hidden text-[12.5px] text-muted-foreground md:block">{ago(yt.lastRunAt)}・{t('services.youtube.threshold')}</p>
                    </>
                )}
            >
                {yt ? (
                    <>
                        {ytRunFailed ? (
                            <p className="text-sm">{t('services.youtube.runFailed')}</p>
                        ) : yt.checked > 0 ? (
                            <div>
                                <p className="text-[13px] text-muted-foreground">{t('services.youtube.lastRound')}</p>
                                <p className="mt-1 font-mono text-[28px] font-black tabular-nums tracking-tight">
                                    {yt.checked - yt.failed}
                                    <span className="text-base font-medium text-muted-foreground"> {t('services.youtube.ofChecked', { checked: yt.checked })}</span>
                                </p>
                                <div
                                    role="img"
                                    aria-label={t('services.youtube.barLabel', { checked: yt.checked, failed: yt.failed })}
                                    className="mt-2.5 h-2 overflow-hidden rounded-full bg-red-400/50"
                                >
                                    <div className="h-full bg-emerald-500" style={{ width: `${((yt.checked - yt.failed) / yt.checked) * 100}%` }} />
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm">{t('services.youtube.noChecks')}</p>
                        )}
                    </>
                ) : unavailable}
            </ServiceCard>

            <ServiceCard
                icon={<Twitch size={20} className="text-violet-600 dark:text-violet-300" aria-hidden="true" />}
                iconTint="bg-violet-500/20"
                title={t('services.twitch.title')}
                note={t('services.twitch.note')}
                status={tw?.status ?? 'unknown'}
                summary={!tw
                    ? t('unavailable')
                    : twBad.length === 0
                        ? t('services.twitch.summaryOk', { count: tw.components.length })
                        : t('services.twitch.summaryIssues', { names: formatList(twBad.map((c) => c.name), locale), rest: tw.components.length - twBad.length })}
                footer={(
                    <>
                        {tw?.incidents.map((i, idx) => (
                            i.url ? (
                                <a
                                    key={`${idx}-${i.name}`}
                                    href={i.url}
                                    target="_blank"
                                    rel="noopener noreferrer nofollow"
                                    className="rounded-xl bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-800 underline-offset-2 hover:underline dark:text-amber-200"
                                >
                                    {i.name} <ArrowUpRight size={12} className="inline" aria-hidden="true" />
                                </a>
                            ) : (
                                <p key={`${idx}-${i.name}`} className="rounded-xl bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-800 dark:text-amber-200">{i.name}</p>
                            )
                        ))}
                        <a
                            href="https://status.twitch.com/"
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="inline-flex items-center gap-1 self-start text-[12.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                            {t('services.twitch.official')}
                            <ArrowUpRight size={12} aria-hidden="true" />
                        </a>
                    </>
                )}
            >
                {tw ? (
                    <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {tw.components.map((c, idx) => (
                            <li key={`${idx}-${c.name}`} className="flex min-w-0 items-center gap-2">
                                <HealthMark status={c.status} size={13} />
                                <span className="truncate">{c.name}</span>
                                <span className="sr-only">{t(`health.${c.status}`)}</span>
                            </li>
                        ))}
                    </ul>
                ) : unavailable}
            </ServiceCard>
        </div>
    );
}

function Legend() {
    const { t } = useTranslation('status');
    return (
        <ul aria-label={t('legend')} className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            {(['operational', 'degraded', 'down', 'unknown'] as Health[]).map((h) => (
                <li key={h} className="inline-flex items-center gap-1.5"><HealthMark status={h} />{t(`health.${h}`)}</li>
            ))}
        </ul>
    );
}

/** 未解決的排前面，同一組內依更新時間新到舊（API 已依 updated_at 排序，stable sort 保留） */
function sortIssues(issues: KnownIssue[]): KnownIssue[] {
    return [...issues].sort((a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved'));
}

function IssueCard({ issue, locale }: { issue: KnownIssue; locale: string }) {
    const { t } = useTranslation('status');
    const resolved = issue.status === 'resolved';
    const at = ISSUE_STAGES.indexOf(issue.status);
    const tone = resolved ? 'bg-emerald-500' : 'bg-amber-400';
    const when = resolved && issue.resolved_at
        ? t('issues.resolvedAt', { time: formatDayTime(issue.resolved_at, locale) })
        : t('issues.updatedAt', { time: formatRelative(issue.updated_at, Date.now(), locale) });

    return (
        <li className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card/50 p-[18px] sm:px-6 sm:py-[22px]">
            <div className="flex flex-wrap items-center gap-2">
                {/* 手機看不到進度條下的階段文字，改用徽章顯示目前階段 */}
                <span className={cn('rounded-full px-2.5 py-0.5 text-[12.5px] font-bold sm:hidden', resolved ? HEALTH_PILL.operational : HEALTH_PILL.degraded)}>
                    {t(`issues.status.${issue.status}`)}
                </span>
                {issue.severity === 'major' && !resolved && (
                    <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-[12.5px] font-bold text-red-700 dark:text-red-300">{t('issues.major')}</span>
                )}
                {issue.areas.map((a) => (
                    <span key={a} className="rounded-full border border-border px-2.5 py-0.5 text-[12.5px] text-muted-foreground">{t(`issues.areas.${a}`)}</span>
                ))}
                <span className="hidden text-[12.5px] text-muted-foreground sm:ml-auto sm:inline">{when}</span>
            </div>
            <div>
                <h3 className="text-[16.5px] font-bold leading-snug sm:text-lg">{issue.title}</h3>
                {issue.body && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{issue.body}</p>}
            </div>
            <ol aria-label={t('issues.progress', { stage: t(`issues.status.${issue.status}`), n: at + 1 })} className="grid grid-cols-5 gap-1 sm:gap-1.5">
                {ISSUE_STAGES.map((stage, i) => (
                    <li key={stage} className="flex flex-col gap-1.5" aria-current={i === at ? 'step' : undefined}>
                        <span className={cn('h-1 rounded-full sm:h-[5px]', i <= at ? tone : 'bg-foreground/10')} />
                        <span className={cn('hidden text-[12.5px] sm:block', i === at ? 'font-bold text-foreground' : 'text-muted-foreground/80')}>
                            {t(`issues.status.${stage}`)}
                        </span>
                    </li>
                ))}
            </ol>
            <p className="text-[12.5px] text-muted-foreground sm:hidden">{when}</p>
        </li>
    );
}

/** 使用者回報的狀態徽章：圖示形狀＋文字，不只靠顏色 */
const FEEDBACK_BADGE: Record<PublicFeedbackStatus, { icon: typeof Check; cls: string }> = {
    read: { icon: Eye, cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
    processing: { icon: Wrench, cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
    fixed: { icon: Check, cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
};

function FeedbackList({ items, locale }: { items: PublicFeedback[]; locale: string }) {
    const { t } = useTranslation('status');
    return (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card/50">
            {items.map((f) => {
                const badge = FEEDBACK_BADGE[f.status] ?? FEEDBACK_BADGE.read;
                const Icon = badge.icon;
                const day = formatPublicDate(f.created_at, locale);
                return (
                    <li key={f.id} className="flex flex-col gap-2 px-[18px] py-4 sm:px-6">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-bold', badge.cls)}>
                                <Icon size={12} strokeWidth={2.75} aria-hidden="true" />
                                {t(`feedback.status.${f.status}`)}
                            </span>
                            {day && <span className="text-[12.5px] text-muted-foreground">{day}</span>}
                        </div>
                        <p className="whitespace-pre-line break-words text-sm leading-relaxed">{f.content}</p>
                    </li>
                );
            })}
        </ul>
    );
}

export function StatusPage() {
    const { t, i18n } = useTranslation(['status', 'versionHistory', 'common']);
    // 版本紀錄的 key 來自資料陣列（動態字串），i18next 型別不接受；沿用專案慣例以 cast 繞過
    const tx = t as unknown as TFn;
    const locale = i18n.language || 'zh-TW';
    const openModal = useUIStore((s) => s.openModal);
    const query = useStatus();
    const data = query.data;
    const now = Date.now();
    const openIssues = data?.issues?.filter((i) => i.status !== 'resolved').length ?? 0;
    const unavailable = <Unavailable>{t('status:unavailable')}</Unavailable>;

    const versions = versionHistoryData.slice(0, RECENT_VERSIONS);
    const h2 = 'text-[19px] font-bold sm:text-[22px]';

    return (
        <div className="relative min-h-screen bg-background text-foreground">
            <StaticPageHeader title={t('status:title')} analyticsCategory="StatusPage" />

            <main className="mx-auto max-w-[1120px] px-4 pb-36 sm:px-6">
                <nav aria-label="Breadcrumb" className="pt-5 text-[13px] text-muted-foreground">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li><RouteLink to="home" className="hover:text-foreground">MultiStream Hub</RouteLink></li>
                        <li aria-hidden="true" className="inline-flex opacity-50"><ChevronRight size={13} /></li>
                        <li aria-current="page" className="font-medium text-foreground">{t('status:title')}</li>
                    </ol>
                </nav>

                {/* 頁面 h1 固定（SEO 與預渲染殼層需要）；設計稿的大標題是總燈號，放在下方 hero */}
                <h1 className="mt-4 text-[15px] font-bold text-muted-foreground">{t('status:hero.title')}</h1>

                {/* 總燈號：資料到之前固定高度的骨架，避免 CLS */}
                <section aria-label={t('status:overallLabel')} className="mt-3 min-h-[148px] sm:min-h-[150px]">
                    {data ? (
                        <Hero data={data} locale={locale} openIssues={openIssues} />
                    ) : query.isError ? (
                        <div className="flex min-h-[148px] flex-wrap items-center gap-4 rounded-3xl border border-border bg-muted/40 p-6">
                            <p role="status" className="flex-1 text-lg font-bold">{t('status:loadError')}</p>
                            <Button variant="outline" onClick={() => query.refetch()}>
                                <RefreshCw size={14} aria-hidden="true" />
                                {t('status:retry')}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex min-h-[148px] items-center rounded-3xl border border-border bg-muted/30 p-6">
                            <p role="status" className="text-muted-foreground">{t('status:loading')}</p>
                        </div>
                    )}
                </section>

                <section aria-labelledby="status-services-h" className="mt-10 sm:mt-14">
                    <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-2 sm:mb-5">
                        <h2 id="status-services-h" className={h2}>{t('status:services.title')}</h2>
                        <div className="sm:ml-auto"><Legend /></div>
                    </div>
                    {data ? <Services data={data} locale={locale} /> : query.isError ? unavailable : <LoadingBlock tall />}
                </section>

                {/* 錨點指向 section 本身，scroll-mt 讓區塊標題落在 sticky header 下方 */}
                <section id="status-issues" aria-labelledby="status-issues-h" className="mt-10 scroll-mt-20 sm:mt-14">
                    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 sm:mb-5">
                        <h2 id="status-issues-h" className={h2}>{t('status:issues.title')}</h2>
                        <span className="hidden text-[13px] text-muted-foreground md:inline">{t('status:issues.subtitle')}</span>
                        <Button variant="outline" className="ml-auto min-h-11 sm:min-h-10" onClick={() => openModal('feedback')}>
                            <MessageSquareWarning size={14} aria-hidden="true" />
                            {t('status:issues.report')}
                        </Button>
                    </div>
                    {data ? (
                        !data.issues ? unavailable
                            : data.issues.length === 0 ? <Unavailable>{t('status:issues.empty')}</Unavailable>
                                : <ul className="flex flex-col gap-3 sm:gap-3.5">{sortIssues(data.issues).map((issue) => <IssueCard key={issue.id} issue={issue} locale={locale} />)}</ul>
                    ) : query.isError ? unavailable : <LoadingBlock />}
                </section>

                <section aria-labelledby="status-feedback-h" className="mt-10 sm:mt-14">
                    <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 sm:mb-5">
                        <h2 id="status-feedback-h" className={h2}>{t('status:feedback.title')}</h2>
                        <span className="text-[13px] text-muted-foreground">{t('status:feedback.subtitle')}</span>
                    </div>
                    {data ? (
                        !data.feedbacks ? unavailable
                            : data.feedbacks.length === 0 ? <Unavailable>{t('status:feedback.empty')}</Unavailable>
                                : <FeedbackList items={data.feedbacks} locale={locale} />
                    ) : query.isError ? unavailable : <LoadingBlock />}
                </section>

                <div className="mt-10 grid gap-10 sm:mt-14 md:grid-cols-2 md:gap-8">
                    <section aria-labelledby="status-announcements-h">
                        <h2 id="status-announcements-h" className={cn(h2, 'mb-3 sm:mb-5')}>{t('status:announcements.title')}</h2>
                        {data ? (
                            !data.announcements ? unavailable
                                : data.announcements.length === 0 ? <Unavailable>{t('status:announcements.empty')}</Unavailable>
                                    : (
                                        <ol className="border-l-2 border-border">
                                            {data.announcements.map((a) => {
                                                const active = !a.ends_at || Date.parse(a.ends_at) > now;
                                                return (
                                                    <li key={a.id} className="pb-5 pl-4 last:pb-0 sm:pl-5">
                                                        <p className={cn('text-[12.5px]', active ? 'font-bold text-violet-700 dark:text-violet-300' : 'text-muted-foreground')}>
                                                            {formatDayTime(a.starts_at, locale)}{active && `・${t('status:announcements.active')}`}
                                                        </p>
                                                        <h3 className="mt-0.5 text-[15.5px] font-bold sm:text-base">{a.title}</h3>
                                                        {a.body && <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{a.body}</p>}
                                                    </li>
                                                );
                                            })}
                                        </ol>
                                    )
                        ) : query.isError ? unavailable : <LoadingBlock />}
                    </section>

                    {/* 版本紀錄是前端內建資料，預渲染就有內容 */}
                    <section aria-labelledby="status-updates-h">
                        <div className="mb-3 flex items-baseline gap-3 sm:mb-5">
                            <h2 id="status-updates-h" className={h2}>{t('status:updates.title')}</h2>
                            <button
                                type="button"
                                onClick={() => openModal('history')}
                                className="ml-auto min-h-10 text-sm text-violet-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-violet-300"
                            >
                                {t('status:updates.all')} →
                            </button>
                        </div>
                        <div className="flex flex-col gap-3">
                            {versions.map((v, idx) => (
                                <details key={v.version} open={idx === 0} className="group rounded-2xl border border-border bg-card/50 px-[18px] py-3.5">
                                    <summary className="flex cursor-pointer list-none items-baseline gap-2.5 font-bold [&::-webkit-details-marker]:hidden">
                                        <span className="font-mono">{v.version}</span>
                                        <span className="text-[12.5px] font-normal text-muted-foreground">{tx(v.dateKey)}</span>
                                        <span className="ml-auto text-[12.5px] font-normal text-muted-foreground">{t('status:updates.count', { count: v.changeKeys.length })}</span>
                                        <ChevronDown size={14} className="self-center text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                                    </summary>
                                    <ul className="mt-2.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                                        {v.changeKeys.map((k) => <li key={k}>{tx(k)}</li>)}
                                    </ul>
                                </details>
                            ))}
                        </div>
                    </section>
                </div>

                <section aria-labelledby="status-about-h" className="mt-16 max-w-[680px] border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground sm:mt-[72px]">
                    <h2 id="status-about-h" className="mb-1.5 text-sm font-bold text-foreground">{t('status:about.title')}</h2>
                    <p>{t('status:about.body')}</p>
                    <p className="mt-2">{t('status:about.youtube')}</p>
                </section>
            </main>

            <SiteFooter />
        </div>
    );
}
