// 開台週表（/schedule）：公共週表＋收藏範圍＋勾選一鍵多開。
// 資料來自排程 Edge Function 發布的 snapshot（features/schedule/snapshotSource.ts）。
// 預渲染只輸出殼層（H1、說明、資料來源段落）；snapshot 在 client 端由 TanStack Query 抓，
// 所以 render 本體不碰 window／localStorage（見 memory project_ssg_prerender_202609「改靜態頁必守」）。
// SEO（CollectionPage + Breadcrumb）由 App.tsx 統一處理。設計脈絡見 PRODUCT.md。

import { useTranslation } from 'react-i18next';
import { ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react';
import { StaticPageHeader } from '../StaticPageHeader';
import { RouteLink } from '../Navigation/RouteLink';
import { SiteFooter } from '../SiteFooter';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { useScheduleSnapshot } from '../../features/schedule/useScheduleSnapshot';
import { ScheduleBoard } from '../../features/schedule/ScheduleBoard';
import { formatRelative } from '../../features/schedule/formatTime';

function LoadingState({ label }: { label: string }) {
    return (
        <div aria-busy="true" aria-label={label}>
            <div className="-mx-4 flex gap-2 border-b border-border px-4 py-2.5 sm:-mx-6 sm:px-6">
                <Skeleton className="h-8 w-40 rounded-full" />
                <Skeleton className="h-8 w-64 rounded-full" />
            </div>
            <Skeleton className="mb-3 mt-6 h-6 w-32" />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-4 gap-y-5">
                {Array.from({ length: 5 }, (_, i) => (
                    <div key={i}>
                        <Skeleton className="aspect-video w-full rounded-lg" />
                        <div className="mt-2 flex gap-2.5">
                            <Skeleton className="size-10 rounded-full" />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-3.5 w-2/3" />
                                <Skeleton className="h-3 w-full" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function SchedulePage() {
    const { t, i18n } = useTranslation('schedule');
    const locale = i18n.language || 'zh-TW';
    const query = useScheduleSnapshot();
    const snapshot = query.data;

    return (
        <div className="relative min-h-screen bg-background text-foreground">
            <StaticPageHeader title={t('title')} analyticsCategory="SchedulePage" />

            <main className="mx-auto max-w-[1280px] px-4 pb-36 sm:px-6">
                <nav aria-label="Breadcrumb" className="pt-5 text-[13px] text-muted-foreground">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li><RouteLink to="home" className="hover:text-foreground">MultiStream Hub</RouteLink></li>
                        <li aria-hidden="true" className="inline-flex opacity-50"><ChevronRight size={13} /></li>
                        <li aria-current="page" className="font-medium text-foreground">{t('title')}</li>
                    </ol>
                </nav>

                <header className="pb-5 pt-4">
                    <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight [text-wrap:balance] sm:text-[2.125rem]">{t('hero.title')}</h1>
                    <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground [text-wrap:pretty]">{t('hero.subtitle')}</p>
                    {snapshot && (
                        <p className="mt-2 text-xs text-muted-foreground">
                            {t('state.updatedAt', { time: formatRelative(snapshot.generated_at, Date.now(), locale) })}
                        </p>
                    )}
                </header>

                {snapshot && query.isError && (
                    <div role="status" className="mb-3 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
                        <AlertTriangle size={16} className="shrink-0 text-amber-500" aria-hidden="true" />
                        <span className="flex-1">{t('state.errorStale')}</span>
                        <Button size="sm" variant="ghost" onClick={() => query.refetch()}>
                            <RefreshCw size={14} aria-hidden="true" />
                            {t('state.retry')}
                        </Button>
                    </div>
                )}

                {snapshot ? (
                    <ScheduleBoard snapshot={snapshot} />
                ) : query.isError ? (
                    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
                        <AlertTriangle className="text-amber-500" aria-hidden="true" />
                        <p className="font-semibold">{t('state.error')}</p>
                        <Button variant="outline" onClick={() => query.refetch()}>
                            <RefreshCw size={14} aria-hidden="true" />
                            {t('state.retry')}
                        </Button>
                    </div>
                ) : (
                    <LoadingState label={t('state.loading')} />
                )}

                <section aria-labelledby="schedule-about-h" className="mt-16 max-w-[65ch] border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground">
                    <h2 id="schedule-about-h" className="mb-2 text-sm font-semibold text-foreground">{t('about.title')}</h2>
                    <p>{t('about.body')}</p>
                    <p className="mt-2">{t('about.tz')}</p>
                </section>

                <SiteFooter analyticsCategory="SchedulePage" />
            </main>
        </div>
    );
}
