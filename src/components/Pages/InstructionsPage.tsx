// InstructionsPage — 依 multistream-hub-design-system 的 Blog.jsx (TutorialBlogPage) 重建為
// 部落格式教學頁:列表頁(雜誌/卡片/清單三版型 + 搜尋 + 分類 tabs)+ 文章閱讀頁
// (側邊目錄 scrollspy + 內容區塊 + 相關文章)。
// 內容沿用 next 既有 tutorial 多語系 i18n(6 大功能 + 快速上手 → 7 篇文章),只換 design 視覺。
// FAQ 內容已移至 /faq(FAQPage),本頁專注 how-to 教學。
// 部落格框架文字(搜尋框、版型、精選、目錄、繼續閱讀…)為 design 新增,以 defaultValue 帶繁中、其餘語系暫 fallback。
// 路由:列表 = /instructions、文章 = /instructions/<slug>(page 'instructions:<slug>',見 src/config/guides.ts);
// 卡片與返回鈕都是 RouteLink 真實 <a href>,爬蟲可沿連結走完 7 篇,上一頁會回列表。
// SEO(含每篇文章的 title/description/JSON-LD)由 App.tsx 在 Suspense 外統一處理,本元件不自帶。

import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/useUIStore';
import { RouteLink } from '../Navigation/RouteLink';
import { SiteFooter } from '../SiteFooter';
import { guidePage, guideSlugOf, isGuidePage, type GuideSlug } from '../../config/guides';
import { StaticPageHeader } from '../StaticPageHeader';
import {
    Search, SearchX, LayoutTemplate, LayoutGrid, List as ListIcon,
    Sparkles, Clock, ArrowRight, ArrowLeft, ChevronRight, ShieldCheck,
    Rocket, Volume2, Star, Settings as SettingsIcon, Tv, Share2, Keyboard,
    type LucideIcon,
} from 'lucide-react';

type TFn = (key: string, options?: Record<string, unknown>) => string;

// ---- 內容模型(p / steps / callout / img 四種區塊)----------------------------
type Block =
    | { type: 'p'; text: string }
    | { type: 'steps'; items: string[] }
    | { type: 'callout'; title: string; text: string }
    | { type: 'img'; src: string; alt: string; caption?: string; w: number; h: number };

// 教學截圖(由 scripts/convert-tutorial-images.mjs 轉出);w/h 為實際像素,防 CLS
const TUT_IMG_DIR = '/docs/tutorial/';
const img = (file: string, w: number, h: number, alt: string, caption?: string): Block =>
    ({ type: 'img', src: TUT_IMG_DIR + file, w, h, alt, caption });

interface Section { id: string; heading: string; blocks: Block[]; }

interface Article {
    slug: GuideSlug;
    title: string;
    excerpt: string;
    category: string;
    catLabel: string;
    readLabel: string;
    accent: string;
    accent2: string;
    icon: LucideIcon;
    featured?: boolean;
    sections: Section[];
}

// =============================================================================
// 共用視覺小元件(純 props,不碰 i18n)
// =============================================================================
function HeroBlock({ Icon, catLabel, accent, accent2, height, big }: {
    Icon: LucideIcon; catLabel: string; accent: string; accent2: string; height: number; big?: boolean;
}) {
    return (
        <div className="tut-hero-block" style={{ height, background: `linear-gradient(135deg, ${accent}, ${accent2})` }}>
            <div className="tut-hero-overlay" />
            <Icon className="tut-hero-icon" size={big ? 72 : 40} style={{ right: big ? 28 : 14, bottom: big ? 24 : 12 }} />
            <span className="tut-hero-cat">{catLabel}</span>
        </div>
    );
}

function Meta({ readLabel }: { readLabel: string }) {
    return (
        <div className="tut-meta">
            <span className="tut-meta-read"><Clock size={12} /> {readLabel}</span>
        </div>
    );
}

function Block({ block, accent }: { block: Block; accent: string }) {
    if (block.type === 'p') return <p className="tut-p">{block.text}</p>;
    if (block.type === 'steps') {
        return (
            <ol className="tut-steps">
                {block.items.map((it, i) => (
                    <li key={i} className="tut-step">
                        <span className="tut-step-num">{i + 1}</span>
                        <span className="tut-step-text">{it}</span>
                    </li>
                ))}
            </ol>
        );
    }
    if (block.type === 'img') {
        return (
            <figure className="tut-fig">
                <img
                    className="tut-img"
                    src={block.src}
                    alt={block.alt}
                    width={block.w}
                    height={block.h}
                    loading="lazy"
                    decoding="async"
                />
                {block.caption && <figcaption className="tut-fig-cap">{block.caption}</figcaption>}
            </figure>
        );
    }
    // callout
    return (
        <div className="tut-callout" style={{ background: `linear-gradient(135deg, ${accent}1a, transparent)`, border: `1px solid ${accent}33` }}>
            <div className="tut-callout-head">
                <ShieldCheck size={17} style={{ color: accent }} />
                <span className="tut-callout-title" style={{ color: accent }}>{block.title}</span>
            </div>
            <p className="tut-callout-text">{block.text}</p>
        </div>
    );
}

// 卡片標題是真實 <a href="/instructions/<slug>">(RouteLink),用 .tut-card-link::after 鋪滿整卡
// (stretched-link):整卡可點、Ctrl/中鍵可開新分頁、爬蟲看得到連結,且不產生巢狀互動元素。
function CardLink({ slug, children }: { slug: GuideSlug; children: ReactNode }) {
    return <RouteLink to={guidePage(slug)} className="tut-card-link">{children}</RouteLink>;
}

function FeaturedCard({ article, featuredLabel, readMoreLabel }: {
    article: Article; featuredLabel: string; readMoreLabel: string;
}) {
    return (
        <article className="tut-featured">
            <HeroBlock Icon={article.icon} catLabel={article.catLabel} accent={article.accent} accent2={article.accent2} height={260} big />
            <div>
                <span className="tut-featured-eyebrow"><Sparkles size={13} /> {featuredLabel}</span>
                <h2 className="tut-featured-title"><CardLink slug={article.slug}>{article.title}</CardLink></h2>
                <p className="tut-featured-excerpt">{article.excerpt}</p>
                <Meta readLabel={article.readLabel} />
                <div className="tut-read-more">{readMoreLabel} <ArrowRight size={16} /></div>
            </div>
        </article>
    );
}

function MagazineCard({ article }: { article: Article }) {
    return (
        <article className="tut-card">
            <div className="tut-card-pad"><HeroBlock Icon={article.icon} catLabel={article.catLabel} accent={article.accent} accent2={article.accent2} height={150} /></div>
            <div className="tut-card-body">
                <h3 className="tut-card-title"><CardLink slug={article.slug}>{article.title}</CardLink></h3>
                <p className="tut-card-excerpt">{article.excerpt}</p>
                <Meta readLabel={article.readLabel} />
            </div>
        </article>
    );
}

function UniformCard({ article }: { article: Article }) {
    return (
        <article className="tut-ucard">
            <HeroBlock Icon={article.icon} catLabel={article.catLabel} accent={article.accent} accent2={article.accent2} height={120} />
            <div className="tut-ucard-body">
                <h3 className="tut-ucard-title"><CardLink slug={article.slug}>{article.title}</CardLink></h3>
                <p className="tut-ucard-excerpt">{article.excerpt}</p>
                <Meta readLabel={article.readLabel} />
            </div>
        </article>
    );
}

function ListRow({ article, first }: { article: Article; first: boolean }) {
    return (
        <article className={`tut-row${first ? ' first' : ''}`}>
            <div className="tut-row-hero"><HeroBlock Icon={article.icon} catLabel={article.catLabel} accent={article.accent} accent2={article.accent2} height={66} /></div>
            <div className="tut-row-body">
                <span className="tut-row-cat" style={{ color: article.accent }}>{article.catLabel}</span>
                <h3 className="tut-row-title"><CardLink slug={article.slug}>{article.title}</CardLink></h3>
                <p className="tut-row-excerpt">{article.excerpt}</p>
            </div>
            <div className="tut-row-meta"><Meta readLabel={article.readLabel} /></div>
            <ChevronRight className="tut-row-chevron" size={20} />
        </article>
    );
}

// =============================================================================
// 文章閱讀頁(目錄 scrollspy + 內容區塊 + 相關文章)
// =============================================================================
function BlogArticle({ article, allArticles, labels }: {
    article: Article;
    allArticles: Article[];
    labels: { allArticles: string; toc: string; related: string; team: string; crumbHome: string; crumbHub: string };
}) {
    const [activeId, setActiveId] = useState<string | undefined>(article.sections[0]?.id);

    const related = allArticles
        .filter((a) => a.slug !== article.slug && a.category === article.category)
        .concat(allArticles.filter((a) => a.slug !== article.slug && a.category !== article.category))
        .slice(0, 3);

    // Scrollspy:依目前可視區段更新目錄高亮
    useEffect(() => {
        const headings = article.sections
            .map((s) => document.getElementById('sec-' + s.id))
            .filter((el): el is HTMLElement => Boolean(el));
        const obs = new IntersectionObserver((entries) => {
            const vis = entries.filter((e) => e.isIntersecting)
                .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
            if (vis[0]) setActiveId((vis[0].target as HTMLElement).dataset.sid);
        }, { rootMargin: '-72px 0px -65% 0px', threshold: 0 });
        headings.forEach((h) => obs.observe(h));
        return () => obs.disconnect();
    }, [article]);

    const jumpTo = (id: string) => {
        const el = document.getElementById('sec-' + id);
        if (!el) return;
        const y = el.getBoundingClientRect().top + window.scrollY - 88;
        window.scrollTo({ top: y, behavior: 'smooth' });
    };

    return (
        <div className="tut-wrap">
            {/* 可見麵包屑（與 <SEO jsonLd> 的 BreadcrumbList 對應，Google 建議兩者並存） */}
            <nav className="tut-crumbs" aria-label="Breadcrumb">
                <ol>
                    <li><RouteLink to="home">{labels.crumbHome}</RouteLink></li>
                    <li aria-hidden="true"><ChevronRight size={13} /></li>
                    <li><RouteLink to="instructions">{labels.crumbHub}</RouteLink></li>
                    <li aria-hidden="true"><ChevronRight size={13} /></li>
                    <li aria-current="page">{article.title}</li>
                </ol>
            </nav>
            <RouteLink to="instructions" className="tut-back">
                <ArrowLeft size={15} /> {labels.allArticles}
            </RouteLink>

            <header className="tut-art-head">
                <div className="tut-art-cat-row">
                    <span className="tut-art-cat" style={{ background: `${article.accent}22`, color: article.accent, border: `1px solid ${article.accent}44` }}>{article.catLabel}</span>
                    <Meta readLabel={article.readLabel} />
                </div>
                <h1 className="tut-art-title">{article.title}</h1>
                <p className="tut-art-excerpt">{article.excerpt}</p>
                <div className="tut-author-row">
                    <div className="tut-avatar" style={{ background: `linear-gradient(135deg, ${article.accent}, ${article.accent2})` }}>{labels.team[0]}</div>
                    <div>
                        <div className="tut-author-name">{labels.team}</div>
                    </div>
                </div>
            </header>

            <HeroBlock Icon={article.icon} catLabel={article.catLabel} accent={article.accent} accent2={article.accent2} height={300} big />

            <div className="tut-art-body">
                <aside className="tut-toc">
                    <div className="tut-toc-label">{labels.toc}</div>
                    <nav className="tut-toc-nav">
                        {article.sections.map((s) => (
                            <button key={s.id} className={`tut-toc-btn${activeId === s.id ? ' on' : ''}`} onClick={() => jumpTo(s.id)}>
                                {s.heading}
                            </button>
                        ))}
                    </nav>
                </aside>

                <div className="tut-content">
                    {article.sections.map((s) => (
                        <section key={s.id} id={'sec-' + s.id} data-sid={s.id} className="tut-section">
                            <h2 className="tut-section-h">{s.heading}</h2>
                            {s.blocks.map((b, i) => <Block key={i} block={b} accent={article.accent} />)}
                        </section>
                    ))}
                </div>
            </div>

            {related.length > 0 && (
                <div className="tut-related">
                    <h2 className="tut-related-h">{labels.related}</h2>
                    <div className="tut-related-grid">
                        {related.map((a) => <UniformCard key={a.slug} article={a} />)}
                    </div>
                </div>
            )}
        </div>
    );
}

// =============================================================================
// 列表頁(masthead + 工具列 + 分類 + 三種版型)
// =============================================================================
type Layout = 'magazine' | 'cards' | 'list';

function BlogList({ articles, cats, labels }: {
    articles: Article[];
    cats: { id: string; label: string }[];
    labels: {
        mastEyebrow: string; mastTitle: string; mastSub: string;
        searchPlaceholder: string; layoutMagazine: string; layoutCards: string; layoutList: string;
        featured: string; readMore: string; noResults: (q: string) => string;
    };
}) {
    const [query, setQuery] = useState('');
    const [cat, setCat] = useState('all');
    const [layout, setLayout] = useState<Layout>('magazine');

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return articles.filter((a) => {
            const okCat = cat === 'all' || a.category === cat;
            const okQ = !q || (a.title + a.excerpt + a.catLabel).toLowerCase().includes(q);
            return okCat && okQ;
        });
    }, [articles, query, cat]);

    const featured = filtered.find((a) => a.featured);
    const rest = filtered.filter((a) => a !== featured);

    const layoutOpts: { id: Layout; icon: LucideIcon; label: string }[] = [
        { id: 'magazine', icon: LayoutTemplate, label: labels.layoutMagazine },
        { id: 'cards', icon: LayoutGrid, label: labels.layoutCards },
        { id: 'list', icon: ListIcon, label: labels.layoutList },
    ];

    return (
        <div className="tut-wrap">
            <header className="tut-mast">
                <div className="tut-eyebrow-row">
                    <span className="tut-eyebrow">{labels.mastEyebrow}</span>
                    <span className="tut-eyebrow-line" />
                </div>
                <h1 className="tut-mast-title">{labels.mastTitle}</h1>
                <p className="tut-mast-sub">{labels.mastSub}</p>
            </header>

            <div className="tut-toolbar">
                <div className="tut-search">
                    <Search className="tut-search-icon" size={16} />
                    <input
                        className="tut-search-input"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={labels.searchPlaceholder}
                    />
                </div>
                <div className="tut-layout-switch">
                    {layoutOpts.map((o) => {
                        const Ico = o.icon;
                        return (
                            <button key={o.id} className={`tut-layout-btn${layout === o.id ? ' on' : ''}`} title={o.label} onClick={() => setLayout(o.id)}>
                                <Ico size={15} /> <span>{o.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="tut-cats">
                {cats.map((c) => (
                    <button key={c.id} className={`tut-cat${cat === c.id ? ' on' : ''}`} onClick={() => setCat(c.id)}>{c.label}</button>
                ))}
            </div>

            {filtered.length === 0 && (
                <div className="tut-empty">
                    <SearchX size={40} style={{ opacity: 0.4 }} />
                    <p>{labels.noResults(query)}</p>
                </div>
            )}

            {layout === 'magazine' && featured && (
                <FeaturedCard article={featured} featuredLabel={labels.featured} readMoreLabel={labels.readMore} />
            )}
            {layout === 'magazine' && rest.length > 0 && (
                <div className="tut-grid-mag">
                    {rest.map((a) => <MagazineCard key={a.slug} article={a} />)}
                </div>
            )}
            {layout === 'cards' && (
                <div className="tut-grid-cards">
                    {filtered.map((a) => <UniformCard key={a.slug} article={a} />)}
                </div>
            )}
            {layout === 'list' && (
                <div className="tut-list">
                    {filtered.map((a, i) => <ListRow key={a.slug} article={a} first={i === 0} />)}
                </div>
            )}
        </div>
    );
}

// =============================================================================
// Root — 內容組裝(全部來自 next 既有 tutorial i18n)+ 視圖路由(列表 ⇄ 文章)
// =============================================================================
export function InstructionsPage() {
    const { t, i18n } = useTranslation(['tutorial', 'common']);
    const tx = t as unknown as TFn;
    // 目前文章由 page 推導（'instructions:<slug>'），URL 同步與上一頁行為交給 useRouter
    const page = useUIStore((s) => s.page);
    const slug: GuideSlug | null = isGuidePage(page) ? guideSlugOf(page) : null;

    const readLabel = (n: number) => tx('blog.minRead', { defaultValue: '{{n}} 分鐘', n });

    // next 既有 tutorial i18n → 8 篇文章(內容皆既有 key,多語系完整保留)
    const articles: Article[] = useMemo(() => [
        {
            slug: 'quick-start',
            // 獨立於頁面 H1(hero.title)的標題,避免 H1 與 featured 卡 H2 同字(SEO)
            title: tx('article.quickStart.title'),
            excerpt: tx('article.quickStart.excerpt'),
            category: 'basics',
            catLabel: tx('tabs.basics'),
            readLabel: readLabel(4),
            accent: '#c084fc', accent2: '#7c3aed', icon: Rocket, featured: true,
            sections: [
                { id: 'intro', heading: tx('intro.title'), blocks: [{ type: 'p', text: tx('intro.content') }] },
                {
                    id: 'getting-started', heading: tx('gettingStarted.title'), blocks: [
                        { type: 'p', text: tx('gettingStarted.content') },
                        {
                            type: 'steps', items: [
                                tx('gettingStarted.step1'), tx('gettingStarted.step2'), tx('gettingStarted.step3'),
                                tx('gettingStarted.step4'), tx('gettingStarted.step5'), tx('gettingStarted.step6'),
                            ],
                        },
                        img('island-overview.webp', 1440, 900, tx('img.islandOverview.alt'), tx('img.islandOverview.cap')),
                        img('island-search-bar.webp', 1403, 994, tx('img.islandSearchBar.alt'), tx('img.islandSearchBar.cap')),
                        img('search-twitch-results.webp', 743, 320, tx('img.searchTwitchResults.alt'), tx('img.searchTwitchResults.cap')),
                    ],
                },
            ],
        },
        {
            slug: 'canvas',
            title: tx('features.canvas.title'),
            excerpt: tx('features.canvas.description'),
            category: 'basics',
            catLabel: tx('tabs.basics'),
            readLabel: readLabel(6),
            accent: '#60a5fa', accent2: '#2563eb', icon: LayoutGrid,
            sections: [
                {
                    id: 'add-window', heading: tx('features.canvas.addWindow'), blocks: [
                        { type: 'p', text: tx('features.canvas.addWindow.desc') },
                        img('island-add-window.webp', 1403, 994, tx('img.islandAddWindow.alt'), tx('img.islandAddWindow.cap')),
                        img('island-add-menu.webp', 1440, 900, tx('img.islandAddMenu.alt'), tx('img.islandAddMenu.cap')),
                        img('empty-window-picker.webp', 1440, 900, tx('img.emptyWindowPicker.alt'), tx('img.emptyWindowPicker.cap')),
                        img('add-window-combo.webp', 1600, 1229, tx('img.addWindowCombo.alt'), tx('img.addWindowCombo.cap')),
                        img('add-window-stream.webp', 1600, 1228, tx('img.addWindowStream.alt'), tx('img.addWindowStream.cap')),
                        img('add-window-chat.webp', 1600, 1240, tx('img.addWindowChat.alt'), tx('img.addWindowChat.cap')),
                    ],
                },
                {
                    id: 'auto-layout', heading: tx('features.canvas.autoLayout'), blocks: [
                        { type: 'p', text: tx('features.canvas.autoLayout.desc') },
                        img('island-layout-picker.webp', 1403, 994, tx('img.islandLayoutPicker.alt'), tx('img.islandLayoutPicker.cap')),
                        img('layout-picker-panel.webp', 1440, 900, tx('img.layoutPickerPanel.alt'), tx('img.layoutPickerPanel.cap')),
                    ],
                },
                {
                    id: 'drag-drop', heading: tx('features.canvas.dragDrop'), blocks: [
                        { type: 'p', text: tx('features.canvas.dragDrop.desc') },
                        img('window-toolbar.webp', 1440, 900, tx('img.windowToolbar.alt'), tx('img.windowToolbar.cap')),
                        img('window-drag-resize.webp', 1356, 493, tx('img.windowDragResize.alt'), tx('img.windowDragResize.cap')),
                    ],
                },
                {
                    id: 'custom-layout', heading: tx('features.canvas.customLayout'), blocks: [
                        { type: 'p', text: tx('features.canvas.customLayout.desc') },
                        img('island-save-canvas.webp', 1403, 994, tx('img.islandSaveCanvas.alt'), tx('img.islandSaveCanvas.cap')),
                        img('custom-layout-save.webp', 1600, 791, tx('img.customLayoutSave.alt'), tx('img.customLayoutSave.cap')),
                        img('custom-layout-saved.webp', 1600, 791, tx('img.customLayoutSaved.alt'), tx('img.customLayoutSaved.cap')),
                        img('layout-manager.webp', 1068, 823, tx('img.layoutManager.alt'), tx('img.layoutManager.cap')),
                    ],
                },
                { id: 'layout-rules', heading: tx('features.canvas.layoutRules'), blocks: [{ type: 'p', text: tx('features.canvas.layoutRules.desc') }] },
            ],
        },
        {
            slug: 'search',
            title: tx('features.search.title'),
            excerpt: tx('features.search.description'),
            category: 'basics',
            catLabel: tx('tabs.basics'),
            readLabel: readLabel(3),
            accent: '#4ade80', accent2: '#16a34a', icon: Search,
            sections: [
                {
                    id: 'twitch', heading: tx('features.search.twitch'), blocks: [
                        { type: 'p', text: tx('features.search.twitch.desc') },
                        img('island-search-bar.webp', 1403, 994, tx('img.islandSearchBar.alt'), tx('img.islandSearchBar.cap')),
                        img('search-twitch-results.webp', 743, 320, tx('img.searchTwitchResults.alt'), tx('img.searchTwitchResults.cap')),
                    ],
                },
                { id: 'youtube', heading: tx('features.search.youtube'), blocks: [{ type: 'p', text: tx('features.search.youtube.desc') }] },
                { id: 'url', heading: tx('features.search.url'), blocks: [{ type: 'p', text: tx('features.search.url.desc') }] },
            ],
        },
        {
            slug: 'dynamic-island',
            title: tx('features.island.title'),
            excerpt: tx('features.island.description'),
            category: 'advanced',
            catLabel: tx('tabs.advanced'),
            readLabel: readLabel(4),
            accent: '#a78bfa', accent2: '#6d28d9', icon: Tv,
            sections: [
                {
                    id: 'quick-actions', heading: tx('features.island.quickActions'), blocks: [
                        { type: 'p', text: tx('features.island.quickActions.desc') },
                        img('island-overview.webp', 1440, 900, tx('img.islandOverview.alt'), tx('img.islandOverview.cap')),
                    ],
                },
                { id: 'search', heading: tx('features.island.search'), blocks: [{ type: 'p', text: tx('features.island.search.desc') }] },
                {
                    id: 'buttons', heading: tx('features.island.buttons'), blocks: [
                        { type: 'p', text: tx('features.island.buttons.desc') },
                        img('island-fullscreen.webp', 1403, 994, tx('img.islandFullscreen.alt'), tx('img.islandFullscreen.cap')),
                        img('island-clear-canvas.webp', 1403, 994, tx('img.islandClearCanvas.alt'), tx('img.islandClearCanvas.cap')),
                        img('island-home.webp', 1403, 994, tx('img.islandHome.alt'), tx('img.islandHome.cap')),
                    ],
                },
                {
                    id: 'edge-dock', heading: tx('features.island.edgeDock'), blocks: [
                        { type: 'p', text: tx('features.island.edgeDock.desc') },
                        img('island-edge-dock.webp', 1440, 900, tx('img.islandEdgeDock.alt'), tx('img.islandEdgeDock.cap')),
                        img('island-edge-dock-open.webp', 1440, 900, tx('img.islandEdgeDockOpen.alt'), tx('img.islandEdgeDockOpen.cap')),
                    ],
                },
            ],
        },
        {
            slug: 'favorites',
            title: tx('features.favorites.title'),
            excerpt: tx('features.favorites.description'),
            category: 'advanced',
            catLabel: tx('tabs.advanced'),
            readLabel: readLabel(6),
            accent: '#facc15', accent2: '#ca8a04', icon: Star,
            sections: [
                {
                    id: 'quick-list', heading: tx('features.favorites.quickList'), blocks: [
                        { type: 'p', text: tx('features.favorites.quickList.desc') },
                        img('island-favorites-list.webp', 1403, 994, tx('img.islandFavoritesList.alt'), tx('img.islandFavoritesList.cap')),
                        img('favorites-panel.webp', 1440, 900, tx('img.favoritesPanel.alt'), tx('img.favoritesPanel.cap')),
                        img('favorites-live-list.webp', 324, 387, tx('img.favoritesLiveList.alt'), tx('img.favoritesLiveList.cap')),
                        img('favorites-filter-category.webp', 313, 247, tx('img.favoritesFilterCategory.alt'), tx('img.favoritesFilterCategory.cap')),
                        img('favorites-filter-tags.webp', 332, 251, tx('img.favoritesFilterTags.alt'), tx('img.favoritesFilterTags.cap')),
                    ],
                },
                {
                    id: 'add', heading: tx('features.favorites.add'), blocks: [
                        { type: 'p', text: tx('features.favorites.add.desc') },
                        img('favorites-add-dialog.webp', 557, 546, tx('img.favoritesAddDialog.alt'), tx('img.favoritesAddDialog.cap')),
                    ],
                },
                { id: 'import', heading: tx('features.favorites.import'), blocks: [{ type: 'callout', title: tx('features.favorites.proTip'), text: tx('features.favorites.import.desc') }] },
                {
                    id: 'group', heading: tx('features.favorites.group'), blocks: [
                        { type: 'p', text: tx('features.favorites.group.desc') },
                        img('favorites-manager.webp', 1031, 798, tx('img.favoritesManager.alt'), tx('img.favoritesManager.cap')),
                    ],
                },
            ],
        },
        {
            slug: 'media',
            title: tx('features.media.title'),
            excerpt: tx('features.media.description'),
            category: 'advanced',
            catLabel: tx('tabs.advanced'),
            readLabel: readLabel(4),
            accent: '#f472b6', accent2: '#db2777', icon: Volume2,
            sections: [
                {
                    id: 'master', heading: tx('features.media.global'), blocks: [
                        { type: 'p', text: tx('features.media.global.desc') },
                        img('island-media-control.webp', 1403, 994, tx('img.islandMediaControl.alt'), tx('img.islandMediaControl.cap')),
                    ],
                },
                {
                    id: 'per-window', heading: tx('features.media.window'), blocks: [
                        { type: 'p', text: tx('features.media.window.desc') },
                        img('media-control-panel.webp', 1440, 900, tx('img.mediaControlPanel.alt'), tx('img.mediaControlPanel.cap')),
                        img('window-toolbar.webp', 1440, 900, tx('img.windowToolbar.alt'), tx('img.windowToolbar.cap')),
                    ],
                },
            ],
        },
        {
            slug: 'settings',
            title: tx('features.settings.title'),
            excerpt: tx('features.settings.description'),
            category: 'advanced',
            catLabel: tx('tabs.advanced'),
            readLabel: readLabel(5),
            accent: '#94a3b8', accent2: '#475569', icon: SettingsIcon,
            sections: [
                {
                    id: 'general', heading: tx('features.settings.general'), blocks: [
                        { type: 'p', text: tx('features.settings.general.desc') },
                        img('island-settings.webp', 1403, 994, tx('img.islandSettings.alt'), tx('img.islandSettings.cap')),
                        img('settings-global.webp', 1440, 900, tx('img.settingsGlobal.alt'), tx('img.settingsGlobal.cap')),
                    ],
                },
                { id: 'playback', heading: tx('features.settings.playback'), blocks: [{ type: 'p', text: tx('features.settings.playback.desc') }] },
                { id: 'data', heading: tx('features.settings.data'), blocks: [{ type: 'p', text: tx('features.settings.data.desc') }] },
                { id: 'twitch', heading: tx('features.settings.twitch'), blocks: [{ type: 'p', text: tx('features.settings.twitch.desc') }] },
            ],
        },
        {
            slug: 'share',
            title: tx('features.share.title'),
            excerpt: tx('features.share.description'),
            category: 'advanced',
            catLabel: tx('tabs.advanced'),
            readLabel: readLabel(3),
            accent: '#38bdf8', accent2: '#0284c7', icon: Share2,
            sections: [
                {
                    id: 'how', heading: tx('features.share.how'), blocks: [
                        { type: 'p', text: tx('features.share.how.desc') },
                        img('share-copied.webp', 1440, 900, tx('img.shareCopied.alt'), tx('img.shareCopied.cap')),
                    ],
                },
                { id: 'format', heading: tx('features.share.format'), blocks: [{ type: 'p', text: tx('features.share.format.desc') }] },
                { id: 'limits', heading: tx('features.share.limits'), blocks: [{ type: 'callout', title: tx('features.favorites.proTip'), text: tx('features.share.limits.desc') }] },
            ],
        },
        {
            slug: 'shortcuts',
            title: tx('features.shortcuts.title'),
            excerpt: tx('features.shortcuts.description'),
            category: 'advanced',
            catLabel: tx('tabs.advanced'),
            readLabel: readLabel(3),
            accent: '#fb923c', accent2: '#ea580c', icon: Keyboard,
            sections: [
                {
                    id: 'global', heading: tx('features.shortcuts.global'), blocks: [
                        { type: 'p', text: tx('features.shortcuts.global.desc') },
                        img('hotkey-help.webp', 1440, 900, tx('img.hotkeyHelp.alt'), tx('img.hotkeyHelp.cap')),
                    ],
                },
                { id: 'window', heading: tx('features.shortcuts.window'), blocks: [{ type: 'p', text: tx('features.shortcuts.window.desc') }] },
                {
                    id: 'theater', heading: tx('features.shortcuts.theater'), blocks: [
                        { type: 'p', text: tx('features.shortcuts.theater.desc') },
                        img('theater-mode.webp', 1440, 900, tx('img.theaterMode.alt'), tx('img.theaterMode.cap')),
                    ],
                },
            ],
        },
    ], [i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps

    const cats = useMemo(() => ([
        { id: 'all', label: tx('blog.cat.all', { defaultValue: '全部' }) },
        { id: 'basics', label: tx('tabs.basics') },
        { id: 'advanced', label: tx('tabs.advanced') },
    ]), [i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps

    const article = articles.find((a) => a.slug === slug);

    // 開啟/切換文章時捲回頂端
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'auto' });
    }, [slug]);

    return (
        <div className="tut-page">
            {/* 樣式對齊 design Blog.jsx,沿用 next 的 oklch token */}
            <style>{`
                .tut-page { min-height: 100vh; background: var(--background); color: var(--foreground); }
                .tut-wrap { max-width: 1080px; margin: 0 auto; padding: 40px 24px 96px; }

                /* stretched-link:卡片標題內的 <a> 用 ::after 鋪滿整張卡,整卡可點且仍是真實連結 */
                .tut-featured, .tut-card, .tut-ucard, .tut-row { position: relative; }
                .tut-card-link { color: inherit; text-decoration: none; }
                .tut-card-link::after { content: ''; position: absolute; inset: 0; z-index: 1; }
                .tut-card-link:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 4px; }
                .tut-crumbs { margin-bottom: 14px; font-size: 13px; color: var(--muted-foreground); }
                .tut-crumbs ol { list-style: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0; padding: 0; }
                .tut-crumbs a { color: var(--muted-foreground); text-decoration: none; }
                .tut-crumbs a:hover { color: var(--foreground); }
                .tut-crumbs li[aria-current="page"] { color: var(--foreground); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60vw; }
                .tut-crumbs li[aria-hidden] { display: inline-flex; opacity: 0.5; }

                .tut-mast { margin-bottom: 36px; }
                .tut-eyebrow-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
                .tut-eyebrow { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em; color: var(--primary); }
                .tut-eyebrow-line { height: 1px; flex: 1; background: linear-gradient(90deg, var(--primary), transparent); }
                .tut-mast-title { font-size: 46px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 14px; line-height: 1.08; color: var(--foreground); }
                .tut-mast-sub { font-size: 18px; color: var(--muted-foreground); margin: 0; max-width: 620px; line-height: 1.6; }

                .tut-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
                .tut-search { position: relative; flex: 1; min-width: 240px; }
                .tut-search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--muted-foreground); pointer-events: none; }
                .tut-search-input { width: 100%; height: 44px; padding: 0 14px 0 40px; box-sizing: border-box; background: var(--card); border: 1px solid var(--border); border-radius: 10px; color: var(--foreground); font-family: var(--font-sans); font-size: 15px; outline: none; }
                .tut-layout-switch { display: flex; padding: 3px; gap: 2px; background: var(--card); border: 1px solid var(--border); border-radius: 10px; }
                .tut-layout-btn { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px; border-radius: 7px; border: 0; cursor: pointer; font-family: var(--font-sans); font-size: 13px; font-weight: 600; background: transparent; color: var(--muted-foreground); transition: all 0.15s; }
                .tut-layout-btn.on { background: var(--primary); color: var(--primary-foreground); }

                .tut-cats { display: flex; gap: 8px; margin-bottom: 32px; flex-wrap: wrap; }
                .tut-cat { height: 34px; padding: 0 14px; border-radius: 9999px; cursor: pointer; font-family: var(--font-sans); font-size: 13px; font-weight: 600; background: var(--card); color: var(--muted-foreground); border: 1px solid var(--border); transition: all 0.15s; }
                .tut-cat.on { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); }

                .tut-empty { text-align: center; padding: 80px 0; color: var(--muted-foreground); }
                .tut-empty p { margin-top: 16px; font-size: 16px; }

                .tut-hero-block { position: relative; border-radius: 14px; overflow: hidden; flex-shrink: 0; }
                .tut-hero-overlay { position: absolute; inset: 0; background: radial-gradient(circle at 75% 25%, rgba(255,255,255,0.25), transparent 60%); }
                .tut-hero-icon { position: absolute; color: rgba(255,255,255,0.85); }
                .tut-hero-cat { position: absolute; top: 14px; left: 14px; padding: 3px 10px; border-radius: 9999px; background: rgba(0,0,0,0.35); backdrop-filter: blur(6px); color: #fff; font-size: 11px; font-weight: 700; letter-spacing: 0.02em; }

                .tut-meta { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted-foreground); }
                .tut-meta-read { display: inline-flex; align-items: center; gap: 4px; }

                .tut-featured { display: grid; grid-template-columns: 1.1fr 1fr; gap: 28px; align-items: center; padding: 24px; border-radius: 20px; cursor: pointer; background: var(--card); border: 1px solid var(--border); box-shadow: 0 24px 60px -24px rgba(0,0,0,0.45); }
                .tut-featured-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }
                .tut-featured-title { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 12px; line-height: 1.15; color: var(--foreground); }
                .tut-featured-excerpt { font-size: 15.5px; color: var(--muted-foreground); margin: 0 0 18px; line-height: 1.65; }
                .tut-read-more { margin-top: 20px; display: inline-flex; align-items: center; gap: 6px; color: var(--primary); font-weight: 600; font-size: 15px; }

                .tut-grid-mag { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 24px; }
                .tut-card { display: flex; flex-direction: column; cursor: pointer; border-radius: 16px; overflow: hidden; background: var(--card); border: 1px solid var(--border); transition: transform 0.15s, border-color 0.15s; }
                .tut-card:hover { transform: translateY(-3px); border-color: var(--primary); }
                .tut-card-pad { padding: 14px; padding-bottom: 0; }
                .tut-card-body { padding: 16px 18px 20px; }
                .tut-card-title { font-size: 18.5px; font-weight: 700; margin: 0 0 8px; line-height: 1.3; color: var(--foreground); }
                .tut-card-excerpt { font-size: 14px; color: var(--muted-foreground); margin: 0 0 14px; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

                .tut-grid-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
                .tut-ucard { display: flex; flex-direction: column; cursor: pointer; border-radius: 16px; overflow: hidden; background: var(--card); border: 1px solid var(--border); transition: transform 0.15s, border-color 0.15s; height: 100%; }
                .tut-ucard:hover { transform: translateY(-3px); border-color: var(--primary); }
                .tut-ucard-body { padding: 14px 16px 18px; display: flex; flex-direction: column; flex: 1; }
                .tut-ucard-title { font-size: 16.5px; font-weight: 700; margin: 0 0 8px; line-height: 1.3; color: var(--foreground); }
                .tut-ucard-excerpt { font-size: 13.5px; color: var(--muted-foreground); margin: 0 0 14px; line-height: 1.55; flex: 1; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

                .tut-list { display: flex; flex-direction: column; }
                .tut-row { display: flex; align-items: center; gap: 20px; padding: 20px 4px; cursor: pointer; border-bottom: 1px solid var(--border); }
                .tut-row.first { border-top: 1px solid var(--border); }
                .tut-row-hero { width: 96px; flex-shrink: 0; }
                .tut-row-body { flex: 1; min-width: 0; }
                .tut-row-cat { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
                .tut-row-title { font-size: 19px; font-weight: 700; margin: 4px 0 6px; transition: color 0.15s; color: var(--foreground); }
                .tut-row:hover .tut-row-title { color: var(--primary); }
                .tut-row-excerpt { font-size: 14px; color: var(--muted-foreground); margin: 0; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
                .tut-row-meta { flex-shrink: 0; text-align: right; }
                .tut-row-chevron { color: var(--muted-foreground); flex-shrink: 0; }

                .tut-back { display: inline-flex; align-items: center; gap: 7px; margin-bottom: 28px; padding: 8px 14px 8px 10px; background: var(--card); border: 1px solid var(--border); border-radius: 9999px; cursor: pointer; color: var(--muted-foreground); font-family: var(--font-sans); font-size: 13.5px; font-weight: 600; }
                .tut-back:hover { color: var(--foreground); }
                .tut-art-head { margin-bottom: 28px; }
                .tut-art-cat-row { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
                .tut-art-cat { padding: 4px 12px; border-radius: 9999px; font-size: 12.5px; font-weight: 700; }
                .tut-art-title { font-size: 42px; font-weight: 800; letter-spacing: -0.025em; margin: 0 0 16px; line-height: 1.12; color: var(--foreground); }
                .tut-art-excerpt { font-size: 19px; color: var(--muted-foreground); margin: 0; line-height: 1.6; max-width: 720px; }
                .tut-author-row { display: flex; align-items: center; gap: 12px; margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border); }
                .tut-avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 16px; flex-shrink: 0; }
                .tut-author-name { font-size: 14px; font-weight: 600; color: var(--foreground); }

                .tut-art-body { display: grid; grid-template-columns: 220px 1fr; gap: 48px; margin-top: 40px; align-items: start; }
                .tut-toc { position: sticky; top: 88px; }
                .tut-toc-label { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted-foreground); margin-bottom: 14px; }
                .tut-toc-nav { display: flex; flex-direction: column; gap: 2px; border-left: 1px solid var(--border); }
                .tut-toc-btn { text-align: left; padding: 7px 0 7px 16px; margin-left: -1px; cursor: pointer; background: transparent; border: none; border-left: 2px solid transparent; color: var(--muted-foreground); font-weight: 500; font-family: var(--font-sans); font-size: 13.5px; line-height: 1.4; transition: color 0.15s; }
                .tut-toc-btn.on { border-left-color: var(--primary); color: var(--foreground); font-weight: 600; }
                .tut-content { max-width: 680px; }
                .tut-section { margin-bottom: 44px; scroll-margin-top: 96px; }
                .tut-section-h { font-size: 26px; font-weight: 700; letter-spacing: -0.015em; margin: 0 0 18px; color: var(--foreground); }

                .tut-p { font-size: 16.5px; color: var(--foreground); opacity: 0.92; line-height: 1.78; margin: 0 0 18px; }
                .tut-steps { margin: 0 0 20px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 12px; }
                .tut-step { display: flex; gap: 14px; align-items: flex-start; }
                .tut-step-num { flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%; background: var(--primary); color: var(--primary-foreground); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
                .tut-step-text { font-size: 16px; color: var(--foreground); opacity: 0.92; line-height: 1.6; padding-top: 2px; }
                .tut-fig { margin: 4px 0 22px; }
                .tut-img { display: block; max-width: 100%; height: auto; border: 1px solid var(--border); border-radius: 14px; background: var(--card); }
                .tut-fig-cap { margin-top: 8px; font-size: 13px; color: var(--muted-foreground); line-height: 1.5; }

                .tut-callout { padding: 18px 20px; margin: 0 0 20px; border-radius: 14px; }
                .tut-callout-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
                .tut-callout-title { font-size: 14px; font-weight: 700; }
                .tut-callout-text { font-size: 15px; color: var(--foreground); opacity: 0.88; margin: 0; line-height: 1.6; }

                .tut-related { margin-top: 40px; padding-top: 40px; border-top: 1px solid var(--border); }
                .tut-related-h { font-size: 22px; font-weight: 700; margin: 0 0 20px; color: var(--foreground); }
                .tut-related-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }

                .tut-page a:focus-visible, .tut-page button:focus-visible, .tut-search-input:focus-visible { outline: 2px solid var(--ring, var(--primary)); outline-offset: 3px; border-radius: 8px; }

                @media (max-width: 860px) {
                    .tut-featured { grid-template-columns: 1fr; }
                    .tut-grid-mag, .tut-grid-cards, .tut-related-grid { grid-template-columns: 1fr; }
                    .tut-art-body { grid-template-columns: 1fr; gap: 24px; }
                    .tut-toc { display: none; }
                }
                @media (max-width: 560px) {
                    .tut-mast-title { font-size: 34px; }
                    .tut-art-title { font-size: 32px; }
                }
            `}</style>

            {/* 頂部返回列 — 三靜態頁共用 header */}
            <StaticPageHeader title={tx('title')} analyticsCategory="InstructionsPage" />

            {article
                ? <BlogArticle
                    article={article}
                    allArticles={articles}
                    labels={{
                        allArticles: tx('blog.allArticles', { defaultValue: '所有教學' }),
                        toc: tx('toc'),
                        related: tx('blog.related', { defaultValue: '繼續閱讀' }),
                        team: tx('blog.team', { defaultValue: 'MultiStream Hub 團隊' }),
                        crumbHome: 'MultiStream Hub',
                        crumbHub: tx('title'),
                    }}
                />
                : <BlogList
                    articles={articles}
                    cats={cats}
                    labels={{
                        mastEyebrow: tx('title'),
                        mastTitle: tx('hero.title'),
                        mastSub: tx('hero.subtitle'),
                        searchPlaceholder: tx('blog.searchPlaceholder', { defaultValue: '搜尋教學文章…' }),
                        layoutMagazine: tx('blog.layout.magazine', { defaultValue: '雜誌' }),
                        layoutCards: tx('blog.layout.cards', { defaultValue: '卡片' }),
                        layoutList: tx('blog.layout.list', { defaultValue: '清單' }),
                        featured: tx('blog.featured', { defaultValue: '精選' }),
                        readMore: tx('blog.readMore', { defaultValue: '開始閱讀' }),
                        noResults: (q: string) => tx('blog.noResults', { defaultValue: '找不到符合「{{q}}」的文章', q }),
                    }}
                />}

            <SiteFooter analyticsCategory="InstructionsPage" />
        </div>
    );
}

export default InstructionsPage;
