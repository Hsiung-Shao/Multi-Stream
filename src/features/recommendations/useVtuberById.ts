// useVtuberById
//
// 取單一 vtuber 完整資料(含累積推薦數、approved categories),
// 供 VtuberDetailPage 用。
//
// 走 /api/vtubers/<uuid>,1 分鐘 staleTime(資料變動慢)。

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './apiClient';
import type { VtuberDetail } from './types';

interface ApiResponse {
    ok: true;
    vtuber: VtuberDetail | null;
}

const KEY = 'vtuber-by-id';

export function useVtuberById(vtuberId: string | null | undefined) {
    return useQuery<VtuberDetail | null>({
        queryKey: [KEY, vtuberId],
        enabled: !!vtuberId,
        queryFn: () =>
            apiFetch<ApiResponse>(
                `/api/vtubers/${encodeURIComponent(vtuberId!)}`,
            ).then(d => d.vtuber),
        staleTime: 60 * 1000,
    });
}
