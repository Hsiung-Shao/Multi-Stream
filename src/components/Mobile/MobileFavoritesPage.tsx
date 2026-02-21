import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/useUIStore';
import { Star } from 'lucide-react';
import { Button } from '../ui/button';

export function MobileFavoritesPage() {
    const { t } = useTranslation();
    const openModal = useUIStore(s => s.openModal);

    return (
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-20">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">{t('mobile.favorites.title', '收藏')}</h1>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openModal('favorites')}
                    className="text-xs"
                >
                    {t('mobile.favorites.manage', '管理收藏')}
                </Button>
            </div>

            {/* This opens the existing FavoritesManagerMain modal */}
            <div className="flex flex-col items-center justify-center text-center py-16">
                <div className="w-20 h-20 rounded-2xl bg-gray-900 border border-white/10 flex items-center justify-center mb-6">
                    <Star className="w-10 h-10 text-muted-foreground/50" />
                </div>
                <h2 className="text-lg font-bold text-foreground mb-2">
                    {t('mobile.favorites.empty_title', '管理您的收藏')}
                </h2>
                <p className="text-sm text-muted-foreground max-w-[280px] mb-6">
                    {t('mobile.favorites.empty_desc', '點擊「管理收藏」來新增、編輯您的收藏頻道，並匯入 Twitch 追隨列表')}
                </p>
                <Button onClick={() => openModal('favorites')}>
                    <Star className="w-4 h-4 mr-2" />
                    {t('mobile.favorites.open_manager', '開啟收藏管理')}
                </Button>
            </div>
        </div>
    );
}
