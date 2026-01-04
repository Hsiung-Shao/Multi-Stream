import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';
import { Switch } from '../../../components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../../components/ui/select';
import { Separator } from '../../../components/ui/separator';
import { Github, Info, Globe, Moon, Sun, Monitor, Coffee } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';

interface SettingsSectionProps {
    theme: 'light' | 'dark';
    currentTheme: string;
    onThemeChange: (theme: string) => void;
}

// Custom Icons
const DiscordIcon = (props: any) => (
    <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M18.8943 4.34383C17.5238 3.69396 16.0595 3.21852 14.5367 2.94635C14.5126 2.94273 14.4883 2.95663 14.4754 2.97869C14.2882 3.32832 14.0839 3.79951 13.9452 4.14856C12.3364 3.9037 10.7388 3.9037 9.15579 4.14856C9.01826 3.79951 8.81273 3.32832 8.62678 2.97869C8.61386 2.95663 8.58957 2.94273 8.56543 2.94635C7.03893 3.21852 5.57583 3.69396 4.20531 4.34383C4.19323 4.35035 4.18478 4.36122 4.18055 4.3739C1.39659 8.75678 0.635817 13.0645 1.00942 17.3323C1.01185 17.3582 1.02634 17.3823 1.04808 17.3986C2.88392 18.8344 4.66428 19.7067 6.41703 20.2796C6.44047 20.2878 6.46581 20.2818 6.48273 20.2638C6.90308 19.6706 7.28198 19.0396 7.61051 18.3754C7.625 18.346 7.61051 18.3116 7.5791 18.2989C6.96348 18.0541 6.37792 17.7651 5.81971 17.4357C5.77502 17.4098 5.77139 17.3458 5.81367 17.3115C5.93448 17.2166 6.05286 17.1189 6.16763 17.0187C6.18333 17.0048 6.20507 17.0012 6.2238 17.0102C9.65487 18.6657 13.4616 18.6657 16.867 17.0102C16.8857 17.0006 16.9075 17.0048 16.9232 17.0187C17.0392 17.1195 17.1576 17.2172 17.2796 17.3115C17.3219 17.3458 17.3183 17.4086 17.2736 17.4357C16.7142 17.7645 16.1287 18.0535 15.5119 18.2989C15.4805 18.3116 15.466 18.346 15.4805 18.3754C15.8102 19.0396 16.1891 19.6706 16.6083 20.2638C16.6252 20.2818 16.6506 20.2872 16.674 20.2796C18.428 19.7067 20.2084 18.8344 22.0454 17.3986C22.0671 17.3823 22.0816 17.3582 22.084 17.3323C22.5273 12.636 21.3651 8.35821 18.91 4.3739C18.9051 4.36122 18.8979 4.35035 18.8943 4.34383ZM7.67451 14.1504C6.65787 14.1504 5.81971 13.1558 5.81971 11.9366C5.81971 10.7175 6.63371 9.72288 7.67451 9.72288C8.72753 9.72288 9.55375 10.7296 9.52959 11.9366C9.52959 13.1558 8.71545 14.1504 7.67451 14.1504ZM15.426 14.1504C14.4094 14.1504 13.5712 13.1558 13.5712 11.9366C13.5712 10.7175 14.3852 9.72288 15.426 9.72288C16.479 9.72288 17.3052 10.7296 17.281 11.9366C17.281 13.1558 16.467 14.1504 15.426 14.1504Z" />
    </svg>
);

const XIcon = (props: any) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
        <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
    </svg>
);

export function SettingsSection({ theme, currentTheme, onThemeChange }: SettingsSectionProps) {
    const { t, i18n } = useTranslation(['common', 'favorites']);

    const toggleTheme = (value: string) => {
        onThemeChange(value);
    };

    const changeLanguage = (lang: string) => {
        i18n.changeLanguage(lang);
        localStorage.setItem('i18nextLng', lang);
    };

    return (
        <div className="flex-1 flex flex-col gap-8 max-w-2xl mx-auto w-full py-4 px-2">

            {/* Appearance */}
            <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                        <Monitor className="size-5" />
                    </div>
                    <h3 className="text-lg font-bold font-normal">{t('settings:appearance') || '外觀設定'}</h3>
                </div>

                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <Label className="text-base">{t('settings:theme') || '主題模式'}</Label>
                            <p className="text-sm text-gray-500">切換應用程式的亮色或暗色外觀</p>
                        </div>
                        <Select value={currentTheme} onValueChange={toggleTheme}>
                            <SelectTrigger className="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="light">
                                    <div className="flex items-center gap-2">
                                        <Sun className="size-4" />
                                        <span>Light</span>
                                    </div>
                                </SelectItem>
                                <SelectItem value="dark">
                                    <div className="flex items-center gap-2">
                                        <Moon className="size-4" />
                                        <span>Dark</span>
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <Separator className={theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'} />

                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <Label className="text-base">{t('settings:language') || '顯示語言'}</Label>
                            <p className="text-sm text-gray-500">選擇您偏好的介面語言</p>
                        </div>
                        <Select value={i18n.language} onValueChange={changeLanguage}>
                            <SelectTrigger className="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="zh-TW">繁體中文</SelectItem>
                                <SelectItem value="zh-CN">简体中文</SelectItem>
                                <SelectItem value="en">English</SelectItem>
                                <SelectItem value="ja">日本語</SelectItem>
                                <SelectItem value="ko">한국어</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* About */}
            <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500">
                        <Info className="size-5" />
                    </div>
                    <h3 className="text-lg font-bold font-normal">{t('settings:about') || '關於'}</h3>
                </div>

                <div className="space-y-4">
                    <p className="text-sm text-gray-500 leading-relaxed">
                        Multi-Stream 是一個開源的多串流觀看平台，致力於提供最佳的觀看體驗。
                    </p>

                    <div className="flex flex-wrap gap-3 pt-2">
                        <a
                            href="https://github.com/Hsiung-Shao"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${theme === 'dark'
                                    ? 'border-gray-700 hover:bg-gray-800'
                                    : 'border-gray-200 hover:bg-gray-50'
                                }`}
                        >
                            <Github className="size-4" />
                            <span className="text-sm font-medium">GitHub</span>
                        </a>
                        <a
                            href="https://discord.gg/3Uu6dZbtKd"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${theme === 'dark'
                                    ? 'border-gray-700 hover:bg-[#5865F2]/20 hover:text-[#5865F2]'
                                    : 'border-gray-200 hover:bg-[#5865F2]/10 hover:text-[#5865F2]'
                                }`}
                            style={{ color: '#5865F2' }}
                        >
                            <DiscordIcon className="size-4" />
                            <span className="text-sm font-medium">Discord</span>
                        </a>
                        <a
                            href="https://x.com/Hsiungshao"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${theme === 'dark'
                                    ? 'border-gray-700 hover:bg-gray-800'
                                    : 'border-gray-200 hover:bg-gray-50'
                                }`}
                        >
                            <XIcon className="size-4" />
                            <span className="text-sm font-medium">X (Twitter)</span>
                        </a>
                        <a
                            href="https://buymeacoffee.com/hsiung"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${theme === 'dark'
                                    ? 'border-gray-700 hover:bg-[#FFDD00]/20 hover:text-[#FFDD00]'
                                    : 'border-gray-200 hover:bg-[#FFDD00]/10 hover:text-[#FFDD00]'
                                }`}
                            style={{ color: '#FFDD00' }} // Standard BuyMeACoffee Yellow-ish (actually usually yellow/orange but let's stick to a readable gold)
                        >
                            <Coffee className="size-4" />
                            <span className="text-sm font-medium">Sponsor</span>
                        </a>
                    </div>

                    <div className="pt-4 flex items-center gap-2 text-xs text-gray-500">
                        <span>Version 2.3.1</span>
                        <span>•</span>
                        <span>© 2026 Multi-Stream</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
