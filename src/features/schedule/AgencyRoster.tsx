// 週表「所屬」選了某家企業勢時，工具列下方的成員名冊（2026-09-29 使用者要求）。
// 依子團分區；現役與準備中在前、已畢業收在每區底下；正在直播的標紅點；點人進個人週表頁。
// 名冊整塊可收合（記在 localStorage，只是便利設定，讀寫失敗就當展開）。
// 合作藝人（不是正式成員）列在最後一區，標「合作」；合作已結束的收合在該區底下。

import { useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ChevronDown, RefreshCw, Flag } from 'lucide-react';
import { cn } from '../../components/ui/utils';
import { Skeleton } from '../../components/ui/skeleton';
import { RouteLink } from '../../components/Navigation/RouteLink';
import { schedulePersonPage } from '../../config/schedulePerson';
import { useAgencyRoster } from './useAgencyRoster';
import type { RosterMember, RosterSection } from './rosterSource';
import { useReportDialog } from '../report/ReportDialogProvider';

const COLLAPSE_KEY = 'schedule-roster-collapsed';

function readCollapsed(): boolean {
    try {
        return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
        return false;
    }
}

function writeCollapsed(v: boolean): void {
    try {
        localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
    } catch {
        // 私密模式等：收合狀態只是便利設定
    }
}

/** 名字下方的一行小字：合作狀態 > 畢業 > 準備中 > 直播中 */
function subLabel(m: RosterMember, live: boolean, locale: string, t: TFunction<'schedule'>): string | null {
    if (m.collab === 'past') return t('roster.pastCollab');
    if (m.collab) return live ? t('roster.live') : t('roster.collab');
    if (m.activity === 'graduate') {
        if (!m.graduated) return t('roster.graduated');
        const date = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(`${m.graduated}T00:00:00`));
        return t('roster.graduatedOn', { date });
    }
    if (m.activity === 'preparing') return t('roster.preparing');
    return live ? t('roster.live') : null;
}

function MemberChip({ m, live, locale }: { m: RosterMember; live: boolean; locale: string }) {
    const { t } = useTranslation('schedule');
    const graduated = m.activity === 'graduate' || m.collab === 'past';
    const sub = subLabel(m, live, locale, t);
    const body = (
        <>
            <span className="relative shrink-0">
                {m.avatar ? (
                    <img src={m.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" className={cn('size-9 rounded-full bg-muted object-cover', graduated && 'opacity-60 grayscale')} />
                ) : (
                    <span className="block size-9 rounded-full bg-muted" aria-hidden="true" />
                )}
                {live && <span className="live-pulse absolute -right-0.5 -top-0.5 size-3 rounded-full bg-[#e5173f] ring-2 ring-background" aria-hidden="true" />}
            </span>
            <span className="min-w-0">
                <span className={cn('block truncate text-[13px] font-medium', graduated ? 'text-muted-foreground' : 'text-foreground')}>{m.name}</span>
                {sub && <span className={cn('block truncate text-[11px]', live && !graduated ? 'font-semibold text-[#e5173f]' : 'text-muted-foreground')}>{sub}</span>}
            </span>
        </>
    );
    const cls = 'flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5';
    if (!m.slug) return <li className={cls}>{body}</li>;
    return (
        <li className="min-w-0">
            <RouteLink
                to={schedulePersonPage(m.slug)}
                className={cn(cls, 'transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
            >
                {body}
            </RouteLink>
        </li>
    );
}

const NO_LIVE: ReadonlySet<string> = new Set();
const GRID = 'grid grid-cols-2 gap-x-2 gap-y-0.5 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]';

/** 收合在區塊底下的次要名單（已畢業、曾合作） */
type FoldKey = 'roster.showGraduated' | 'roster.hideGraduated' | 'roster.showPastCollabs' | 'roster.hidePastCollabs';

function Folded({ members, showKey, hideKey, liveIds, locale }: { members: RosterMember[]; showKey: FoldKey; hideKey: FoldKey; liveIds: ReadonlySet<string>; locale: string }) {
    const { t } = useTranslation('schedule');
    const [open, setOpen] = useState(false);
    if (members.length === 0) return null;
    return (
        <div className="mt-1 px-2">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="inline-flex items-center gap-1 rounded-full py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {t(open ? hideKey : showKey, { count: members.length })}
                <ChevronDown size={13} aria-hidden="true" className={cn('transition-transform duration-200', open && 'rotate-180')} />
            </button>
            {open && (
                <ul className={cn(GRID, '-mx-2 mt-1')}>
                    {members.map((m) => <MemberChip key={m.id} m={m} live={liveIds.has(m.id) && m.collab !== 'past'} locale={locale} />)}
                </ul>
            )}
        </div>
    );
}

function CollabSection({ members, liveIds, locale }: { members: RosterMember[]; liveIds: ReadonlySet<string>; locale: string }) {
    const { t } = useTranslation('schedule');
    const current = members.filter((m) => m.collab === 'active');
    current.sort((a, b) => Number(liveIds.has(b.id)) - Number(liveIds.has(a.id)));
    const past = members.filter((m) => m.collab === 'past');
    return (
        <div>
            <h3 className="mb-1 px-2 text-xs font-semibold text-muted-foreground">
                {t('roster.collabSection')}
                <span className="ml-1.5 font-normal tabular-nums">{current.length}</span>
            </h3>
            {current.length > 0 && (
                <ul className={GRID}>
                    {current.map((m) => <MemberChip key={m.id} m={m} live={liveIds.has(m.id)} locale={locale} />)}
                </ul>
            )}
            <Folded members={past} showKey="roster.showPastCollabs" hideKey="roster.hidePastCollabs" liveIds={liveIds} locale={locale} />
        </div>
    );
}

function Section({ section, showName, liveIds, locale }: { section: RosterSection; showName: boolean; liveIds: ReadonlySet<string>; locale: string }) {
    const current = section.members.filter((m) => m.activity !== 'graduate');
    // 正在直播的排前面，其餘照出道日
    current.sort((a, b) => Number(liveIds.has(b.id)) - Number(liveIds.has(a.id)));
    const graduated = section.members.filter((m) => m.activity === 'graduate').sort((a, b) => (b.graduated ?? '').localeCompare(a.graduated ?? ''));
    return (
        <div>
            {showName && (
                <h3 className="mb-1 px-2 text-xs font-semibold text-muted-foreground">
                    {section.name}
                    <span className="ml-1.5 font-normal tabular-nums">{current.length}</span>
                </h3>
            )}
            {current.length > 0 && (
                <ul className={GRID}>
                    {current.map((m) => <MemberChip key={m.id} m={m} live={liveIds.has(m.id)} locale={locale} />)}
                </ul>
            )}
            <Folded members={graduated} showKey="roster.showGraduated" hideKey="roster.hideGraduated" liveIds={NO_LIVE} locale={locale} />
        </div>
    );
}

export function AgencyRoster({ agency, liveIds }: { agency: string; liveIds: ReadonlySet<string> }) {
    const { t, i18n } = useTranslation('schedule');
    const locale = i18n.language || 'zh-TW';
    const query = useAgencyRoster(agency);
    const [collapsed, setCollapsed] = useState(readCollapsed);
    const roster = query.data;
    const report = useReportDialog();
    const liveCount = roster
        ? [...roster.sections.flatMap((s) => s.members).filter((m) => m.activity !== 'graduate'), ...roster.collaborators.filter((m) => m.collab === 'active')].filter((m) =>
              liveIds.has(m.id),
          ).length
        : 0;
    const nonEmpty = roster?.sections.filter((s) => s.members.length > 0) ?? [];

    const toggle = () => {
        setCollapsed((v) => {
            writeCollapsed(!v);
            return !v;
        });
    };

    if (roster === null) return null; // 查無此公司（舊的篩選值）：不顯示

    return (
        <section aria-labelledby="sch-roster" className="mt-4 rounded-2xl border border-border bg-foreground/[0.02] px-2 py-2 sm:px-3">
            <div className="flex items-start gap-1">
            <h2 id="sch-roster" className="min-w-0 flex-1 px-1">
                <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={!collapsed}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <span className="text-[15px] font-bold text-foreground">{t('roster.title', { agency })}</span>
                    {roster && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                            {t('roster.activeCount', { count: roster.activeCount })}
                            {roster.graduatedCount > 0 && ` · ${t('roster.graduatedCount', { count: roster.graduatedCount })}`}
                            {roster.collabCount > 0 && ` · ${t('roster.collabCount', { count: roster.collabCount })}`}
                            {liveCount > 0 && <span className="font-semibold text-[#e5173f]"> · {t('roster.liveCount', { count: liveCount })}</span>}
                        </span>
                    )}
                    <ChevronDown size={16} aria-hidden="true" className={cn('ml-auto text-muted-foreground transition-transform duration-200', !collapsed && 'rotate-180')} />
                </button>
            </h2>
            {report && roster?.groupId && (
                <button
                    type="button"
                    onClick={() => report.openReport({ kind: 'roster', groupId: roster.groupId!, groupName: agency })}
                    className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Flag size={12} aria-hidden="true" />
                    {t('report.rosterButton')}
                </button>
            )}
            </div>

            {!collapsed && (
                <div className="mt-1 space-y-3">
                    {query.isError ? (
                        <div role="alert" className="flex items-center gap-3 px-2 py-2 text-sm text-muted-foreground">
                            {t('roster.error')}
                            <button
                                type="button"
                                onClick={() => query.refetch()}
                                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-foreground hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <RefreshCw size={12} aria-hidden="true" />
                                {t('state.retry')}
                            </button>
                        </div>
                    ) : !roster ? (
                        <div role="status" aria-busy="true" aria-label={t('roster.loading')} className="grid grid-cols-2 gap-2 px-2 py-1 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
                            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}
                        </div>
                    ) : nonEmpty.length === 0 && roster.collaborators.length === 0 ? (
                        <p className="px-2 py-2 text-sm text-muted-foreground">{t('roster.empty')}</p>
                    ) : (
                        <>
                            {nonEmpty.map((s) => (
                                <Section key={s.name} section={s} showName={nonEmpty.length > 1 || roster.collaborators.length > 0} liveIds={liveIds} locale={locale} />
                            ))}
                            {roster.collaborators.length > 0 && <CollabSection members={roster.collaborators} liveIds={liveIds} locale={locale} />}
                        </>
                    )}
                </div>
            )}
        </section>
    );
}
