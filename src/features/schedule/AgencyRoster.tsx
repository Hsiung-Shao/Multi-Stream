// 週表「所屬」選了某家企業勢時，工具列下方的成員名冊（2026-09-29 使用者要求）。
// 依子團分區；現役與準備中在前、已畢業收在每區底下；正在直播的標紅點；點人進個人週表頁。
// 名冊整塊可收合（記在 localStorage，只是便利設定，讀寫失敗就當展開）。

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { cn } from '../../components/ui/utils';
import { Skeleton } from '../../components/ui/skeleton';
import { RouteLink } from '../../components/Navigation/RouteLink';
import { schedulePersonPage } from '../../config/schedulePerson';
import { useAgencyRoster } from './useAgencyRoster';
import type { RosterMember, RosterSection } from './rosterSource';

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

function MemberChip({ m, live, locale }: { m: RosterMember; live: boolean; locale: string }) {
    const { t } = useTranslation('schedule');
    const graduated = m.activity === 'graduate';
    const sub = graduated
        ? m.graduated
            ? t('roster.graduatedOn', { date: new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(`${m.graduated}T00:00:00`)) })
            : t('roster.graduated')
        : m.activity === 'preparing'
          ? t('roster.preparing')
          : live
            ? t('roster.live')
            : null;
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

function Section({ section, showName, liveIds, locale }: { section: RosterSection; showName: boolean; liveIds: ReadonlySet<string>; locale: string }) {
    const { t } = useTranslation('schedule');
    const [showGraduated, setShowGraduated] = useState(false);
    const current = section.members.filter((m) => m.activity !== 'graduate');
    // 正在直播的排前面，其餘照出道日
    current.sort((a, b) => Number(liveIds.has(b.id)) - Number(liveIds.has(a.id)));
    const graduated = section.members.filter((m) => m.activity === 'graduate').sort((a, b) => (b.graduated ?? '').localeCompare(a.graduated ?? ''));
    const grid = 'grid grid-cols-2 gap-x-2 gap-y-0.5 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]';
    return (
        <div>
            {showName && (
                <h3 className="mb-1 px-2 text-xs font-semibold text-muted-foreground">
                    {section.name}
                    <span className="ml-1.5 font-normal tabular-nums">{current.length}</span>
                </h3>
            )}
            {current.length > 0 && (
                <ul className={grid}>
                    {current.map((m) => <MemberChip key={m.id} m={m} live={liveIds.has(m.id)} locale={locale} />)}
                </ul>
            )}
            {graduated.length > 0 && (
                <div className="mt-1 px-2">
                    <button
                        type="button"
                        onClick={() => setShowGraduated((v) => !v)}
                        aria-expanded={showGraduated}
                        className="inline-flex items-center gap-1 rounded-full py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {t(showGraduated ? 'roster.hideGraduated' : 'roster.showGraduated', { count: graduated.length })}
                        <ChevronDown size={13} aria-hidden="true" className={cn('transition-transform duration-200', showGraduated && 'rotate-180')} />
                    </button>
                    {showGraduated && (
                        <ul className={cn(grid, '-mx-2 mt-1')}>
                            {graduated.map((m) => <MemberChip key={m.id} m={m} live={false} locale={locale} />)}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

export function AgencyRoster({ agency, liveIds }: { agency: string; liveIds: ReadonlySet<string> }) {
    const { t, i18n } = useTranslation('schedule');
    const locale = i18n.language || 'zh-TW';
    const query = useAgencyRoster(agency);
    const [collapsed, setCollapsed] = useState(readCollapsed);
    const roster = query.data;
    const liveCount = roster ? roster.sections.flatMap((s) => s.members).filter((m) => m.activity !== 'graduate' && liveIds.has(m.id)).length : 0;
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
            <h2 id="sch-roster" className="px-1">
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
                            {liveCount > 0 && <span className="font-semibold text-[#e5173f]"> · {t('roster.liveCount', { count: liveCount })}</span>}
                        </span>
                    )}
                    <ChevronDown size={16} aria-hidden="true" className={cn('ml-auto text-muted-foreground transition-transform duration-200', !collapsed && 'rotate-180')} />
                </button>
            </h2>

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
                    ) : nonEmpty.length === 0 ? (
                        <p className="px-2 py-2 text-sm text-muted-foreground">{t('roster.empty')}</p>
                    ) : (
                        nonEmpty.map((s) => <Section key={s.name} section={s} showName={nonEmpty.length > 1} liveIds={liveIds} locale={locale} />)
                    )}
                </div>
            )}
        </section>
    );
}
