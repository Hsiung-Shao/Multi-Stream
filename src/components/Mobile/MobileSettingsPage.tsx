import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/useUIStore';
import { useEffectiveTheme } from '../../hooks/useEffectiveTheme';
import { Sun, Moon, Globe, Info, FileText, HelpCircle, MessageSquareHeart, History } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';

export function MobileSettingsPage() {
    const { t, i18n } = useTranslation();
    const theme = useEffectiveTheme();
    const toggleTheme = useUIStore(s => s.toggleTheme);
    const setPage = useUIStore(s => s.setPage);
    const openModal = useUIStore(s => s.openModal);

    const languages = [
        { value: 'zh-TW', label: '繁體中文' },
        { value: 'zh-CN', label: '簡體中文' },
        { value: 'en', label: 'English' },
        { value: 'ja', label: '日本語' },
        { value: 'ko', label: '한국어' },
    ];

    return (
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-20">
            <h1 className="text-2xl font-bold mb-6">{t('mobile.settings.title', '設定')}</h1>

            {/* Theme */}
            <section className="mb-6">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {t('mobile.settings.appearance', '外觀')}
                </h2>
                <div className="rounded-xl bg-gray-900/50 border border-white/5 overflow-hidden">
                    <button
                        onClick={toggleTheme}
                        className="flex items-center gap-3 w-full px-4 py-3 text-left active:bg-white/5 transition-colors"
                    >
                        {theme === 'dark' ? <Moon className="w-5 h-5 text-blue-400" /> : <Sun className="w-5 h-5 text-yellow-400" />}
                        <span className="flex-1 text-sm font-medium">
                            {t('mobile.settings.theme', '主題')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {theme === 'dark' ? t('mobile.settings.dark', '深色') : t('mobile.settings.light', '淺色')}
                        </span>
                    </button>
                </div>
            </section>

            {/* Language */}
            <section className="mb-6">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {t('mobile.settings.language', '語言')}
                </h2>
                <div className="rounded-xl bg-gray-900/50 border border-white/5 overflow-hidden px-4 py-3">
                    <div className="flex items-center gap-3">
                        <Globe className="w-5 h-5 text-muted-foreground" />
                        <Select value={i18n.language} onValueChange={(value: string) => i18n.changeLanguage(value)}>
                            <SelectTrigger className="flex-1 h-9 bg-transparent border-white/10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {languages.map((lang) => (
                                    <SelectItem key={lang.value} value={lang.value}>
                                        {lang.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </section>

            {/* Links */}
            <section className="mb-6">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {t('mobile.settings.more', '更多')}
                </h2>
                <div className="rounded-xl bg-gray-900/50 border border-white/5 overflow-hidden divide-y divide-white/5">
                    <SettingsLink icon={Info} label={t('landing.footer.about', '關於')} onClick={() => setPage('about')} />
                    <SettingsLink icon={HelpCircle} label={t('landing.footer.faq', '常見問題')} onClick={() => setPage('faq')} />
                    <SettingsLink icon={FileText} label={t('landing.footer.tutorial', '使用教學')} onClick={() => setPage('instructions')} />
                    <SettingsLink icon={MessageSquareHeart} label={t('mobile.settings.feedback', '意見回饋')} onClick={() => openModal('feedback')} />
                    <SettingsLink icon={History} label={t('mobile.settings.version_history', '版本紀錄')} onClick={() => openModal('history')} />
                </div>
            </section>

            {/* Version */}
            <p className="text-center text-xs text-muted-foreground/50 mt-8">
                MultiStream Hub v{(window as any).__APP_VERSION__ || '3.0.2'}
            </p>
        </div>
    );
}

function SettingsLink({ icon: Icon, label, onClick }: { icon: typeof Info; label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-3 w-full px-4 py-3 text-left active:bg-white/5 transition-colors"
        >
            <Icon className="w-5 h-5 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">{label}</span>
            <span className="text-muted-foreground/50 text-lg">›</span>
        </button>
    );
}
