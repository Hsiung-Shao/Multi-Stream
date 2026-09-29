// 週表／個人頁的「加入收藏」：收藏的是頻道（不是單場直播），可切換。
// 上層算一次收藏鍵（toFavoriteKeys），往下傳 isFavorite／toggle，避免數百張卡各自訂閱收藏清單。
//   - 加入：有 YouTube 收 YouTube 頻道（與加入畫布一樣 YouTube 優先），否則收 Twitch
//   - 取消：這個人兩個平台的收藏都移除
// 收藏存在 localStorage（favoritesService），變更後會發 favoritesUpdated，「我的收藏」範圍即時反映。

import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useFavorites } from '../../hooks/useFavorites';
import { favoritesService } from '../favorites/FavoritesService';
import { favoriteChannelKey, isFavoriteChannel, toFavoriteKeys } from './filters';
import type { ScheduleChannel } from './types';

interface FavoriteItemLike {
    id: string;
    platform: string;
    channelId?: string | null;
    url?: string;
}

/** 收藏清單裡屬於這位實況主的項目（任一平台）；與愛心顯示共用 favoriteChannelKey */
export function favoritesOf(channel: ScheduleChannel, favorites: readonly FavoriteItemLike[]): FavoriteItemLike[] {
    const yt = channel.youtube;
    const tw = channel.twitch?.toLowerCase();
    return favorites.filter((f) => {
        const key = favoriteChannelKey(f);
        if (!key) return false;
        return key.platform === 'youtube' ? key.id === yt : key.id === tw;
    });
}

/** 新增收藏時用的網址與頻道 ID；沒有任何平台頻道時回 null */
export function favoriteTarget(channel: ScheduleChannel): { url: string; channelId: string } | null {
    if (channel.youtube) return { url: `https://www.youtube.com/channel/${channel.youtube}`, channelId: channel.youtube };
    if (channel.twitch) return { url: `https://www.twitch.tv/${channel.twitch.toLowerCase()}`, channelId: channel.twitch.toLowerCase() };
    return null;
}

export function useFavoriteChannel() {
    const { t } = useTranslation('schedule');
    const { favorites } = useFavorites();
    const keys = useMemo(() => toFavoriteKeys(favorites), [favorites]);

    const isFavorite = useCallback((channel: ScheduleChannel | undefined) => isFavoriteChannel(channel, keys), [keys]);
    // 防連點：同一位實況主的切換還沒完成前，再點不做事（addFavorite 是非同步的）
    const inFlight = useRef(new Set<string>());

    const toggle = useCallback(
        async (channel: ScheduleChannel | undefined) => {
            if (!channel) return;
            const lock = channel.youtube ?? channel.twitch ?? channel.name;
            if (inFlight.current.has(lock)) return;
            inFlight.current.add(lock);
            try {
                const existing = favoritesOf(channel, favoritesService.getFavorites());
                if (existing.length > 0) {
                    for (const f of existing) favoritesService.removeFavorite(f.id);
                    toast.success(t('favorite.removed', { name: channel.name }));
                    return;
                }
                const target = favoriteTarget(channel);
                if (!target) {
                    toast.error(t('favorite.failed'));
                    return;
                }
                const res = await favoritesService.addFavorite(target.url, channel.name, null, target.channelId);
                if (res.success || res.message === 'streamAlreadyInFavorites') toast.success(t('favorite.added', { name: channel.name }));
                else toast.error(t('favorite.failed'));
            } catch {
                toast.error(t('favorite.failed'));
            } finally {
                inFlight.current.delete(lock);
            }
        },
        [t],
    );

    return { isFavorite, toggle, favoriteKeys: keys };
}
