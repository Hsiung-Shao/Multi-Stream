// 前端 helper:呼叫 /api/youtube/search-channels 搜尋 YouTube 頻道
// (資料源 = vtubers + youtube_channels 合併;後端負責去重與 VTuber 標記)
//
// 取代了 YouTubeChannelRepository.searchChannels()(前端直連 supabase 的舊死碼)。

export interface YoutubeChannelSearchResult {
    channelId: string;
    title: string;
    thumbnail: string | null;
    subscriber: number | null;
    isVtuber: boolean;
    nationality: string | null;
}

const FETCH_TIMEOUT_MS = 8000;

/**
 * 搜尋 YouTube 頻道。失敗一律回空陣列(fail-soft,不阻塞搜尋框)。
 */
export async function searchYoutubeChannels(
    query: string,
    limit = 8,
): Promise<YoutubeChannelSearchResult[]> {
    const q = query.trim();
    if (!q) return [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(
            `/api/youtube/search-channels?q=${encodeURIComponent(q)}&limit=${limit}`,
            { signal: controller.signal },
        );
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data?.channels) ? (data.channels as YoutubeChannelSearchResult[]) : [];
    } catch {
        return [];
    } finally {
        clearTimeout(timer);
    }
}
