// 比較頁（/compare）：MultiStream Hub vs MultiTwitch vs TwitchTheater vs Multistre.am。
// 目標關鍵字「MultiTwitch 替代方案 / multitwitch alternative」由 title/H1 帶；URL 刻意用 /compare（日後加競品不改 URL）。
// 誠實比較：包含「該選競品」的情境；競品事實依 2026-08 各站公開頁面（compare:asOf），每季複查。
// 競品連結 rel="nofollow noopener noreferrer"。SEO（WebPage + FAQPage + Breadcrumb）由 App.tsx 統一處理。

import { useTranslation } from 'react-i18next';
import { Scale, ExternalLink, ArrowRight, ChevronRight, Check, Minus } from 'lucide-react';
import { StaticPageHeader } from '../StaticPageHeader';
import { RouteLink } from '../Navigation/RouteLink';
import { SiteFooter } from '../SiteFooter';
import { BlurOrb } from '../ui/ds-primitives';
import { Button } from '../ui/button';
import { logEvent } from '../../utils/analytics';
import { COMPARE_FAQ_COUNT } from './comparisonMeta';

type TFn = (key: string, options?: Record<string, unknown>) => string;

/** 比較表的產品欄（順序固定：本站在最前） */
export const COMPARE_PRODUCTS = [
    { key: 'msh', url: null },
    { key: 'multitwitch', url: 'https://www.multitwitch.tv/' },
    { key: 'twitchtheater', url: 'https://twitchtheater.tv/' },
    { key: 'multistream', url: 'https://multistre.am/' },
] as const;

/** 比較準則（對應 compare:row.<key>.*） */
export const COMPARE_ROWS = [
    'platforms', 'maxStreams', 'layout', 'multiChat', 'volume', 'share', 'favorites', 'languages', 'mobile', 'account', 'price',
] as const;

// 「否 / 無 / 有限」類的值畫灰色減號，其餘畫綠勾；只影響視覺，文字仍完整輸出
const NEGATIVE = /^(否|No|아니오|なし|不要|Limited|有限|限定的|제한적|N\/A)$/i;

export function ComparisonPage() {
    const { t } = useTranslation(['compare', 'common']);
    const tx = t as unknown as TFn;

    const productLabel = (key: string) => tx(`compare:col.${key}`);

    return (
        <div className="cmp-page">
            <style>{`
                .cmp-page { position: relative; min-height: 100vh; overflow: clip; background: var(--background); color: var(--foreground); font-family: var(--font-sans); }
                .cmp-wrap { position: relative; z-index: 1; max-width: 1040px; margin: 0 auto; padding: 24px 24px 96px; }
                .cmp-crumbs { font-size: 13px; color: var(--muted-foreground); margin-bottom: 28px; }
                .cmp-crumbs ol { list-style: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0; padding: 0; }
                .cmp-crumbs a { color: var(--muted-foreground); text-decoration: none; }
                .cmp-crumbs a:hover { color: var(--foreground); }
                .cmp-crumbs li[aria-current="page"] { color: var(--foreground); font-weight: 600; }
                .cmp-crumbs li[aria-hidden] { display: inline-flex; opacity: 0.5; }
                .cmp-hero { text-align: center; padding: 16px 0 12px; }
                .cmp-badge { width: 72px; height: 72px; border-radius: 22px; margin: 0 auto 22px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, oklch(0.63 0.23 304), #c084fc); box-shadow: 0 24px 56px -16px oklch(0.63 0.23 304 / 0.7); color: #fff; }
                .cmp-eyebrow { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; color: #c084fc; }
                .cmp-h1 { font-size: 40px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.12; margin: 12px auto 0; max-width: 820px; }
                .cmp-sub { font-size: 17px; color: var(--muted-foreground); line-height: 1.7; max-width: 720px; margin: 18px auto 0; }
                .cmp-asof { font-size: 12.5px; color: var(--muted-foreground); opacity: 0.8; margin: 14px auto 0; max-width: 720px; }
                .cmp-section { margin-top: 52px; }
                .cmp-h2 { font-size: 22px; font-weight: 700; margin: 0 0 16px; }
                .cmp-table-wrap { overflow-x: auto; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); background: oklch(0.21 0.034 264.665 / 0.35); }
                .cmp-table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 720px; }
                .cmp-table caption { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
                .cmp-table th, .cmp-table td { padding: 12px 14px; text-align: left; vertical-align: top; border-bottom: 1px solid rgba(255,255,255,0.06); }
                .cmp-table thead th { font-size: 13px; font-weight: 700; color: var(--muted-foreground); background: rgba(255,255,255,0.03); }
                .cmp-table thead th.msh { color: #c084fc; }
                .cmp-table tbody th { font-weight: 600; color: var(--foreground); white-space: nowrap; }
                .cmp-table td.msh { background: oklch(0.63 0.23 304 / 0.08); font-weight: 600; }
                .cmp-table tbody tr:last-child th, .cmp-table tbody tr:last-child td { border-bottom: 0; }
                .cmp-cell { display: inline-flex; align-items: flex-start; gap: 7px; }
                .cmp-cell svg { flex-shrink: 0; margin-top: 2px; }
                .cmp-cell.pos svg { color: #4ade80; }
                .cmp-cell.neg svg { color: var(--muted-foreground); opacity: 0.7; }
                .cmp-table a { color: inherit; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
                .cmp-table a:hover { color: var(--foreground); text-decoration: underline; }
                .cmp-picks { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
                .cmp-pick { padding: 18px; border-radius: 16px; background: oklch(0.21 0.034 264.665 / 0.45); border: 1px solid rgba(255,255,255,0.06); font-size: 14.5px; line-height: 1.65; color: var(--muted-foreground); }
                .cmp-pick strong { display: block; color: var(--foreground); margin-bottom: 6px; font-size: 15px; }
                .cmp-pick.msh { background: linear-gradient(135deg, oklch(0.63 0.23 304 / 0.14), oklch(0.21 0.034 264.665 / 0.5)); border-color: oklch(0.63 0.23 304 / 0.3); }
                .cmp-faq { display: grid; gap: 10px; }
                .cmp-faq details { border-radius: 14px; background: oklch(0.21 0.034 264.665 / 0.45); border: 1px solid rgba(255,255,255,0.06); padding: 0 18px; }
                .cmp-faq summary { cursor: pointer; padding: 14px 0; font-weight: 600; list-style: none; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
                .cmp-faq summary::-webkit-details-marker { display: none; }
                .cmp-faq summary::after { content: '+'; color: #c084fc; font-size: 18px; }
                .cmp-faq details[open] summary::after { content: '−'; }
                .cmp-faq p { margin: 0; padding: 0 0 16px; color: var(--muted-foreground); line-height: 1.7; font-size: 14.5px; }
                .cmp-cta { margin-top: 56px; text-align: center; padding: 36px 24px; border-radius: 22px; background: linear-gradient(135deg, oklch(0.63 0.23 304 / 0.16), oklch(0.21 0.034 264.665 / 0.5)); border: 1px solid oklch(0.63 0.23 304 / 0.3); }
                .cmp-cta h2 { font-size: 24px; font-weight: 800; margin: 0 0 8px; }
                .cmp-cta p { color: var(--muted-foreground); margin: 0 0 20px; }
                .cmp-disclaimer { margin-top: 28px; font-size: 12px; color: var(--muted-foreground); opacity: 0.75; text-align: center; }
                @media (max-width: 640px) { .cmp-h1 { font-size: 28px; } .cmp-sub { font-size: 15px; } }
            `}</style>

            <StaticPageHeader title={tx('compare:title')} analyticsCategory="ComparisonPage" />
            <BlurOrb top={-160} left="50%" w={760} h={460} color="oklch(0.63 0.23 304)" opacity={0.14} />

            <main className="cmp-wrap">
                <nav className="cmp-crumbs" aria-label="Breadcrumb">
                    <ol>
                        <li><RouteLink to="home">MultiStream Hub</RouteLink></li>
                        <li aria-hidden="true"><ChevronRight size={13} /></li>
                        <li aria-current="page">{tx('compare:title')}</li>
                    </ol>
                </nav>

                <header className="cmp-hero">
                    <div className="cmp-badge" aria-hidden="true"><Scale size={34} /></div>
                    <div className="cmp-eyebrow">{tx('compare:hero.eyebrow')}</div>
                    <h1 className="cmp-h1">{tx('compare:hero.title')}</h1>
                    <p className="cmp-sub">{tx('compare:hero.subtitle')}</p>
                    <p className="cmp-asof">{tx('compare:asOf')}</p>
                </header>

                <section className="cmp-section" aria-labelledby="cmp-table-h">
                    <h2 id="cmp-table-h" className="cmp-h2">{tx('compare:table.caption')}</h2>
                    <div className="cmp-table-wrap">
                        <table className="cmp-table">
                            <caption>{tx('compare:table.caption')}</caption>
                            <thead>
                                <tr>
                                    <th scope="col">{tx('compare:col.feature')}</th>
                                    {COMPARE_PRODUCTS.map((p) => (
                                        <th scope="col" key={p.key} className={p.key === 'msh' ? 'msh' : undefined}>
                                            {p.url ? (
                                                <a
                                                    href={p.url}
                                                    target="_blank"
                                                    rel="nofollow noopener noreferrer"
                                                    onClick={() => logEvent('ComparisonPage', 'click_competitor', p.key)}
                                                >
                                                    {productLabel(p.key)} <ExternalLink size={12} />
                                                </a>
                                            ) : productLabel(p.key)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {COMPARE_ROWS.map((row) => (
                                    <tr key={row}>
                                        <th scope="row">{tx(`compare:row.${row}`)}</th>
                                        {COMPARE_PRODUCTS.map((p) => {
                                            const v = tx(`compare:row.${row}.${p.key}`);
                                            const neg = NEGATIVE.test(v.trim());
                                            return (
                                                <td key={p.key} className={p.key === 'msh' ? 'msh' : undefined}>
                                                    <span className={`cmp-cell ${neg ? 'neg' : 'pos'}`}>
                                                        {neg ? <Minus size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                                                        {v}
                                                    </span>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="cmp-section" aria-labelledby="cmp-pick-h">
                    <h2 id="cmp-pick-h" className="cmp-h2">{tx('compare:pick.title')}</h2>
                    <div className="cmp-picks">
                        {(['multitwitch', 'multistream', 'twitchtheater', 'msh'] as const).map((k) => (
                            <div key={k} className={`cmp-pick${k === 'msh' ? ' msh' : ''}`}>
                                <strong>{productLabel(k)}</strong>
                                {tx(`compare:pick.${k}`)}
                            </div>
                        ))}
                    </div>
                </section>

                <section className="cmp-section" aria-labelledby="cmp-faq-h">
                    <h2 id="cmp-faq-h" className="cmp-h2">{tx('compare:faq.title')}</h2>
                    <div className="cmp-faq">
                        {Array.from({ length: COMPARE_FAQ_COUNT }, (_, i) => i + 1).map((n) => (
                            <details key={n} open={n === 1}>
                                <summary>{tx(`compare:faq.q${n}`)}</summary>
                                <p>{tx(`compare:faq.a${n}`)}</p>
                            </details>
                        ))}
                    </div>
                </section>

                <section className="cmp-cta">
                    <h2>{tx('compare:cta.title')}</h2>
                    <p>{tx('compare:cta.subtitle')}</p>
                    <Button asChild size="lg" className="rounded-full px-8">
                        <RouteLink to="canvas" onClick={() => logEvent('ComparisonPage', 'click_cta', 'canvas')}>
                            {tx('compare:cta.button')} <ArrowRight size={16} />
                        </RouteLink>
                    </Button>
                </section>

                <p className="cmp-disclaimer">{tx('compare:disclaimer')}</p>

                <SiteFooter analyticsCategory="ComparisonPage" />
            </main>
        </div>
    );
}

export default ComparisonPage;
