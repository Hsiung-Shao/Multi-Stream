// 靜態內容頁(Instructions / FAQ / About)共用的頂部 sticky header。
// 視覺基準沿用 InstructionsPage 原有返回列;左=返回首頁、中=頁面標題(md+)、
// 右=語言切換 + 光暗主題切換 + 前往 Canvas CTA。
// 導航/語言/主題邏輯都在元件內部取用 hooks,各頁只需傳入已翻譯的標題。

import { Home, Globe, Sun, Moon, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../store/useUIStore';
import { useEffectiveTheme } from '../hooks/useEffectiveTheme';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import { logEvent } from '../utils/analytics';

interface StaticPageHeaderProps {
    /** 已翻譯的頁面標題(各頁自行 t('title') 後傳入,語言切換時隨父層 re-render 更新) */
    title: string;
    /** GA 事件 category,沿用各頁既有命名以維持報表連續性 */
    analyticsCategory?: string;
}

export function StaticPageHeader({ title, analyticsCategory = 'StaticPageHeader' }: StaticPageHeaderProps) {
    const { t, i18n } = useTranslation('common');
    const setPage = useUIStore((s) => s.setPage);
    const toggleTheme = useUIStore((s) => s.toggleTheme);
    const theme = useEffectiveTheme();

    return (
        <div className="sticky top-0 z-50 flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-md">
            {/* 左:返回首頁 */}
            <button
                onClick={() => setPage('home')}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors shrink-0"
            >
                <Home size={15} />
                <span className="hidden sm:inline">{t('header.backHome')}</span>
            </button>

            {/* 中:標題 — 絕對置中,避免左右兩側寬度不對稱造成偏移 */}
            <span className="hidden md:block absolute left-1/2 -translate-x-1/2 max-w-[40%] truncate text-sm font-semibold text-foreground">
                {title}
            </span>

            {/* 右:語言 / 主題 / Canvas CTA */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <Select value={i18n.language} onValueChange={(v: string) => i18n.changeLanguage(v)}>
                    <SelectTrigger
                        aria-label={t('header.language')}
                        className="h-9 w-9 justify-center px-0 sm:w-auto sm:min-w-[130px] sm:justify-between sm:px-3 bg-card border-border text-foreground [&>svg:last-child]:hidden sm:[&>svg:last-child]:block"
                    >
                        <Globe className="size-4 shrink-0" />
                        <span className="hidden sm:inline truncate"><SelectValue /></span>
                    </SelectTrigger>
                    <SelectContent>
                        {SUPPORTED_LANGUAGES.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('header.toggleTheme')}
                    onClick={() => {
                        toggleTheme();
                        logEvent(analyticsCategory, 'toggle_theme', theme === 'dark' ? 'light' : 'dark');
                    }}
                    className="text-muted-foreground hover:text-foreground"
                >
                    {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
                </Button>

                <button
                    onClick={() => setPage('canvas')}
                    className="inline-flex items-center gap-1.5 h-9 px-3 sm:px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                    <span className="hidden sm:inline">{t('header.toCanvas')}</span>
                    <span className="sm:hidden">Canvas</span>
                    <ArrowRight size={14} />
                </button>
            </div>
        </div>
    );
}
