// 404 — 依 multistream-hub-design-system 的 Pages.jsx NotFoundPage 重建。
// 漸層 404 數字 + blur orb 背景 + 回首頁 / 前往 Canvas 復原按鈕。

import { useTranslation } from 'react-i18next';
import { Home } from 'lucide-react';
import { BlurOrb } from './ui/ds-primitives';
import { SEO } from './SEO';
import { RouteLink } from './Navigation/RouteLink';

export function NotFoundPage() {
    const { t } = useTranslation('common');

    return (
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden p-6 pt-16 bg-background text-foreground">
            {/* SPA fallback 讓未知路徑仍回 HTTP 200（軟 404）：以 noindex 阻止進索引，並移除 canonical 避免權重誤導向首頁 */}
            <SEO noindex title={`${t('notFound.title')} - MultiStream Hub`} />
            <BlurOrb top="20%" left="50%" w={800} h={400} opacity={0.2} />

            <div className="relative z-[1] text-center max-w-[520px]">
                <div
                    className="font-extrabold leading-none mb-2"
                    style={{
                        fontSize: 144,
                        letterSpacing: '-0.04em',
                        background: 'linear-gradient(135deg, var(--primary), #c084fc)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}
                >
                    404
                </div>
                <h1 className="text-[28px] font-bold mb-3">{t('notFound.title')}</h1>
                <p className="text-base text-muted-foreground mb-8 leading-relaxed">
                    {t('notFound.description')}
                </p>
                <div className="flex gap-3 justify-center flex-wrap">
                    <RouteLink
                        to="home"
                        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                        <Home size={14} /> {t('notFound.backHome')}
                    </RouteLink>
                    <RouteLink
                        to="canvas"
                        className="inline-flex items-center h-9 px-4 rounded-lg text-sm font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
                    >
                        {t('notFound.toCanvas')}
                    </RouteLink>
                </div>
            </div>
        </div>
    );
}
