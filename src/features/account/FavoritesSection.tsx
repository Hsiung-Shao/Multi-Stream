import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Settings } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useUIStore } from '../../store/useUIStore';
import { useFavorites } from '../../hooks/useFavorites';

/**
 * 帳號頁「收藏列表」section：
 *   - 顯示收藏 summary（總數 / 直播中數）
 *   - 「管理收藏」按鈕：透過 useUIStore.openModal('favorites') 開啟既有
 *     FavoritesManagerMain dialog（與 /canvas 共用同一份元件，不重複實作）
 *
 * 推薦按鈕已加在 FavoriteListItem 內，dialog 開啟後自動可用。
 */
export function FavoritesSection() {
    const { t } = useTranslation('account');
    const openModal = useUIStore((s) => s.openModal);
    const { favorites } = useFavorites();

    const liveCount = useMemo(
        () => favorites.filter((f) => f.isLive === true).length,
        [favorites],
    );

    return (
        <section className="rounded-xl border border-white/10 bg-card/50 p-5 space-y-4">
            <header className="flex items-start gap-3">
                <Star className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                    <h2 className="text-lg font-semibold">
                        {t('favorites.title', '收藏列表')}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                        {t(
                            'favorites.description',
                            '管理你的收藏實況主、分類、標籤；可從這裡一鍵推薦給 VTuber 探索。',
                        )}
                    </p>
                </div>
            </header>

            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-white/10 bg-background/30 p-3">
                    <div className="text-xs text-muted-foreground">
                        {t('favorites.totalLabel', '收藏總數')}
                    </div>
                    <div className="text-2xl font-bold mt-1">{favorites.length}</div>
                </div>
                <div className="rounded-md border border-white/10 bg-background/30 p-3">
                    <div className="text-xs text-muted-foreground">
                        {t('favorites.liveLabel', '直播中')}
                    </div>
                    <div className="text-2xl font-bold mt-1 text-emerald-500">
                        {liveCount}
                    </div>
                </div>
            </div>

            <div className="flex justify-end">
                <Button
                    onClick={() => openModal('favorites', 'favorites')}
                    className="gap-2"
                >
                    <Settings className="w-4 h-4" />
                    {t('favorites.manage', '管理收藏')}
                </Button>
            </div>
        </section>
    );
}
