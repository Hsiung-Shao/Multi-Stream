/**
 * JSON-LD 組裝 helper（給 <SEO jsonLd> 用）。
 * 與 index.html 靜態三段（WebApplication #webapp / WebSite #website / Organization #organization）
 * 以 @id 互相引用，頁面專屬 schema 只描述「這一頁」，不重複整個實體。
 */
import { SEO_SITE_URL } from './defaults';

export const ORG_ID = `${SEO_SITE_URL}/#organization`;
export const SITE_ID = `${SEO_SITE_URL}/#website`;
export const APP_ID = `${SEO_SITE_URL}/#webapp`;
export const PERSON_ID = `${SEO_SITE_URL}/about/creator#person`;

export type JsonLdNode = Record<string, unknown>;

/** 多個節點包成單一 @graph（<SEO> 只注入一個 script，同頁多 schema 走這裡） */
export const graph = (...nodes: JsonLdNode[]): JsonLdNode => ({
    '@context': 'https://schema.org',
    '@graph': nodes,
});

export interface BreadcrumbItem { name: string; path: string }

/** BreadcrumbList：path 為站內路徑（'/'、'/instructions'、'/instructions/canvas'…） */
export const breadcrumb = (items: BreadcrumbItem[]): JsonLdNode => ({
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: it.name,
        item: `${SEO_SITE_URL}${it.path}`,
    })),
});

export type WebPageType = 'WebPage' | 'AboutPage' | 'CollectionPage' | 'ProfilePage';

/** 頁面節點（WebPage 及其子型別），@id = 頁面 URL + '#webpage' */
export const webPage = (opts: {
    type?: WebPageType;
    path: string;
    name: string;
    description: string;
    inLanguage: string;
    extra?: JsonLdNode;
}): JsonLdNode => ({
    '@type': opts.type ?? 'WebPage',
    '@id': `${SEO_SITE_URL}${opts.path}#webpage`,
    url: `${SEO_SITE_URL}${opts.path}`,
    name: opts.name,
    description: opts.description,
    inLanguage: opts.inLanguage,
    isPartOf: { '@id': SITE_ID },
    about: { '@id': APP_ID },
    ...(opts.extra ?? {}),
});

/** 教學文章：author/publisher 指 Organization（畫面 byline 為「MultiStream Hub 團隊」，與之一致） */
export const techArticle = (opts: {
    path: string;
    headline: string;
    description: string;
    image: string;
    inLanguage: string;
    datePublished: string;
    dateModified: string;
}): JsonLdNode => ({
    '@type': 'TechArticle',
    '@id': `${SEO_SITE_URL}${opts.path}#article`,
    headline: opts.headline,
    description: opts.description,
    image: opts.image,
    inLanguage: opts.inLanguage,
    mainEntityOfPage: { '@id': `${SEO_SITE_URL}${opts.path}` },
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    datePublished: opts.datePublished,
    dateModified: opts.dateModified,
    isPartOf: { '@id': SITE_ID },
    about: { '@id': APP_ID },
});

/** 教學內容的最後修改日：build 時由 vite.config 以 git lastmod 注入（失敗退回 build 日） */
export const GUIDES_DATE_MODIFIED: string =
    typeof __GUIDES_DATE_MODIFIED__ !== 'undefined' ? __GUIDES_DATE_MODIFIED__ : new Date().toISOString().slice(0, 10);
