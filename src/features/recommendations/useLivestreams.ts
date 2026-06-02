// useLivestreams
//
// 取目前所有「現正直播」清單，供 RecommendationsPage 的 LiveNowCarousel 用。
// 走 /api/livestreams（資料源 cron 每 2 分鐘更新）。
//
// staleTime 60s + refetchInterval 90s：讓 carousel 跟著直播狀態變動，
// 但不過度打 API。

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './apiClient';
import type { Livestream } from './types';

interface ApiResponse {
    ok: true;
    livestreams: Livestream[];
}

const KEY = 'livestreams';

export function useLivestreams() {
    return useQuery<Livestream[]>({
        queryKey: [KEY],
        queryFn: () => apiFetch<ApiResponse>('/api/livestreams').then(d => d.livestreams ?? []),
        staleTime: 60 * 1000,
        refetchInterval: 90 * 1000,
        refetchOnWindowFocus: true,
    });
}
