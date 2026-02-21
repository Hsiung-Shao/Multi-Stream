import { useTranslation } from 'react-i18next';
import { Tv, Star, Settings, Plus, MessageSquare } from 'lucide-react';
import { useStreamStore } from '../../store/useStreamStore';
import { cn } from '../ui/utils';

export type MobileTab = 'watch' | 'chat' | 'favorites' | 'settings';

interface MobileBottomNavProps {
    activeTab: MobileTab;
    onTabChange: (tab: MobileTab) => void;
    onAddStream: () => void;
    isLandscape?: boolean;
}

export function MobileBottomNav({ activeTab, onTabChange, onAddStream, isLandscape = false }: MobileBottomNavProps) {
    const { t } = useTranslation();
    const streams = useStreamStore(s => s.streams);
    const streamCount = streams.length;

    const tabs: { id: MobileTab; icon: typeof Tv; label: string; badge?: number }[] = [
        { id: 'watch', icon: Tv, label: t('mobile.nav.watch', '觀看') },
        { id: 'chat', icon: MessageSquare, label: t('mobile.nav.chat', '聊天'), badge: streamCount > 0 ? streamCount : undefined },
        { id: 'favorites', icon: Star, label: t('mobile.nav.favorites', '收藏') },
        { id: 'settings', icon: Settings, label: t('mobile.nav.settings', '設定') },
    ];

    // In landscape: slim horizontal bar or vertical sidebar
    if (isLandscape) {
        return (
            <nav className="flex items-center justify-around h-10 shrink-0 border-t border-white/5 bg-gray-950/95 backdrop-blur-lg z-50 px-4">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={cn(
                                'flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors relative',
                                isActive
                                    ? 'text-primary bg-primary/10'
                                    : 'text-muted-foreground active:text-foreground'
                            )}
                        >
                            <div className="relative">
                                <Icon className="w-4 h-4" />
                                {tab.badge && (
                                    <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-primary text-[9px] text-white font-bold flex items-center justify-center">
                                        {tab.badge}
                                    </span>
                                )}
                            </div>
                            <span className="text-[11px] font-medium">{tab.label}</span>
                        </button>
                    );
                })}

                {/* Add button — inline in landscape */}
                <button
                    onClick={onAddStream}
                    className="flex items-center gap-1 px-3 py-1 rounded-md bg-primary text-white text-[11px] font-semibold active:scale-95 transition-transform"
                >
                    <Plus className="w-4 h-4" />
                    {t('mobile.nav.add', '新增')}
                </button>
            </nav>
        );
    }

    // Portrait: standard bottom nav with floating button
    return (
        <nav className="h-16 shrink-0 border-t border-white/10 bg-gray-950/95 backdrop-blur-lg z-50 relative">
            <div className="flex items-center justify-around h-full px-2">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={cn(
                                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors relative',
                                isActive
                                    ? 'text-primary'
                                    : 'text-muted-foreground active:text-foreground'
                            )}
                        >
                            <div className="relative">
                                <Icon className="w-5 h-5" />
                                {tab.badge && (
                                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-primary text-[10px] text-white font-bold flex items-center justify-center">
                                        {tab.badge}
                                    </span>
                                )}
                            </div>
                            <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
                            {isActive && (
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
                            )}
                        </button>
                    );
                })}

                {/* Floating Add Button */}
                <button
                    onClick={onAddStream}
                    className="absolute -top-5 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-primary shadow-lg shadow-primary/30 flex items-center justify-center text-white active:scale-95 transition-transform"
                >
                    <Plus className="w-6 h-6" />
                </button>
            </div>
        </nav>
    );
}
