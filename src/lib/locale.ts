// VTuber 主要語言常數(對齊 i18n locale code + DB vtubers.languages text[])
// 跟 i18n 站台語言一致:zh-TW、zh-CN、en、ja、ko

export const SUPPORTED_VTUBER_LANGS = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'] as const;
export type VtuberLang = typeof SUPPORTED_VTUBER_LANGS[number];

export const LANG_LABEL: Record<VtuberLang, string> = {
    'zh-TW': '繁體中文',
    'zh-CN': '简体中文',
    'en': 'English',
    'ja': '日本語',
    'ko': '한국어',
};

export function i18nToVtuberLang(locale: string): VtuberLang | null {
    return (SUPPORTED_VTUBER_LANGS as readonly string[]).includes(locale)
        ? (locale as VtuberLang)
        : null;
}
