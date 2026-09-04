// 支持頁（/support）：Patreon 每月贊助 + Buy Me a Coffee 一次性贊助 + ExitLag 聯盟連結（含聯盟揭露）+ 其他支持方式。
// 版面沿用靜態頁慣例：StaticPageHeader + BlurOrb + 卡片區 + 頁尾 RouteLink。

import { useTranslation } from 'react-i18next';
import { Coffee, Zap, MessageCircle, Share2, Heart, HeartHandshake, ExternalLink } from 'lucide-react';
import { StaticPageHeader } from './StaticPageHeader';
import { SiteFooter } from './SiteFooter';
import { BlurOrb } from './ui/ds-primitives';
import { logEvent } from '../utils/analytics';
import { COFFEE_URL, PATREON_URL, EXITLAG_AFFILIATE_URL, DISCORD_URL } from '../config/links';

type TFn = (key: string, options?: Record<string, unknown>) => string;


export function SupportPage() {
    const { t } = useTranslation(['support', 'common', 'about']);
    const tx = t as unknown as TFn;

    return (
        <div className="relative min-h-screen bg-background text-foreground overflow-hidden">
            <StaticPageHeader title={tx('support:title')} analyticsCategory="SupportPage" />
            <BlurOrb top="10%" left="50%" w={900} h={420} opacity={0.18} />

            <main className="relative z-[1] max-w-3xl mx-auto px-6 pb-16">
                {/* Hero */}
                <header className="text-center pt-14 pb-10">
                    <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-primary/15 text-primary mb-5">
                        <Heart size={26} />
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold mb-4">{tx('support:hero.title')}</h1>
                    <p className="text-muted-foreground leading-relaxed max-w-xl mx-auto">
                        {tx('support:hero.subtitle')}
                    </p>
                </header>

                {/* Patreon（每月贊助，排最前） */}
                <section className="rounded-2xl border border-[#ff424d]/30 bg-[#ff424d]/[0.07] backdrop-blur p-6 md:p-8 mb-6">
                    <div className="flex items-start gap-4">
                        <span className="shrink-0 size-11 rounded-xl flex items-center justify-center bg-[#ff424d]/20 text-[#ff424d]">
                            <HeartHandshake size={22} />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-lg font-semibold mb-1.5">{tx('support:patreon.title')}</h2>
                            <p className="text-sm text-muted-foreground leading-relaxed mb-4">{tx('support:patreon.desc')}</p>
                            <a
                                href={PATREON_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => logEvent('SupportPage', 'click_support', 'patreon')}
                                className="inline-flex items-center gap-2 h-10 px-5 rounded-lg text-sm font-semibold text-white bg-[#ff424d] hover:bg-[#e63b45] transition-colors"
                            >
                                <HeartHandshake size={15} /> {tx('support:patreon.cta')} <ExternalLink size={13} />
                            </a>
                        </div>
                    </div>
                </section>

                {/* Buy Me a Coffee */}
                <section className="rounded-2xl border border-border bg-card/60 backdrop-blur p-6 md:p-8 mb-6">
                    <div className="flex items-start gap-4">
                        <span className="shrink-0 size-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-pink-500/20 to-purple-500/20 text-pink-400">
                            <Coffee size={22} />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-lg font-semibold mb-1.5">{tx('support:coffee.title')}</h2>
                            <p className="text-sm text-muted-foreground leading-relaxed mb-4">{tx('support:coffee.desc')}</p>
                            <a
                                href={COFFEE_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => logEvent('SupportPage', 'click_support', 'coffee')}
                                className="inline-flex items-center gap-2 h-10 px-5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-pink-500 to-purple-600 hover:opacity-90 transition-opacity"
                            >
                                <Coffee size={15} /> {tx('support:coffee.cta')} <ExternalLink size={13} />
                            </a>
                        </div>
                    </div>
                </section>

                {/* ExitLag 聯盟 */}
                <section className="rounded-2xl border border-orange-500/30 bg-orange-500/[0.07] backdrop-blur p-6 md:p-8 mb-6">
                    <div className="flex items-start gap-4">
                        <span className="shrink-0 size-11 rounded-xl flex items-center justify-center bg-orange-500/20 text-orange-500">
                            <Zap size={22} />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-lg font-semibold mb-1.5">{tx('support:affiliate.title')}</h2>
                            <p className="text-sm text-muted-foreground leading-relaxed mb-4">{tx('support:affiliate.desc')}</p>
                            <a
                                href={EXITLAG_AFFILIATE_URL}
                                target="_blank"
                                rel="sponsored noopener noreferrer"
                                onClick={() => logEvent('SupportPage', 'click_affiliate', 'exitlag')}
                                className="inline-flex items-center gap-2 h-10 px-5 rounded-lg text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 transition-colors"
                            >
                                <Zap size={15} /> {tx('support:affiliate.cta')} <ExternalLink size={13} />
                            </a>
                            <p className="text-[11px] text-muted-foreground/70 mt-3 leading-relaxed">
                                {tx('support:affiliate.disclosure')}
                            </p>
                        </div>
                    </div>
                </section>

                {/* 其他支持方式 */}
                <section className="mb-10">
                    <h2 className="text-base font-semibold text-muted-foreground mb-4">{tx('support:other.title')}</h2>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <a
                            href={DISCORD_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => logEvent('SupportPage', 'click_support', 'discord')}
                            className="rounded-xl border border-border bg-card/50 p-5 hover:bg-card/80 transition-colors"
                        >
                            <span className="inline-flex items-center gap-2 font-medium mb-1.5 text-indigo-400">
                                <MessageCircle size={16} /> {tx('support:other.discord.title')}
                            </span>
                            <p className="text-sm text-muted-foreground leading-relaxed">{tx('support:other.discord.desc')}</p>
                        </a>
                        <div className="rounded-xl border border-border bg-card/50 p-5">
                            <span className="inline-flex items-center gap-2 font-medium mb-1.5 text-emerald-400">
                                <Share2 size={16} /> {tx('support:other.share.title')}
                            </span>
                            <p className="text-sm text-muted-foreground leading-relaxed">{tx('support:other.share.desc')}</p>
                        </div>
                    </div>
                </section>

                {/* Footer */}
                <SiteFooter analyticsCategory="SupportPage" />
            </main>
        </div>
    );
}
