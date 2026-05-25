// useVtuberByChannel
//
// 用 (platform, channelId) 精確查 db 中是否有對應的 vtuber。
// RecommendDialog 用此 hook 判斷主推頻道是否已連結另一平台,以決定是否
// 隱藏 cross URL 輸入框與 suggestion list。
//
// 失敗 / 找不到時回 null,RecommendDialog 預設顯示完整輸入框(降級安全)。

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './apiClient';

export interface VtuberByChannelResult {
    id: string;
    name: string;
    youtube_channel_id: string | null;
    twitch_channel_id: string | null;
    img_url: string | null;
    languages: string[] | null;
    recommend_count: number;
}

interface ApiResponse {
    ok: true;
    vtuber: VtuberByChannelResult | null;
}

const KEY = 'vtuber-by-channel';

export function useVtuberByChannel(
    platform: 'twitch' | 'youtube' | 'other' | null | undefined,
    channelId: string | null | undefined,
) {
    const validPlatform = platform === 'twitch' || platform === 'youtube';
    const enabled = validPlatform && !!channelId;
    return useQuery<VtuberByChannelResult | null>({
        queryKey: [KEY, platform, channelId],
        enabled,
        queryFn: () =>
            apiFetch<ApiResponse>(
                `/api/vtubers/by-channel?platform=${platform}&channel_id=${encodeURIComponent(channelId!)}`,
            ).then(d => d.vtuber),
        staleTime: 5 * 60 * 1000,
        retry: false,
    });
}
