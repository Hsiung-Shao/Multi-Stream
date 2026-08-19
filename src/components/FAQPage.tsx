// FAQ — 依 multistream-hub-design-system 的 FAQPage.jsx 重建(editorial 版:blur orbs、
// gradient hero、hued icon chips、eyebrow、平滑手風琴、即時搜尋 + 分類過濾、CTA + footer)。
// 定位為疑難排解(troubleshooting):7 題真問答(faq namespace),功能 how-to 在 /instructions 教學頁。
// Brave 題保留 ModHeader 圖文教學;並輸出 FAQPage JSON-LD 結構化資料(經 SEO 元件注入)。

import { useState, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
    HelpCircle, Search, X, Plus, Minus, PlugZap, Database, SearchX,
    MessageCircle, Download, ExternalLink,
} from 'lucide-react';
import { SEO } from './SEO';
import { StaticPageHeader } from './StaticPageHeader';
import { RouteLink } from './Navigation/RouteLink';
import { BlurOrb, IconChip } from './ui/ds-primitives';

const MODHEADER_URL = 'https://chromewebstore.google.com/detail/modheader-modify-http-hea/idgpnmonknjnojddfkpgkljpfnnfcklj';
const PROFILE_DOWNLOAD_PATH = '/docs/brave-fix/twitch.json';
const STEP_IMAGES = [
    '/docs/brave-fix/step0.webp',
    '/docs/brave-fix/step1.webp',
    '/docs/brave-fix/step2.webp',
    '/docs/brave-fix/step3.webp',
];
const DISCORD_URL = 'https://discord.gg/47kauArepY';
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

// FAQ 分組:播放與相容性 / 效能與資料,共 7 題(item key 對應 faq namespace)。
const FAQ_GROUPS = [
    {
        id: 'compat',
        icon: PlugZap,
        hue: '#60a5fa',
        items: ['brave_twitch', 'youtube_playback', 'platform_support', 'live_detection'],
    },
    {
        id: 'usage',
        icon: Database,
        hue: '#4ade80',
        items: ['performance', 'data_saved', 'empty_window', 'youtube_search'],
    },
];

type TFn = (key: string, options?: Record<string, unknown>) => string;

export function FAQPage() {
    const { t } = useTranslation(['faq', 'common']);

    const [query, setQuery] = useState('');
    const [activeCat, setActiveCat] = useState<string>('all');
    const [open, setOpen] = useState<Record<string, boolean>>({ 'compat:brave_twitch': true });

    const q = query.trim().toLowerCase();
    const tx = t as unknown as TFn;

    const catLabel = (id: string) =>
        id === 'compat' ? tx('faq:cat_compat', { defaultValue: '播放與相容性' })
            : tx('faq:cat_usage', { defaultValue: '效能與資料' });
    const catBlurb = (id: string) =>
        id === 'compat' ? tx('faq:cat_compat_blurb', { defaultValue: '瀏覽器、平台與播放相關的疑難排解。' })
            : tx('faq:cat_usage_blurb', { defaultValue: '效能調校、資料儲存與佈局占位的常見疑問。' });

    const itemText = (item: string) =>
        (tx(`faq:items.${item}.title`) + ' ' + tx(`faq:items.${item}.content`)).toLowerCase();

    const filtered = useMemo(() => {
        return FAQ_GROUPS
            .filter(g => activeCat === 'all' || g.id === activeCat)
            .map(g => ({ ...g, items: g.items.filter(it => !q || itemText(it).includes(q)) }))
            .filter(g => g.items.length > 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, activeCat, t]);

    const totalCount = FAQ_GROUPS.reduce((n, g) => n + g.items.length, 0);
    const matchCount = filtered.reduce((n, g) => n + g.items.length, 0);

    const highlight = (text: string): ReactNode => {
        if (!q) return text;
        const idx = text.toLowerCase().indexOf(q);
        if (idx === -1) return text;
        return (
            <>
                {text.slice(0, idx)}
                <mark className="faq-mark">{text.slice(idx, idx + q.length)}</mark>
                {text.slice(idx + q.length)}
            </>
        );
    };

    const toggle = (key: string) => setOpen(o => ({ ...o, [key]: !o[key] }));

    const chips = [
        { id: 'all', label: tx('faq:cat_all', { defaultValue: '全部' }), count: totalCount, icon: null, hue: '#c084fc' },
        ...FAQ_GROUPS.map(g => ({ id: g.id, label: catLabel(g.id), count: g.items.length, icon: g.icon, hue: g.hue })),
    ];

    return (
        <div className="faq-page">
            <style>{`
                /* overflow: clip(非 hidden):裁切 BlurOrb 同時不建立 scroll container,sticky header 才會生效 */
                .faq-page { position: relative; min-height: 100vh; overflow: clip; background: var(--background); color: var(--foreground); font-family: var(--font-sans); }
                .faq-wrap { position: relative; z-index: 1; max-width: 860px; margin: 0 auto; padding: 0 24px 96px; }
                .faq-hero { padding-top: 56px; text-align: center; }
                .faq-hero-badge { width: 76px; height: 76px; border-radius: 22px; margin: 0 auto 26px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, oklch(0.63 0.23 304), #c084fc); box-shadow: 0 24px 56px -16px oklch(0.63 0.23 304 / 0.7), inset 0 1px 0 rgba(255,255,255,0.25); }
                .faq-eyebrow { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; color: #c084fc; }
                .faq-title { font-size: 52px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; margin: 14px 0 0; background: linear-gradient(90deg, #ffffff 0%, #e5e7eb 55%, #9ca3af 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
                .faq-sub { font-size: 17px; color: var(--muted-foreground); line-height: 1.65; max-width: 540px; margin: 18px auto 0; }
                .faq-search { position: relative; max-width: 520px; margin: 34px auto 0; }
                .faq-search .faq-search-icon { position: absolute; left: 18px; top: 50%; transform: translateY(-50%); color: var(--muted-foreground); pointer-events: none; display: inline-flex; }
                .faq-search input { width: 100%; box-sizing: border-box; height: 54px; padding: 0 46px 0 48px; border-radius: 9999px; background: oklch(0.21 0.034 264.665 / 0.6); border: 1px solid rgba(255,255,255,0.1); color: var(--foreground); font-family: var(--font-sans); font-size: 15.5px; outline: none; transition: border-color .2s ease, box-shadow .2s ease, background .2s ease; }
                .faq-search input::placeholder { color: var(--muted-foreground); }
                .faq-search input:focus { border-color: oklch(0.63 0.23 304 / 0.6); box-shadow: 0 0 0 4px oklch(0.63 0.23 304 / 0.12); background: oklch(0.21 0.034 264.665 / 0.8); }
                .faq-search-clear { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; border-radius: 9999px; border: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.06); color: var(--muted-foreground); transition: all .15s ease; }
                .faq-search-clear:hover { background: rgba(255,255,255,0.12); color: var(--foreground); }
                .faq-chips { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 22px; }
                .faq-chip { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 9999px; cursor: pointer; font-family: var(--font-sans); font-size: 13.5px; font-weight: 500; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); color: var(--muted-foreground); transition: all .18s ease; }
                .faq-chip:hover { color: var(--foreground); border-color: rgba(255,255,255,0.2); }
                .faq-chip[data-active="1"] { color: var(--foreground); background: oklch(0.63 0.23 304 / 0.16); border-color: oklch(0.63 0.23 304 / 0.55); }
                .faq-chip-count { font-family: ${MONO}; font-size: 11.5px; opacity: 0.7; }
                .faq-meta { text-align: center; font-size: 13.5px; color: var(--muted-foreground); margin: 34px 0 4px; font-family: ${MONO}; }
                .faq-group { padding-top: 46px; }
                .faq-group-head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 18px; }
                .faq-group-head > div:last-child { flex: 1; min-width: 0; }
                .faq-group-title { font-size: 21px; font-weight: 800; letter-spacing: -0.01em; line-height: 1.3; margin: 0; color: var(--foreground); }
                .faq-group-blurb { font-size: 13px; color: var(--muted-foreground); margin: 4px 0 0; }
                .faq-list { display: flex; flex-direction: column; gap: 12px; }
                .faq-item { border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; overflow: hidden; background: oklch(0.21 0.034 264.665 / 0.45); transition: border-color .25s ease, background .25s ease; }
                .faq-item[data-open="1"] { background: oklch(0.21 0.034 264.665 / 0.7); }
                .faq-q { width: 100%; box-sizing: border-box; display: flex; align-items: center; gap: 16px; justify-content: space-between; text-align: left; cursor: pointer; padding: 19px 20px; background: transparent; border: 0; font-family: var(--font-sans); font-size: 16px; font-weight: 600; color: var(--foreground); }
                .faq-q-text { line-height: 1.5; }
                .faq-q-icon { flex-shrink: 0; width: 28px; height: 28px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.1); transition: all .2s ease; }
                .faq-a-wrap { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .28s ease; }
                .faq-item[data-open="1"] .faq-a-wrap { grid-template-rows: 1fr; }
                .faq-a-inner { overflow: hidden; }
                .faq-a { margin: 0; padding: 0 20px 20px; font-size: 14.5px; line-height: 1.75; color: var(--muted-foreground); }
                .faq-mark { background: oklch(0.63 0.23 304 / 0.35); color: var(--foreground); border-radius: 3px; padding: 0 2px; }
                .faq-tip { margin-top: 12px; padding: 12px 14px; border-radius: 10px; background: oklch(0.63 0.23 304 / 0.1); border-left: 2px solid var(--primary); font-size: 13.5px; }
                .faq-tip b { color: var(--primary); display: block; margin-bottom: 2px; }
                .faq-empty { text-align: center; padding: 60px 0 20px; }
                .faq-empty-icon { width: 56px; height: 56px; border-radius: 16px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.04); color: var(--muted-foreground); }
                .faq-empty h3 { font-size: 18px; font-weight: 700; margin: 0 0 6px; color: var(--foreground); }
                .faq-empty p { font-size: 14px; color: var(--muted-foreground); margin: 0; }
                .faq-cta { margin-top: 64px; position: relative; overflow: hidden; padding: 40px 36px; border-radius: 22px; text-align: center; background: linear-gradient(135deg, oklch(0.63 0.23 304 / 0.14), oklch(0.21 0.034 264.665 / 0.6)); border: 1px solid oklch(0.63 0.23 304 / 0.25); }
                .faq-cta-orb { position: absolute; top: -60px; left: 50%; transform: translateX(-50%); width: 260px; height: 160px; border-radius: 50%; background: oklch(0.63 0.23 304); opacity: 0.18; filter: blur(60px); pointer-events: none; }
                .faq-cta h3 { position: relative; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 8px; color: var(--foreground); }
                .faq-cta p { position: relative; font-size: 15px; color: var(--muted-foreground); margin: 0 auto 24px; max-width: 460px; line-height: 1.6; }
                .faq-cta-row { position: relative; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
                .faq-cta-btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 22px; border-radius: 9999px; font-family: var(--font-sans); font-size: 14.5px; font-weight: 600; text-decoration: none; cursor: pointer; border: 0; transition: transform .2s ease, box-shadow .2s ease, background .2s ease; }
                .faq-cta-btn.primary { background: var(--primary); color: #fff; box-shadow: 0 14px 30px -12px oklch(0.63 0.23 304 / 0.7); }
                .faq-cta-btn.primary:hover { transform: translateY(-2px); }
                .faq-cta-btn.ghost { background: rgba(255,255,255,0.05); color: var(--foreground); border: 1px solid rgba(255,255,255,0.12); }
                .faq-cta-btn.ghost:hover { background: rgba(255,255,255,0.1); transform: translateY(-2px); }
                .faq-footer { padding-top: 60px; margin-top: 64px; border-top: 1px solid rgba(255,255,255,0.07); text-align: center; }
                .faq-footer-links { display: flex; gap: 28px; justify-content: center; flex-wrap: wrap; }
                .faq-foot-link { color: var(--muted-foreground); text-decoration: none; transition: color .2s ease; background: none; border: 0; cursor: pointer; font-family: var(--font-sans); font-size: 14px; font-weight: 500; }
                .faq-foot-link:hover { color: var(--foreground); }
                .faq-copy { font-size: 13px; color: var(--muted-foreground); margin: 22px 0 0; }
                @media (max-width: 560px) { .faq-title { font-size: 40px; } }
            `}</style>

            <SEO
                title={`${tx('faq:title')} - MultiStream Hub`}
                description={tx('faq:header_subtitle')}
                url="https://multistreaming.org/faq"
                jsonLd={{
                    '@context': 'https://schema.org',
                    '@type': 'FAQPage',
                    mainEntity: FAQ_GROUPS.flatMap(g => g.items).map(item => ({
                        '@type': 'Question',
                        name: tx(`faq:items.${item}.title`),
                        acceptedAnswer: { '@type': 'Answer', text: tx(`faq:items.${item}.content`) },
                    })),
                }}
            />

            {/* 頂部返回列 — 三靜態頁共用 header */}
            <StaticPageHeader title={tx('faq:title')} analyticsCategory="FAQPage" />

            <BlurOrb top={-160} left="50%" w={760} h={460} color="oklch(0.63 0.23 304)" opacity={0.16} />
            <BlurOrb top={620} right={-180} w={520} h={420} color="#3b82f6" opacity={0.06} />

            <div className="faq-wrap">
                {/* Hero */}
                <section className="faq-hero">
                    <div className="faq-hero-badge"><HelpCircle size={36} color="white" /></div>
                    <div className="faq-eyebrow">{tx('faq:support_eyebrow', { defaultValue: 'Support' })}</div>
                    <h1 className="faq-title">{tx('faq:header_title')}</h1>
                    <p className="faq-sub">{tx('faq:header_subtitle')}</p>

                    <div className="faq-search">
                        <span className="faq-search-icon"><Search size={18} /></span>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={tx('faq:search_placeholder', { defaultValue: '搜尋問題,例如「Brave」、「效能」、「YouTube」…' })}
                        />
                        {query && (
                            <button className="faq-search-clear" onClick={() => setQuery('')} aria-label="清除搜尋">
                                <X size={15} />
                            </button>
                        )}
                    </div>

                    <div className="faq-chips">
                        {chips.map((c) => {
                            const ChipIcon = c.icon;
                            return (
                                <button
                                    key={c.id}
                                    className="faq-chip"
                                    data-active={activeCat === c.id ? '1' : '0'}
                                    onClick={() => setActiveCat(c.id)}
                                >
                                    {ChipIcon && <ChipIcon size={14} color={c.hue} />}
                                    {c.label}
                                    <span className="faq-chip-count">{c.count}</span>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* Results meta */}
                {q && (
                    <div className="faq-meta">
                        {matchCount > 0
                            ? tx('faq:search_found', { defaultValue: `找到 ${matchCount} 則符合「${query}」的問題`, count: matchCount, query })
                            : tx('faq:search_none', { defaultValue: `沒有符合「${query}」的問題`, query })}
                    </div>
                )}

                {/* Groups */}
                {filtered.length > 0 ? (
                    filtered.map((g) => (
                        <section className="faq-group" key={g.id}>
                            <div className="faq-group-head">
                                <IconChip icon={g.icon} hue={g.hue} size={44} />
                                <div>
                                    <h2 className="faq-group-title">{catLabel(g.id)}</h2>
                                    <p className="faq-group-blurb">{catBlurb(g.id)}</p>
                                </div>
                            </div>
                            <div className="faq-list">
                                {g.items.map((item) => {
                                    const key = `${g.id}:${item}`;
                                    return (
                                        <FaqItem
                                            key={key}
                                            item={item}
                                            hue={g.hue}
                                            isOpen={!!open[key]}
                                            onToggle={() => toggle(key)}
                                            highlight={highlight}
                                            t={tx}
                                        />
                                    );
                                })}
                            </div>
                        </section>
                    ))
                ) : (
                    <div className="faq-empty">
                        <div className="faq-empty-icon"><SearchX size={26} /></div>
                        <h3>{tx('faq:empty_title', { defaultValue: '找不到相關問題' })}</h3>
                        <p>{tx('faq:empty_desc', { defaultValue: '換個關鍵字試試,或直接到 Discord 問我們。' })}</p>
                    </div>
                )}

                {/* CTA */}
                <div className="faq-cta">
                    <div className="faq-cta-orb" />
                    <h3>{tx('faq:cta_title', { defaultValue: '還是沒找到答案?' })}</h3>
                    <p>{tx('faq:cta_desc', { defaultValue: '加入 Discord 社群問我們,我們很樂意幫忙。' })}</p>
                    <div className="faq-cta-row">
                        <a className="faq-cta-btn primary" href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
                            <MessageCircle size={16} /> {tx('faq:cta_discord', { defaultValue: '加入 Discord' })}
                        </a>
                    </div>
                </div>

                {/* Footer */}
                <footer className="faq-footer">
                    <div className="faq-footer-links">
                        <RouteLink className="faq-foot-link" to="home">{tx('faq:foot_home', { defaultValue: '首頁' })}</RouteLink>
                        <RouteLink className="faq-foot-link" to="about">{tx('faq:foot_about', { defaultValue: '關於' })}</RouteLink>
                        <RouteLink className="faq-foot-link" to="privacy">{tx('faq:foot_privacy', { defaultValue: '隱私權政策' })}</RouteLink>
                    </div>
                    <p className="faq-copy">© 2026 MultiStream Hub. All rights reserved.</p>
                </footer>
            </div>
        </div>
    );
}

function FaqItem({
    item, hue, isOpen, onToggle, highlight, t,
}: {
    item: string;
    hue: string;
    isOpen: boolean;
    onToggle: () => void;
    highlight: (text: string) => ReactNode;
    t: TFn;
}) {
    const tip = item !== 'brave_twitch' ? t(`faq:items.${item}.tip`, { defaultValue: '' }) : '';
    return (
        <div className="faq-item" data-open={isOpen ? '1' : '0'} style={{ borderColor: isOpen ? `${hue}55` : 'rgba(255,255,255,0.06)' }}>
            <button className="faq-q" onClick={onToggle} aria-expanded={isOpen}>
                <span className="faq-q-text">{highlight(t(`faq:items.${item}.title`))}</span>
                <span
                    className="faq-q-icon"
                    style={{
                        background: isOpen ? hue : 'rgba(255,255,255,0.05)',
                        color: isOpen ? '#0b0d13' : 'var(--muted-foreground)',
                        borderColor: isOpen ? hue : 'rgba(255,255,255,0.1)',
                    }}
                >
                    {isOpen ? <Minus size={15} /> : <Plus size={15} />}
                </span>
            </button>
            <div className="faq-a-wrap">
                <div className="faq-a-inner">
                    <div className="faq-a">
                        {highlight(t(`faq:items.${item}.content`))}
                        {item === 'brave_twitch' && <BraveTwitchGuide t={t} />}
                        {tip ? (
                            <div className="faq-tip">
                                <b>{t('faq:tipLabel')}</b>
                                {tip}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}

function BraveTwitchGuide({ t }: { t: TFn }) {
    const stepKeys = ['step0', 'step1', 'step2', 'step3'] as const;
    return (
        <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-3">
                <a
                    href={MODHEADER_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
                >
                    <ExternalLink className="w-4 h-4" />
                    {t('faq:items.brave_twitch.install_btn')}
                </a>
                <a
                    href={PROFILE_DOWNLOAD_PATH}
                    download="twitch.json"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground font-medium text-sm hover:bg-secondary/80 transition-colors"
                >
                    <Download className="w-4 h-4" />
                    {t('faq:items.brave_twitch.download_btn')}
                </a>
            </div>
            <div className="space-y-6">
                {stepKeys.map((stepKey, index) => (
                    <div key={stepKey} className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-sm font-bold flex items-center justify-center">
                                {index + 1}
                            </span>
                            <span className="font-medium text-foreground">
                                {t(`faq:items.brave_twitch.${stepKey}`)}
                            </span>
                        </div>
                        <div className="ml-8 rounded-lg overflow-hidden border border-white/10">
                            <img src={STEP_IMAGES[index]} alt={`Step ${index + 1}`} className="w-full max-w-lg" loading="lazy" />
                        </div>
                    </div>
                ))}
            </div>
            <div className="faq-tip">
                <b>{t('faq:tipLabel')}</b>
                {t('faq:items.brave_twitch.tip')}
            </div>
        </div>
    );
}
