import { useTranslation } from 'react-i18next';
import { MonitorPlay, Compass, Star, Search, Settings } from 'lucide-react';
import { useStreamStore } from '../../store/useStreamStore';
import { cn } from '../ui/utils';

export type MobileTab = 'watch' | 'explore' | 'favorites' | 'search' | 'settings';

interface MobileBottomNavProps {
    activeTab: MobileTab;
    onTabChange: (tab: MobileTab) => void;
    isLandscape?: boolean;
}

export function MobileBottomNav({ activeTab, onTabChange, isLandscape = false }: MobileBottomNavProps) {
    const { t } = useTranslation();
    const streams = useStreamStore(s => s.streams);
    const streamCount = streams.filter(s => s.channelId).length;

    const tabs: { id: MobileTab; icon: typeof MonitorPlay; label: string; badge?: number }[] = [
        { id: 'watch', icon: MonitorPlay, label: t('mobile.nav.watch', '觀看'), badge: streamCount > 0 ? streamCount : undefined },
        { id: 'explore', icon: Compass, label: t('mobile.nav.explore', '探索') },
        { id: 'favorites', icon: Star, label: t('mobile.nav.favorites', '收藏') },
        { id: 'search', icon: Search, label: t('mobile.nav.search', '搜尋') },
        { id: 'settings', icon: Settings, label: t('mobile.nav.settings', '設定') },
    ];

    // In landscape: slim horizontal bar
    if (isLandscape) {
        return (
            <nav className="flex items-center justify-around h-10 shrink-0 border-t border-white/5 bg-gray-950/95 backdrop-blur-lg z-50 px-2">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={cn(
                                'flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors relative',
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
            </nav>
        );
    }

    // Portrait: standard 5-tab bottom nav (design Mobile.jsx — no floating button)
    return (
        <nav className="shrink-0 border-t border-white/10 bg-black/60 backdrop-blur-xl z-50 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="flex items-stretch px-1">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={cn(
                                'flex flex-col items-center justify-center gap-1 flex-1 py-1.5 transition-colors relative',
                                isActive
                                    ? 'text-primary'
                                    : 'text-muted-foreground active:text-foreground'
                            )}
                        >
                            <div className="relative">
                                <Icon className={cn('w-[22px] h-[22px] transition-transform', isActive && '-translate-y-0.5')} />
                                {tab.badge && (
                                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-primary text-[10px] text-white font-bold flex items-center justify-center">
                                        {tab.badge}
                                    </span>
                                )}
                            </div>
                            <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
                            {isActive && (
                                <span className="w-1 h-1 rounded-full bg-primary -mt-0.5" />
                            )}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
