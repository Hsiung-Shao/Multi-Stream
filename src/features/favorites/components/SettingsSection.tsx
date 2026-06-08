import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../../store/useUIStore';
import { Label } from '../../../components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../../components/ui/select';
import { Switch } from '../../../components/ui/switch';
import { cn } from '../../../components/ui/utils';
import { Sun, Moon, Monitor } from 'lucide-react';

// 設定卡片(對齊設計 FMPanelCard:純標題 + 內容,雙主題 token)
function FMCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="flex-shrink-0 p-6 rounded-2xl border border-border bg-card">
            <h3 className="text-base font-bold text-foreground mb-5">{title}</h3>
            <div className="space-y-5">{children}</div>
        </section>
    );
}

// 一列設定:左 label(+ 說明),右控制項(對齊設計 FMSettingRow)
function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5 min-w-0">
                <Label className="text-sm font-medium text-foreground">{label}</Label>
                {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}

export function SettingsSection() {
    const { t, i18n } = useTranslation(['common', 'favorites']);

    // 主題:讀 raw 選擇值(含 'system')以正確高亮三段切換
    const theme = useUIStore(s => s.theme);
    const setTheme = useUIStore(s => s.setTheme);

    // 播放 / 偵測設定
    const autoMuteNewStream = useUIStore(s => s.autoMuteNewStream);
    const setAutoMuteNewStream = useUIStore(s => s.setAutoMuteNewStream);
    const youtubeRiskWarning = useUIStore(s => s.youtubeRiskWarning);
    const setYoutubeRiskWarning = useUIStore(s => s.setYoutubeRiskWarning);
    const bgLiveDetect = useUIStore(s => s.bgLiveDetect);
    const setBgLiveDetect = useUIStore(s => s.setBgLiveDetect);
    const closeWindowMode = useUIStore(s => s.closeWindowMode);
    const setCloseWindowMode = useUIStore(s => s.setCloseWindowMode);

    const changeLanguage = (lang: string) => {
        i18n.changeLanguage(lang);
        localStorage.setItem('i18nextLng', lang);
    };

    const themeOptions = [
        { id: 'light' as const, Icon: Sun, label: t('favorites:theme_light') },
        { id: 'dark' as const, Icon: Moon, label: t('favorites:theme_dark') },
        { id: 'system' as const, Icon: Monitor, label: t('favorites:theme_system') },
    ];

    return (
        <div className="flex-1 flex flex-col gap-4 max-w-2xl mx-auto w-full py-4 px-2 h-full overflow-y-auto">
            <h2 className="text-xl font-bold text-foreground px-1">{t('favorites:settings')}</h2>

            {/* 外觀 */}
            <FMCard title={t('favorites:appearance')}>
                <SettingRow label={t('favorites:theme')}>
                    <div className="inline-flex gap-1 p-1 rounded-lg bg-muted text-muted-foreground">
                        {themeOptions.map(({ id, Icon, label }) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setTheme(id)}
                                aria-pressed={theme === id}
                                className={cn(
                                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                                    theme === id
                                        ? 'bg-background text-foreground shadow-sm'
                                        : 'hover:text-foreground',
                                )}
                            >
                                <Icon className="size-4" />
                                {label as string}
                            </button>
                        ))}
                    </div>
                </SettingRow>

                <SettingRow label={t('favorites:language')}>
                    <Select value={i18n.language} onValueChange={changeLanguage}>
                        <SelectTrigger className="w-40">
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
                </SettingRow>
            </FMCard>

            {/* 播放 */}
            <FMCard title={t('favorites:playback')}>
                <SettingRow label={t('favorites:auto_mute_new')} desc={t('favorites:auto_mute_new_desc')}>
                    <Switch checked={autoMuteNewStream} onCheckedChange={setAutoMuteNewStream} />
                </SettingRow>

                <SettingRow label={t('favorites:yt_risk_warn')} desc={t('favorites:yt_risk_warn_desc')}>
                    <Switch checked={youtubeRiskWarning} onCheckedChange={setYoutubeRiskWarning} />
                </SettingRow>

                <SettingRow label={t('favorites:bg_live_detect')} desc={t('favorites:bg_live_detect_desc')}>
                    <Switch checked={bgLiveDetect} onCheckedChange={setBgLiveDetect} />
                </SettingRow>

                <SettingRow
                    label={t('favorites:settings.close_window_mode')}
                    desc={t('favorites:settings.close_window_mode_desc')}
                >
                    <Select
                        value={closeWindowMode}
                        onValueChange={(val: 'remove' | 'empty') => setCloseWindowMode(val)}
                    >
                        <SelectTrigger className="w-40">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="remove">{t('favorites:settings.mode_remove')}</SelectItem>
                            <SelectItem value="empty">{t('favorites:settings.mode_empty')}</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>
            </FMCard>
        </div>
    );
}
