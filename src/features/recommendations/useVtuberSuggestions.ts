// useVtuberSuggestions
//
// 推薦 Dialog 的「您是不是這位?」suggestion query hook。
// 給 displayName(從主平台 metadata 抓出來的 channel name),回 top 5 模糊比對結果。
// 由 caller(RecommendDialog)做 debounce 控制何時觸發。

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './apiClient';

export interface VtuberSearchResult {
    id: string;
    name: string;
    youtube_channel_id: string | null;
    twitch_channel_id: string | null;
    img_url: string | null;
    languages: string[] | null;
    score: number;
    recommend_count: number;
}

interface SearchResponse {
    ok: true;
    results: VtuberSearchResult[];
}

const KEY = 'vtuber-search';
const MIN_QUERY_LEN = 2;

export function useVtuberSuggestions(q: string, enabled: boolean = true) {
    const trimmed = q.trim();
    return useQuery({
        queryKey: [KEY, trimmed],
        enabled: enabled && trimmed.length >= MIN_QUERY_LEN,
        queryFn: () =>
            apiFetch<SearchResponse>(
                `/api/vtubers/search?q=${encodeURIComponent(trimmed)}&limit=5`,
            ),
        staleTime: 5 * 60 * 1000, // 同 displayName 5 分鐘內不重 fetch
        select: (d) => d.results ?? [],
    });
}
