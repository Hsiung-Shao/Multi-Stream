import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStreamStore } from '../store/useStreamStore';
import { favoritesService } from '../features/favorites/FavoritesService';
import { buildShareUrl } from '../utils/shareLink';
import { logEvent } from '../utils/analytics';
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

    // 分享畫布：把目前串流組成 /canvas?streams=… 複製到剪貼簿（clipboard → navigator.share → prompt 三層退回）
    const handleShareCanvas = async () => {
        const chat = useStreamStore.getState().canvasItems.some((i) => i.type === 'chat');
        const url = buildShareUrl(window.location.origin, streams, chat);
        if (!url) {
            toast.error(t('common.share_empty') || '先加入至少一個直播再分享');
            return;
        }
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url);
            } else if (navigator.share) {
                await navigator.share({ url });
            } else {
                throw new Error('clipboard unavailable');
            }
            toast.success(t('common.share_copied') || '連結已複製，貼給朋友就能一起看');
            logEvent('Share', 'copy_link', undefined, streams.length);
        } catch {
            // 權限被拒/不支援：讓使用者手動複製
            window.prompt(t('common.share_failed') || '複製失敗，請手動複製網址', url);
        }
    };

    return { isFullscreen, toggleFullscreen, handleQuickSave, handleShareCanvas };
}
