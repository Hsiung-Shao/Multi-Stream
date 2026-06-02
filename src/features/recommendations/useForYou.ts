// useForYou — 「為你推薦」分頁
//
// 從本地收藏（favoritesService）抽 channel_id，POST /api/recommendations/for-you；
// 後端依收藏 vtuber 的分類/語言推薦相似的（排除已收藏、有推薦數背書）。
//
// 無收藏 → hasFavorites=false，前端顯示引導，不打 API。

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './apiClient';
import { favoritesService } from '../favorites/FavoritesService';
import type { RecommendationAggregate } from './types';

interface ForYouResponse {
    ok: true;
    items: RecommendationAggregate[];
    reason?: string;
}

export function useForYou(enabled: boolean) {
    const favorites = favoritesService.getFavorites();
    const favPayload = favorites
        .filter(f => (f.platform === 'twitch' || f.platform === 'youtube') && !!f.channelId)
        .map(f => ({ platform: f.platform as 'twitch' | 'youtube', channel_id: f.channelId as string }));
    const hasFavorites = favPayload.length > 0;

    const query = useQuery<ForYouResponse>({
        queryKey: ['for-you', favPayload.map(f => f.channel_id).sort().join(',')],
        enabled: enabled && hasFavorites,
        queryFn: () => apiFetch<ForYouResponse>('/api/recommendations/for-you', {
            method: 'POST',
            body: { favorites: favPayload },
        }),
        staleTime: 60_000,
    });

    return { ...query, hasFavorites };
}
