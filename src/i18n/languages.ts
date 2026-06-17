// 支援語言清單(endonym 原生語名,語言選單慣例上不需翻譯)。
// 注意:AboutPage/PrivacyPage/Navbar/LandingPage/MobileSettingsPage 各自仍有
// 重複定義,後續清理時應統一改用此常數。
export const SUPPORTED_LANGUAGES = [
    { value: 'zh-TW', label: '繁體中文' },
    { value: 'zh-CN', label: '简体中文' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]['value'];
