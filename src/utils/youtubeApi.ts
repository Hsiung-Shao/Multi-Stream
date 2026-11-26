import i18n from '../i18n/i18n';

// Helper for YouTube API calls
// Extracted from settings.js to support TDD migration

// live-og 端點只接受帶這個標頭的請求：讓修正前就開著、沒重新整理的舊分頁停止打端點（2026-10-05，見端點檔頭）。
// 用戶端節流邏輯有不相容的修正時版本號加一，並同步 functions/api/youtube-channel-live-og.js
export const LIVE_OG_CLIENT_HEADER = 'X-MS-Live-Client';
export const LIVE_OG_CLIENT_VERSION = '2';

export const youtubeApi = {
    // 2026-11-27：YouTube Data API 改由伺服器代查（/api/youtube/lookup），金鑰不再交給瀏覽器
    async lookup(query: string): Promise<Record<string, string> | null> {
        const response = await fetch(`/api/youtube/lookup?${query}`, { headers: { Accept: 'application/json' } });
        if (response.status === 404) return null;
        if (!response.ok) {
            throw new Error(`YouTube 查詢失敗: ${response.status}`);
        }
        return response.json();
    },

    // 從 videoID 透過 YouTube Data API 獲取頻道真實 ID
    async getChannelIdFromVideoId(videoId: string): Promise<string> {
        const info = await this.getVideoInfo(videoId);
        return info.channelId;
    },

    // 獲取影片詳細資訊
    async getVideoInfo(videoId: string): Promise<{ title: string; channelId: string; channelTitle: string }> {
        if (!videoId || typeof videoId !== 'string') {
            throw new Error(i18n.t('stream:youtube_video_id_invalid', { videoId: 'unknown' }));
        }
        const data = await this.lookup(`videoId=${encodeURIComponent(videoId)}`);
        if (!data) {
            throw new Error(i18n.t('stream:video_not_found'));
        }
        return { title: data.title, channelId: data.channelId, channelTitle: data.channelTitle };
    },

    // 從 channelID 透過 YouTube Data API 獲取頻道標題
    async getChannelTitleFromChannelId(channelId: string): Promise<string> {
        if (!channelId || typeof channelId !== 'string') {
            throw new Error(i18n.t('stream:channel_id_invalid'));
        }
        const data = await this.lookup(`channelId=${encodeURIComponent(channelId)}`);
        if (!data?.channelTitle) {
            throw new Error(i18n.t('stream:channel_not_found'));
        }
        return data.channelTitle;
    },

    // 透過後端抓取端點(零 YouTube Data API quota)把 @handle / 自訂網址名稱解析成
    // channelId + 官方頻道名。端點 /api/youtube-channel-page 內部抓取頻道頁 HTML 解析,
    // 解析不到 channelId 會回 404。失敗一律回 null,由呼叫端退回 fallback。
    async resolveChannelByHandle(handle: string): Promise<{ channelId: string | null; channelTitle: string | null } | null> {
        const clean = (handle || '').trim().replace(/^@/, '');
        if (!clean) return null;

        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 10000); // 10s timeout
        try {
            const url = `/api/youtube-channel-page?handle=${encodeURIComponent(clean)}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });
            clearTimeout(id);

            if (!response.ok) return null;

            const data = await response.json();
            const channelId = data?.channelId || null;
            const channelTitle = data?.channelTitle || null;
            if (!channelId && !channelTitle) return null;
            return { channelId, channelTitle };
        } catch (e) {
            clearTimeout(id);
            console.warn('[YouTubeAPI] resolveChannelByHandle failed', e);
            return null;
        }
    },

    async checkChannelLiveStatus(channelId: string): Promise<{ isLive: boolean; liveVideoId?: string; finalUrl?: string; isUpcoming?: boolean; scheduledStartTime?: string; channelTitle?: string }> {
        // 只走輕量的 live-og 端點。任何失敗都直接丟錯，呼叫端保留原本狀態、不記錄，下一輪再查。
        // 2026-10-04 拿掉舊版整頁掃描（/api/youtube-channel-live）的退路：原本網路錯誤或逾時會改打舊版，
        // 但舊版把約 1.6MB 的頁面整頁讀進來掃描，必定超過免費方案 10ms CPU；YouTube 回應慢時這條退路
        // 會被大量觸發，等於在最忙的時候把負載加倍（HTTP 錯誤時本來就不退，見 tests/utils/youtubeLiveFallback.test.ts）。
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
            const resp = await fetch(`/api/youtube-channel-live-og?channelId=${encodeURIComponent(channelId)}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json', [LIVE_OG_CLIENT_HEADER]: LIVE_OG_CLIENT_VERSION },
                signal: controller.signal,
            });
            if (!resp.ok) {
                throw new Error(`[YouTubeAPI] live-og HTTP ${resp.status}`);
            }
            const data = await resp.json();
            return {
                isLive: !!data.isLive,
                liveVideoId: data.videoId || data.liveVideoId,
                finalUrl: data.finalUrl,
                isUpcoming: !!data.isUpcoming,
                scheduledStartTime: data.scheduledStartTime,
                channelTitle: data.channelTitle || undefined,
            };
        } finally {
            clearTimeout(timer);
        }
    }
};
