import type { ComponentType } from 'react';
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
import { ScrollArea } from '../../../components/ui/scroll-area';
import { cn } from '../../../components/ui/utils';
import { Sun, Moon, Monitor, Github, Coffee, MessageSquare } from 'lucide-react';
import { logEvent } from '../../../utils/analytics';

// 品牌外連(對齊 AboutPage / 全站統一連結;Discord 用統一邀請碼,非舊版過期碼)
const GITHUB_URL = 'https://github.com/Hsiung-Shao';
const DISCORD_URL = 'https://discord.gg/47kauArepY';
const X_URL = 'https://x.com/Hsiungshao';
const COFFEE_URL = 'https://buymeacoffee.com/hsiung';

// 品牌 icon(lucide 無 Discord / X 品牌標誌,沿用收藏管理舊版自繪 SVG)
const DiscordIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.8943 4.34383C17.5238 3.69396 16.0595 3.21852 14.5367 2.94635C14.5126 2.94273 14.4883 2.95663 14.4754 2.97869C14.2882 3.32832 14.0839 3.79951 13.9452 4.14856C12.3364 3.9037 10.7388 3.9037 9.15579 4.14856C9.01826 3.79951 8.81273 3.32832 8.62678 2.97869C8.61386 2.95663 8.58957 2.94273 8.56543 2.94635C7.03893 3.21852 5.57583 3.69396 4.20531 4.34383C4.19323 4.35035 4.18478 4.36122 4.18055 4.3739C1.39659 8.75678 0.635817 13.0645 1.00942 17.3323C1.01185 17.3582 1.02634 17.3823 1.04808 17.3986C2.88392 18.8344 4.66428 19.7067 6.41703 20.2796C6.44047 20.2878 6.46581 20.2818 6.48273 20.2638C6.90308 19.6706 7.28198 19.0396 7.61051 18.3754C7.625 18.346 7.61051 18.3116 7.5791 18.2989C6.96348 18.0541 6.37792 17.7651 5.81971 17.4357C5.77502 17.4098 5.77139 17.3458 5.81367 17.3115C5.93448 17.2166 6.05286 17.1189 6.16763 17.0187C6.18333 17.0048 6.20507 17.0012 6.2238 17.0102C9.65487 18.6657 13.4616 18.6657 16.867 17.0102C16.8857 17.0006 16.9075 17.0048 16.9232 17.0187C17.0392 17.1195 17.1576 17.2172 17.2796 17.3115C17.3219 17.3458 17.3183 17.4086 17.2736 17.4357C16.7142 17.7645 16.1287 18.0535 15.5119 18.2989C15.4805 18.3116 15.466 18.346 15.4805 18.3754C15.8102 19.0396 16.1891 19.6706 16.6083 20.2638C16.6252 20.2818 16.6506 20.2872 16.674 20.2796C18.428 19.7067 20.2084 18.8344 22.0454 17.3986C22.0671 17.3823 22.0816 17.3582 22.084 17.3323C22.5273 12.636 21.3651 8.35821 18.91 4.3739C18.9051 4.36122 18.8979 4.35035 18.8943 4.34383ZM7.67451 14.1504C6.65787 14.1504 5.81971 13.1558 5.81971 11.9366C5.81971 10.7175 6.63371 9.72288 7.67451 9.72288C8.72753 9.72288 9.55375 10.7296 9.52959 11.9366C9.52959 13.1558 8.71545 14.1504 7.67451 14.1504ZM15.426 14.1504C14.4094 14.1504 13.5712 13.1558 13.5712 11.9366C13.5712 10.7175 14.3852 9.72288 15.426 9.72288C16.479 9.72288 17.3052 10.7296 17.281 11.9366C17.281 13.1558 16.467 14.1504 15.426 14.1504Z" />
    </svg>
);

const XIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
        <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
    </svg>
);

// 設定卡片(對齊設計 FMPanelCard:純標題 + 內容,雙主題 token)
function FMCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="flex-shrink-0 p-6 rounded-2xl border border-border bg-card">
            <h3 className="text-base font-bold text-foreground mb-5">{title}</h3>
            <div className="space-y-5">{children}</div>
        </section>
    );
}

// 分段切換鈕(主題三段切換、動態島樣式/大小/停靠邊皆用同一套樣式)
function SegmentedControl<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: { id: T; label: string; Icon?: ComponentType<{ className?: string }> }[];
    onChange: (id: T) => void;
}) {
    return (
        <div className="inline-flex gap-1 p-1 rounded-lg bg-muted text-muted-foreground">
            {options.map(({ id, label, Icon }) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => onChange(id)}
                    aria-pressed={value === id}
                    className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                        value === id
                            ? 'bg-background text-foreground shadow-sm'
                            : 'hover:text-foreground',
                    )}
                >
                    {Icon && <Icon className="size-4" />}
                    {label}
                </button>
            ))}
        </div>
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

    // 動態島樣式(桌面限定)+ 邊緣停靠的凸起大小/停靠邊
    const islandStyle = useUIStore(s => s.islandStyle);
    const setIslandStyle = useUIStore(s => s.setIslandStyle);
    const islandEdgeSize = useUIStore(s => s.islandEdgeSize);
    const setIslandEdgeSize = useUIStore(s => s.setIslandEdgeSize);
    const islandEdgeSide = useUIStore(s => s.islandEdgeSide);
    const setIslandEdgeSide = useUIStore(s => s.setIslandEdgeSide);

    // 播放 / 偵測設定
    const autoMuteNewStream = useUIStore(s => s.autoMuteNewStream);
    const setAutoMuteNewStream = useUIStore(s => s.setAutoMuteNewStream);
    const youtubeRiskWarning = useUIStore(s => s.youtubeRiskWarning);
    const setYoutubeRiskWarning = useUIStore(s => s.setYoutubeRiskWarning);
    const bgLiveDetect = useUIStore(s => s.bgLiveDetect);
    const setBgLiveDetect = useUIStore(s => s.setBgLiveDetect);
    const closeWindowMode = useUIStore(s => s.closeWindowMode);
    const setCloseWindowMode = useUIStore(s => s.setCloseWindowMode);

    // 關於卡的「意見回饋」:先關收藏管理,再開回饋,避免兩個 modal 疊在一起
    const openModal = useUIStore(s => s.openModal);
    const closeModal = useUIStore(s => s.closeModal);
    const handleFeedbackClick = () => {
        logEvent('FavoritesSettings', 'click_social', 'feedback');
        closeModal('favorites');
        openModal('feedback');
    };

    const changeLanguage = (lang: string) => {
        i18n.changeLanguage(lang);
        localStorage.setItem('i18nextLng', lang);
    };

    // 社群外連按鈕共用樣式(對齊現行 token,非舊版硬編 gray)
    const linkBtnClass = 'flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background hover:bg-foreground/[0.04] transition-colors text-sm font-medium text-foreground';

    // 關於卡的社群外連(event 為 GA label,沿用既有值避免事件斷層)
    const socialLinks: {
        key: string;
        url: string;
        Icon: React.ComponentType<{ className?: string }>;
        label: string;
        event: string;
        iconClass: string;
    }[] = [
        { key: 'github', url: GITHUB_URL, Icon: Github, label: 'GitHub', event: 'github', iconClass: 'size-4' },
        { key: 'discord', url: DISCORD_URL, Icon: DiscordIcon, label: 'Discord', event: 'discord', iconClass: 'size-4' },
        { key: 'x', url: X_URL, Icon: XIcon, label: 'X (Twitter)', event: 'twitter', iconClass: 'size-4' },
        { key: 'coffee', url: COFFEE_URL, Icon: Coffee, label: t('favorites:settings.sponsor'), event: 'coffee', iconClass: 'size-4 text-amber-500' },
    ];

    const themeOptions = [
        { id: 'light' as const, Icon: Sun, label: t('favorites:theme_light') },
        { id: 'dark' as const, Icon: Moon, label: t('favorites:theme_dark') },
        { id: 'system' as const, Icon: Monitor, label: t('favorites:theme_system') },
    ];

    const islandStyleOptions = [
        { id: 'original' as const, label: t('favorites:island_style_original') },
        { id: 'edgeDock' as const, label: t('favorites:island_style_edge_dock') },
    ];
    const islandSizeOptions = [
        { id: 'sm' as const, label: t('favorites:island_size_sm') },
        { id: 'md' as const, label: t('favorites:island_size_md') },
        { id: 'lg' as const, label: t('favorites:island_size_lg') },
    ];
    const islandSideOptions = [
        { id: 'left' as const, label: t('favorites:island_side_left') },
        { id: 'right' as const, label: t('favorites:island_side_right') },
    ];

    return (
        <ScrollArea className="flex-1 h-full">
            <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full py-4 px-2 pr-4">
            <h2 className="text-xl font-bold text-foreground px-1">{t('favorites:settings')}</h2>

            {/* 外觀 */}
            <FMCard title={t('favorites:appearance')}>
                <SettingRow label={t('favorites:theme')}>
                    <SegmentedControl value={theme} options={themeOptions} onChange={setTheme} />
                </SettingRow>

                <SettingRow label={t('favorites:island_style')} desc={t('favorites:island_style_desc')}>
                    <SegmentedControl value={islandStyle} options={islandStyleOptions} onChange={setIslandStyle} />
                </SettingRow>

                {islandStyle === 'edgeDock' && (
                    <>
                        <SettingRow label={t('favorites:island_size')}>
                            <SegmentedControl value={islandEdgeSize} options={islandSizeOptions} onChange={setIslandEdgeSize} />
                        </SettingRow>
                        <SettingRow label={t('favorites:island_side')}>
                            <SegmentedControl value={islandEdgeSide} options={islandSideOptions} onChange={setIslandEdgeSide} />
                        </SettingRow>
                    </>
                )}

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

            {/* 關於(重建被移除的關於卡:敘述 + 社群外連,對齊現行 token 風格) */}
            <FMCard title={t('favorites:about')}>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    {t('favorites:settings.about_desc')}
                </p>
                <div className="flex flex-wrap gap-3">
                    {socialLinks.map(({ key, url, Icon, label, event, iconClass }) => (
                        <a
                            key={key}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => logEvent('FavoritesSettings', 'click_social', event)}
                            className={linkBtnClass}
                        >
                            <Icon className={iconClass} />
                            <span>{label}</span>
                        </a>
                    ))}
                    <button type="button" onClick={handleFeedbackClick} className={linkBtnClass}>
                        <MessageSquare className="size-4" />
                        <span>{t('favorites:settings.feedback')}</span>
                    </button>
                </div>
            </FMCard>
            </div>
        </ScrollArea>
    );
}
