// 新增 VTuber（/schedule/submit）：使用者推薦還沒在週表上的 VTuber，送出後進後台待審。
// 預渲染只輸出殼層（標題、說明、空白表單）；render 本體不碰 window（?name= 預填在 effect 裡讀）。
// SEO（WebPage + Breadcrumb）由 App.tsx 統一處理。

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { StaticPageHeader } from '../StaticPageHeader';
import { RouteLink } from '../Navigation/RouteLink';
import { SiteFooter } from '../SiteFooter';
import { ContributeForm } from '../../features/contribute/ContributeForm';
import { consumeContributePrefill } from '../../features/contribute/prefill';

export function ScheduleSubmitPage() {
    const { t } = useTranslation('schedule');
    // 從週表「查無結果」進來時預填顯示名稱（站內導覽用 prefill.ts；直接開網址用 ?name=）
    const [initialName, setInitialName] = useState<string | null>(null);
    useEffect(() => {
        setInitialName(consumeContributePrefill() ?? (new URLSearchParams(window.location.search).get('name') || '').trim().slice(0, 100));
    }, []);

    return (
        <div className="relative min-h-screen bg-background text-foreground">
            <StaticPageHeader title={t('contribute.title')} analyticsCategory="ScheduleSubmitPage" />
            <main className="mx-auto max-w-[1080px] px-4 pb-36 sm:px-6">
                <nav aria-label="Breadcrumb" className="pt-5 text-[13px] text-muted-foreground">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li><RouteLink to="home" className="hover:text-foreground">MultiStream Hub</RouteLink></li>
                        <li aria-hidden="true" className="inline-flex opacity-50"><ChevronRight size={13} /></li>
                        <li><RouteLink to="schedule" className="hover:text-foreground">{t('title')}</RouteLink></li>
                        <li aria-hidden="true" className="inline-flex opacity-50"><ChevronRight size={13} /></li>
                        <li aria-current="page" className="font-medium text-foreground">{t('contribute.title')}</li>
                    </ol>
                </nav>

                <header className="pb-6 pt-4">
                    <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight [text-wrap:balance] sm:text-[2.125rem]">{t('contribute.heading')}</h1>
                    <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground [text-wrap:pretty]">{t('contribute.subtitle')}</p>
                </header>

                {/* initialName 讀到之前（預渲染、hydrate 的第一個畫面）先用空白表單；key 讓預填值在讀到後套用一次 */}
                <ContributeForm key={initialName ?? ''} initialName={initialName ?? ''} />

                <SiteFooter analyticsCategory="ScheduleSubmitPage" />
            </main>
        </div>
    );
}
