import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStreamStore } from '../store/useStreamStore';
import { favoritesService } from '../features/favorites/FavoritesService';
import {
    requestFullscreen,
    exitFullscreen,
    getFullscreenElement,
    onFullscreenChange,
} from '../utils/fullscreenUtils';

// 動態島「一鍵收藏當前畫布」與「全螢幕切換」共用邏輯,原本/邊緣停靠兩種型態皆呼叫此 hook,避免重複實作。
export function useIslandQuickActions() {
    const { t } = useTranslation(['common', 'favorites']);
    const streams = useStreamStore(s => s.streams);
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!getFullscreenElement());
        };
        return onFullscreenChange(handleFullscreenChange);
    }, []);

    const toggleFullscreen = () => {
        if (!getFullscreenElement()) {
            requestFullscreen(document.documentElement).catch(() => {
                toast.error('無法進入全螢幕');
            });
        } else {
            exitFullscreen().catch(() => {
                console.error('Error exiting fullscreen');
            });
        }
    };

    const handleQuickSave = async () => {
        if (streams.length === 0) {
            toast.error(t('favorites:no_streams_to_save') || '沒有可收藏的串流');
            return;
        }

        let successCount = 0;

        try {
            const targetCategoryId: string | null = null;

            for (const stream of streams) {
                let url = '';
                if (stream.platform === 'twitch') {
                    url = `https://twitch.tv/${stream.channelId}`;
                } else if (stream.platform === 'youtube') {
                    url = stream.videoId
                        ? `https://youtube.com/watch?v=${stream.videoId}`
                        : `https://youtube.com/channel/${stream.channelId}`;
                }

                if (url) {
                    await favoritesService.addFavorite(
                        url,
                        stream.displayName || stream.channelId || stream.videoId || 'Stream',
                        targetCategoryId
                    );
                    successCount++;
                }
            }

            toast.success(t('favorites:batch_save_success_simple', { count: successCount }) || `已收藏 ${successCount} 個串流`);

        } catch {
            console.error('Quick save failed');
            toast.error(t('common.error') || '發生錯誤');
        }
    };

    return { isFullscreen, toggleFullscreen, handleQuickSave };
}
