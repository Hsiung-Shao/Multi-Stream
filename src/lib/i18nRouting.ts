export const SUPPORTED_LANGS = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'] as const;
export type SupportedLang = typeof SUPPORTED_LANGS[number];

export const DEFAULT_LANG: SupportedLang = 'zh-TW';
export const X_DEFAULT_LANG: SupportedLang = 'en';

const LANG_REGEX = /^\/(zh-TW|zh-CN|en|ja|ko)(\/.*)?$/;

const PATH_TO_PAGE = {
  '/': 'home',
  '/tools': 'tool',
  '/about': 'about',
  '/privacy': 'privacy',
  '/canvas': 'canvas',
  '/instructions': 'instructions',
  '/faq': 'faq',
  '/admin': 'admin',
  '/vtubers': 'vtuber-explore',
} as const;

export type RoutablePage = typeof PATH_TO_PAGE[keyof typeof PATH_TO_PAGE];

const PAGE_TO_PATH: Record<RoutablePage, string> = {
  'home': '/',
  'tool': '/tools',
  'about': '/about',
  'privacy': '/privacy',
  'canvas': '/canvas',
  'instructions': '/instructions',
  'faq': '/faq',
  'admin': '/admin',
  'vtuber-explore': '/vtubers',
};

export const OG_LOCALE_MAP: Record<SupportedLang, string> = {
  'zh-TW': 'zh_TW',
  'zh-CN': 'zh_CN',
  'en': 'en_US',
  'ja': 'ja_JP',
  'ko': 'ko_KR',
};

export function isSupportedLang(value: unknown): value is SupportedLang {
  return typeof value === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(value);
}

export interface ParsedPath {
  lang: SupportedLang | null;
  subpath: string;
}

export function parsePath(pathname: string): ParsedPath {
  const normalized = pathname.replace(/\.html$/, '');
  const match = normalized.match(LANG_REGEX);
  if (match) {
    const lang = match[1] as SupportedLang;
    const subpath = match[2] && match[2] !== '/' ? match[2].replace(/\/$/, '') : '/';
    return { lang, subpath };
  }
  const subpath = normalized.replace(/\/$/, '') || '/';
  return { lang: null, subpath };
}

export function pathToPage(subpath: string): RoutablePage | 'not-found' {
  const normalized = subpath.replace(/\/$/, '') || '/';
  return (PATH_TO_PAGE as Record<string, RoutablePage>)[normalized] ?? 'not-found';
}

export function pageToPath(page: RoutablePage): string {
  return PAGE_TO_PATH[page];
}

export function isRoutablePage(page: string): page is RoutablePage {
  return page in PAGE_TO_PATH;
}

export function buildLangUrl(lang: SupportedLang, subpath: string): string {
  const cleaned = subpath === '/' ? '' : subpath;
  return `/${lang}${cleaned}`;
}

export function buildAbsoluteUrl(lang: SupportedLang, subpath: string, origin = 'https://multistreaming.org'): string {
  const cleaned = subpath === '/' ? '/' : subpath;
  return `${origin}/${lang}${cleaned === '/' ? '' : cleaned}`;
}
