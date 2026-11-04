// 頁尾前的「相關頁面」：靜態頁之間互相連結（SEO 內部連結圖），連結一律走 RouteLink，自動帶語言前綴（/zh-TW/...）。
// 會在 Node 預渲染：render 本體只用 useTranslation，不碰 window。

import { useTranslation } from 'react-i18next';
import { RouteLink } from './Navigation/RouteLink';
import type { RoutePage } from '../config/routes';
import type { GuidePage } from '../config/guides';
import { cn } from './ui/utils';

export interface RelatedLink {
    to: RoutePage | GuidePage;
    label: string;
}

/** className：外層排版（寬度／內距）由各頁決定，各頁容器不同 */
export function RelatedLinks({ links, className }: { links: RelatedLink[]; className?: string }) {
    const { t } = useTranslation('common');
    if (links.length === 0) return null;
    return (
        <nav aria-labelledby="related-links-h" className={cn('mt-16', className)}>
            <h2 id="related-links-h" className="mb-3 text-sm font-semibold text-foreground">{t('related.title')}</h2>
            <ul className="flex flex-wrap gap-2">
                {links.map((l) => (
                    <li key={l.to}>
                        <RouteLink
                            to={l.to}
                            className="inline-flex min-h-9 items-center rounded-full border border-border px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {l.label}
                        </RouteLink>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
