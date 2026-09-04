// 開發者頁（/about/creator）：E-E-A-T 用的獨立作者頁——誰做的、為什麼做、專案事實、可驗證的社群連結。
// 對應 schema：ProfilePage + Person(@id …/about/creator#person)，由 App.tsx 的 <SEO jsonLd> 注入；
// index.html 的 Organization.founder / WebApplication.creator 以同一個 @id 指向這裡。
// 版面沿用 About 的 creator 卡風格（字母頭像、漸層卡）；SEO 由 App.tsx 統一處理，本元件不自帶。

import { useTranslation } from 'react-i18next';
import { Github, MessageCircle, Coffee, HeartHandshake, AtSign, ChevronRight, Rocket, CodeXml, Tag } from 'lucide-react';
import { StaticPageHeader } from '../StaticPageHeader';
import { RouteLink } from '../Navigation/RouteLink';
import { SiteFooter } from '../SiteFooter';
import { BlurOrb } from '../ui/ds-primitives';
import { logEvent } from '../../utils/analytics';
import { GITHUB_URL, DISCORD_URL, X_URL, COFFEE_URL, PATREON_URL } from '../../config/links';

type TFn = (key: string, options?: Record<string, unknown>) => string;

export const CREATOR_NAME = 'Hsiung-Shao';

export function CreatorPage() {
    const { t } = useTranslation(['about', 'common']);
    const tx = t as unknown as TFn;

    const socials = [
        { key: 'github', href: GITHUB_URL, Icon: Github, label: 'GitHub', cls: 'primary' },
        { key: 'discord', href: DISCORD_URL, Icon: MessageCircle, label: 'Discord', cls: 'ghost' },
        { key: 'twitter', href: X_URL, Icon: AtSign, label: 'X', cls: 'ghost' },
        { key: 'patreon', href: PATREON_URL, Icon: HeartHandshake, label: 'Patreon', cls: 'patreon' },
        { key: 'coffee', href: COFFEE_URL, Icon: Coffee, label: 'Buy Me a Coffee', cls: 'coffee' },
    ];

    const facts = [
        { Icon: Rocket, text: tx('about:creator.factLaunched') },
        { Icon: Tag, text: tx('about:creator.factVersion', { version: __APP_VERSION__ }) },
        { Icon: CodeXml, text: tx('about:creator.factOpenSource') },
    ];

    return (
        <div className="cr-page">
            <style dangerouslySetInnerHTML={{ __html: `
                .cr-page { position: relative; min-height: 100vh; overflow: clip; background: var(--background); color: var(--foreground); font-family: var(--font-sans); }
                .cr-wrap { position: relative; z-index: 1; max-width: 760px; margin: 0 auto; padding: 24px 24px 96px; }
                .cr-crumbs { font-size: 13px; color: var(--muted-foreground); margin-bottom: 28px; }
                .cr-crumbs ol { list-style: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0; padding: 0; }
                .cr-crumbs a { color: var(--muted-foreground); text-decoration: none; }
                .cr-crumbs a:hover { color: var(--foreground); }
                .cr-crumbs li[aria-current="page"] { color: var(--foreground); font-weight: 600; }
                .cr-crumbs li[aria-hidden] { display: inline-flex; opacity: 0.5; }
                .cr-hero { display: flex; gap: 22px; align-items: center; flex-wrap: wrap; }
                .cr-avatar { width: 88px; height: 88px; border-radius: 24px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, oklch(0.63 0.23 304), #c084fc); font-size: 38px; font-weight: 800; color: #fff; box-shadow: 0 16px 36px -12px oklch(0.63 0.23 304 / 0.6); }
                .cr-eyebrow { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; color: #c084fc; }
                .cr-name { font-size: 36px; font-weight: 800; letter-spacing: -0.02em; margin: 4px 0 2px; line-height: 1.1; }
                .cr-role { font-size: 14px; color: var(--muted-foreground); font-weight: 600; }
                .cr-desc { font-size: 16px; color: var(--muted-foreground); line-height: 1.75; margin: 24px 0 0; }
                .cr-section { margin-top: 44px; }
                .cr-h2 { font-size: 20px; font-weight: 700; margin: 0 0 12px; }
                .cr-why { font-size: 15.5px; line-height: 1.8; color: var(--foreground); margin: 0; padding: 22px 24px; border-radius: 18px; background: linear-gradient(135deg, oklch(0.63 0.23 304 / 0.1), oklch(0.21 0.034 264.665 / 0.5)); border: 1px solid oklch(0.63 0.23 304 / 0.18); }
                .cr-facts { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
                .cr-fact { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 14px; background: oklch(0.21 0.034 264.665 / 0.45); border: 1px solid rgba(255,255,255,0.06); font-size: 14.5px; }
                .cr-fact svg { color: #c084fc; flex-shrink: 0; }
                .cr-fact a { color: var(--foreground); text-decoration: underline; text-underline-offset: 3px; }
                .cr-socials { display: flex; gap: 12px; flex-wrap: wrap; }
                .cr-social { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 9999px; text-decoration: none; font-size: 14px; font-weight: 600; transition: transform .2s ease; color: var(--foreground); }
                .cr-social:hover { transform: translateY(-2px); }
                .cr-social.primary { background: var(--primary); color: #fff; }
                .cr-social.ghost { background: oklch(0.21 0.034 264.665 / 0.5); border: 1px solid rgba(255,255,255,0.1); }
                .cr-social.coffee { background: linear-gradient(90deg, #ec4899 0%, #9333ea 100%); color: #fff; }
                .cr-social.patreon { background: #ff424d; color: #fff; }
                @media (max-width: 560px) { .cr-name { font-size: 28px; } .cr-avatar { width: 72px; height: 72px; font-size: 30px; } }
            ` }} />

            <StaticPageHeader title={tx('about:creator.pageTitle')} analyticsCategory="CreatorPage" />
            <BlurOrb top={-140} left="50%" w={700} h={420} color="oklch(0.63 0.23 304)" opacity={0.14} />

            <main className="cr-wrap">
                <nav className="cr-crumbs" aria-label="Breadcrumb">
                    <ol>
                        <li><RouteLink to="home">MultiStream Hub</RouteLink></li>
                        <li aria-hidden="true"><ChevronRight size={13} /></li>
                        <li><RouteLink to="about">{tx('about:title')}</RouteLink></li>
                        <li aria-hidden="true"><ChevronRight size={13} /></li>
                        <li aria-current="page">{tx('about:creator.pageTitle')}</li>
                    </ol>
                </nav>

                <header className="cr-hero">
                    <div className="cr-avatar" aria-hidden="true">{CREATOR_NAME[0]}</div>
                    <div>
                        <div className="cr-eyebrow">{tx('about:creatorEyebrow', { defaultValue: 'Creator' })}</div>
                        <h1 className="cr-name">{CREATOR_NAME}</h1>
                        {/* 暱稱「宅熊」：站內第一人稱以此自稱，schema 以 alternateName 對應 */}
                        <div className="cr-role">{tx('about:creator.nickname')} · {tx('about:creatorRole')}</div>
                    </div>
                </header>
                <p className="cr-desc">{tx('about:creatorDesc')}</p>

                <section className="cr-section">
                    <h2 className="cr-h2">{tx('about:creator.whyTitle')}</h2>
                    <p className="cr-why">{tx('about:creator.why')}</p>
                </section>

                <section className="cr-section">
                    <h2 className="cr-h2">{tx('about:creator.factsTitle')}</h2>
                    <ul className="cr-facts">
                        {facts.map(({ Icon, text }, i) => (
                            <li key={i} className="cr-fact">
                                <Icon size={16} />
                                {i === 2
                                    ? <span>{text} — <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a></span>
                                    : <span>{text}</span>}
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="cr-section">
                    <h2 className="cr-h2">{tx('about:creator.linksTitle')}</h2>
                    <div className="cr-socials">
                        {socials.map(({ key, href, Icon, label, cls }) => (
                            <a
                                key={key}
                                className={`cr-social ${cls}`}
                                href={href}
                                target="_blank"
                                rel={key === 'discord' ? 'noopener noreferrer' : 'me noopener noreferrer'}
                                onClick={() => logEvent('CreatorPage', 'click_social', key)}
                            >
                                <Icon size={16} /> {label}
                            </a>
                        ))}
                    </div>
                </section>

                <SiteFooter analyticsCategory="CreatorPage" />
            </main>
        </div>
    );
}

export default CreatorPage;
