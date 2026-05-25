// URL parser for 跨平台同人 opt-in link
//
// 用於 RecommendDialog「另一平台頻道 URL」欄位:
//   - Twitch URL → sync parse(twitch.tv/<login>)
//   - YouTube /channel/UC... URL → sync parse(canonical channel ID)
//   - YouTube @handle URL → async resolve(走 /api/youtube-channel-page?handle=...)
//   - 其他 → reject

const TWITCH_PATTERNS = [
    /^https?:\/\/(?:www\.)?twitch\.tv\/([a-zA-Z0-9_]{3,25})(?:[/?#]|$)/,
    /^https?:\/\/(?:www\.)?twitch\.tv\/popout\/([a-zA-Z0-9_]{3,25})(?:[/?#]|$)/,
];

const YOUTUBE_CHANNEL_ID_PATTERN = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})(?:[/?#]|$)/;
const YOUTUBE_HANDLE_PATTERN = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/@([A-Za-z0-9_.\-]{3,30})(?:[/?#]|$)/;

export type ParseSyncOk = { ok: true; platform: 'twitch' | 'youtube'; channelId: string };
export type ParseSyncPending = { ok: false; reason: 'youtube_handle_pending'; handle: string };
export type ParseSyncFail = { ok: false; reason: 'invalid_url' | 'unsupported_platform' };
export type ParseSyncResult = ParseSyncOk | ParseSyncPending | ParseSyncFail;

/**
 * Sync parse:Twitch / YouTube /channel/UC... 立即可得;@handle 回 pending(交給 async resolve)。
 * 空字串或 trim 後空 → 回 invalid_url(由 caller 決定是否顯示)
 */
export function parseChannelUrlSync(rawUrl: string): ParseSyncResult {
    const url = rawUrl.trim();
    if (!url) return { ok: false, reason: 'invalid_url' };

    for (const re of TWITCH_PATTERNS) {
        const m = url.match(re);
        if (m) return { ok: true, platform: 'twitch', channelId: m[1].toLowerCase() };
    }

    const ytIdMatch = url.match(YOUTUBE_CHANNEL_ID_PATTERN);
    if (ytIdMatch) return { ok: true, platform: 'youtube', channelId: ytIdMatch[1] };

    const ytHandleMatch = url.match(YOUTUBE_HANDLE_PATTERN);
    if (ytHandleMatch) return { ok: false, reason: 'youtube_handle_pending', handle: ytHandleMatch[1] };

    // 純 URL 但不是支援的平台
    if (/^https?:\/\//.test(url)) return { ok: false, reason: 'unsupported_platform' };

    return { ok: false, reason: 'invalid_url' };
}

export interface YouTubeHandleResolved {
    channelId: string;
    channelTitle: string | null;
}

/**
 * Async resolve YouTube @handle → channel ID + title
 * 走既有 /api/youtube-channel-page?handle=X(scrape ytInitialData)
 * 5s timeout;失敗 / 找不到 → null。
 * channelTitle 順便回傳,讓 caller 拿來做第二階段 suggestion fuzzy match。
 */
export async function resolveYouTubeHandle(handle: string, signal?: AbortSignal): Promise<YouTubeHandleResolved | null> {
    if (!handle || !/^[A-Za-z0-9_.\-]{3,30}$/.test(handle)) return null;
    try {
        const res = await fetch(
            `/api/youtube-channel-page?handle=${encodeURIComponent(handle)}`,
            { credentials: 'same-origin', signal },
        );
        if (!res.ok) return null;
        const data = await res.json().catch(() => null);
        const channelId = data?.channelId || data?.channel_id;
        if (typeof channelId === 'string' && /^UC[A-Za-z0-9_-]{22}$/.test(channelId)) {
            const rawTitle = data?.channelTitle;
            const channelTitle = typeof rawTitle === 'string' && rawTitle.trim().length > 0
                ? rawTitle.trim()
                : null;
            return { channelId, channelTitle };
        }
        return null;
    } catch {
        return null;
    }
}
