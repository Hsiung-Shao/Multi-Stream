// VTuber 名錄（/vtubers）：依公司（子團用小標分段）與個人勢列出最近三個月有開台的 VTuber，每人連到個人週表頁。
// 個人頁的樞紐頁：edge（functions/lib/vtuber-directory.js）先把同一份內文注入 #root 給爬蟲，React 掛載後整個換成這裡。
// 分組規則與 edge 共用 functions/lib/directory-group.js；不預渲染（entry-server CSR_ONLY）。SEO／JSON-LD 由 App.tsx 處理。

import { useMemo } from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react';
import { StaticPageHeader } from '../StaticPageHeader';
import { RouteLink } from '../Navigation/RouteLink';
import { SiteFooter } from '../SiteFooter';
import { Button } from '../ui/button';
import { fetchDirectory, type DirectoryPerson } from '../../features/schedule/directorySource';
import { groupDirectory, splitBySubgroup } from '../../../functions/lib/directory-group.js';
import { EmbedScheduleDialog } from '../../features/schedule/EmbedScheduleDialog';
import { Code2 } from 'lucide-react';
import { schedulePersonPage } from '../../config/schedulePerson';

/** 名錄一小時才變一次（edge 也快取 1 小時）：client 端 10 分鐘內不重抓 */
const DIRECTORY_STALE_MS = 10 * 60_000;

const LIST_CLS = 'mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';

/** 純名字連結：RPC 不回頭像（省一半傳輸量），一千多人的名單也不載圖 */
function PersonItem({ person }: { person: DirectoryPerson }) {
    return (
        <li className="min-w-0">
            <RouteLink
                to={schedulePersonPage(person.slug)}
                className="block truncate rounded-lg px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {person.name}
            </RouteLink>
        </li>
    );
}

function SectionHeading({ id, title, count, action }: { id: string; title: string; count: string; action?: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id={id} className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground">{count}</p>
            {action}
        </div>
    );
}

/** 「嵌入這個團的週表」：開共用的產生器（target 為團體 uuid；嵌入端點 /embed/schedule/group/<uuid>） */
function EmbedGroupButton({ id, name }: { id: string; name: string }) {
    const { t } = useTranslation('schedule');
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <Code2 size={12} aria-hidden="true" />
                {t('embed.groupButton')}
            </button>
            {open && <EmbedScheduleDialog open={open} onOpenChange={setOpen} target={{ kind: 'group', id, name }} />}
        </>
    );
}

export default function VtuberDirectoryPage() {
    const { t } = useTranslation('schedule');
    const query = useQuery({
        queryKey: ['schedule-directory'],
        queryFn: ({ signal }) => fetchDirectory({ signal }),
        staleTime: DIRECTORY_STALE_MS,
    });
    const data = query.data;
    const layout = useMemo(() => (data ? groupDirectory(data) : null), [data]);

    return (
        <div className="relative min-h-screen bg-background text-foreground">
            <StaticPageHeader title={t('directory.title')} analyticsCategory="VtuberDirectoryPage" />

            <main className="mx-auto max-w-[1080px] px-4 pb-36 sm:px-6">
                <nav aria-label="Breadcrumb" className="pt-5 text-[13px] text-muted-foreground">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li><RouteLink to="home" className="hover:text-foreground">MultiStream Hub</RouteLink></li>
                        <li aria-hidden="true" className="inline-flex opacity-50"><ChevronRight size={13} /></li>
                        <li><RouteLink to="schedule" className="hover:text-foreground">{t('title')}</RouteLink></li>
                        <li aria-hidden="true" className="inline-flex opacity-50"><ChevronRight size={13} /></li>
                        <li aria-current="page" className="font-medium text-foreground">{t('directory.title')}</li>
                    </ol>
                </nav>

                <header className="pb-5 pt-4">
                    <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight [text-wrap:balance] sm:text-[2.125rem]">{t('directory.title')}</h1>
                    <p className="mt-2 max-w-[65ch] text-[15px] leading-relaxed text-muted-foreground [text-wrap:pretty]">{t('directory.intro')}</p>
                    {data && <p className="mt-1 text-sm text-muted-foreground">{t('directory.count', { count: data.people.length })}</p>}
                </header>

                {/* 預留一屏高：資料到了才把頁尾往下推（首屏外的位移不計 CLS）；錯誤狀態內容短，不預留 */}
                <div className={query.isError && !data ? undefined : 'min-h-svh'}>
                    {layout ? (
                        <div className="space-y-10">
                            {layout.groups.map(({ group, members }) => {
                                const headingId = `directory-group-${group.id}`;
                                return (
                                    <section key={group.id} aria-labelledby={headingId}>
                                        <SectionHeading id={headingId} title={group.name} count={t('directory.count', { count: members.length })} action={<EmbedGroupButton id={group.id} name={group.name} />} />
                                        {splitBySubgroup(members).map(({ subgroup, people }) => (
                                            <div key={subgroup ?? ''}>
                                                {subgroup && <h3 className="mt-4 text-sm font-semibold text-muted-foreground">{subgroup}</h3>}
                                                <ul className={LIST_CLS}>
                                                    {people.map((p) => <PersonItem key={p.slug} person={p} />)}
                                                </ul>
                                            </div>
                                        ))}
                                    </section>
                                );
                            })}
                            {layout.independent.length > 0 && (
                                <section aria-labelledby="directory-independent">
                                    <SectionHeading id="directory-independent" title={t('directory.independent')} count={t('directory.count', { count: layout.independent.length })} />
                                    <ul className={LIST_CLS}>
                                        {layout.independent.map((p) => <PersonItem key={p.slug} person={p} />)}
                                    </ul>
                                </section>
                            )}
                        </div>
                    ) : query.isError ? (
                        <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
                            <AlertTriangle className="text-amber-500" aria-hidden="true" />
                            <p className="font-semibold">{t('directory.error')}</p>
                            <Button variant="outline" onClick={() => query.refetch()}>
                                <RefreshCw size={14} aria-hidden="true" />
                                {t('state.retry')}
                            </Button>
                        </div>
                    ) : (
                        <p role="status" aria-busy="true" className="py-16 text-center text-sm text-muted-foreground">{t('directory.loading')}</p>
                    )}
                </div>

                <SiteFooter analyticsCategory="VtuberDirectoryPage" />
            </main>
        </div>
    );
}
