// 全站共用頁尾。
// 之前八個靜態頁各自手寫一份 footer(首頁、關於、FAQ、隱私、支持、比較、開發者),教學頁甚至沒有,
// 每頁能走到的連結都不一樣;/compare 與 /about/creator 在桌機上原本沒有任何來自首頁的內部連結。
// 這裡把「站內導覽 + Discord + 版權/免責」收成單一元件,新頁面掛上就齊全,爬蟲從任一頁都走得完全站。
// 不放:意見回饋(右下角 FeedbackFAB 已是全站)、GitHub(首頁 header 已有)、開發者頁(About 頁內文有兩處連過去)。
//
// 語言切換不在這裡:靜態頁的 StaticPageHeader 已有;首頁沒有那個 header,所以它把切換器當 children 塞進來。

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RouteLink } from './Navigation/RouteLink';
import type { RoutePage } from '../config/routes';
import { DISCORD_URL } from '../config/links';
import { logEvent } from '../utils/analytics';
import { cn } from './ui/utils';

interface SiteFooterProps {
    /** 版權列下方的額外內容(首頁放語言切換器) */
    children?: ReactNode;
    className?: string;
    /** GA 事件 category,沿用各頁既有命名以維持報表連續性 */
    analyticsCategory?: string;
}

type TFn = (key: string, options?: Record<string, unknown>) => string;

const LINK_CLS = 'text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors';

export function SiteFooter({ children, className, analyticsCategory = 'SiteFooter' }: SiteFooterProps) {
    const { t } = useTranslation(['common', 'compare']);
    // i18next 此版型別不接受 'ns:key' 前綴字串,沿用專案慣例以 cast 繞過
    const tx = t as unknown as TFn;
    const track = (label: string) => logEvent(analyticsCategory, 'footer_click', label);

    const routes: { to: RoutePage; label: string }[] = [
        { to: 'about', label: tx('common:landing.footer.about') },
        { to: 'instructions', label: tx('common:landing.footer.tutorial') },
        { to: 'faq', label: tx('common:landing.footer.faq') },
        { to: 'compare', label: tx('compare:title') },
        { to: 'support', label: tx('common:landing.footer.support') },
        { to: 'privacy', label: tx('common:landing.footer.privacy') },
    ];

    return (
        <footer className={cn('mt-16 border-t border-white/10 py-8 text-center text-sm text-muted-foreground', className)}>
            <div className="container mx-auto flex flex-col gap-5 px-4">
                <nav
                    aria-label={tx('common:landing.footer.nav')}
                    className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
                >
                    {routes.map((r) => (
                        <RouteLink key={r.to} to={r.to} className={LINK_CLS} onClick={() => track(r.to)}>
                            {r.label}
                        </RouteLink>
                    ))}
                    <a
                        href={DISCORD_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={LINK_CLS}
                        onClick={() => track('discord')}
                    >
                        Discord
                    </a>
                </nav>

                <div className="flex flex-col gap-2">
                    <p>{tx('common:landing.footer.copyright')}</p>
                    <p className="mx-auto max-w-2xl text-xs">{tx('common:landing.footer.disclaimer')}</p>
                </div>

                {children && <div className="flex justify-center">{children}</div>}
            </div>
        </footer>
    );
}
