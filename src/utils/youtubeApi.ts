import i18n from '../i18n/i18n';

// Helper for YouTube API calls
// Extracted from settings.js to support TDD migration

let youtubeConfigApiKeyPromise: Promise<string | null> | null = null;

export const youtubeApi = {
    // 從 Cloudflare Pages Function 取得 API Key（異步）
    async getApiKeyFromPagesFunction(): Promise<string | null> {
        if (youtubeConfigApiKeyPromise) {
            return youtubeConfigApiKeyPromise;
        }

        youtubeConfigApiKeyPromise = (async () => {
            try {
                const apiUrl = '/api/youtube-config';

                const response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();

                    if (data.apiKey) {
                        return data.apiKey;
                    }
                }
            } catch (error) {
                // 獲取 API Key 時發生錯誤
                console.error('Error fetching YouTube API Key:', error);
                throw new Error(i18n.t('stream:apikey_error'));
            }
            return null;
        })();

        return youtubeConfigApiKeyPromise;
    },

    // 獲取 YouTube API Key（優先從 Cloudflare Pages Function，然後從 config.js）
    async getApiKey(): Promise<string | null> {
        // 優先從 Cloudflare Pages Function 獲取
        try {
            const apiKeyFromFunction = await this.getApiKeyFromPagesFunction();
            if (apiKeyFromFunction) {
                return apiKeyFromFunction;
            }
        } catch (e) {
            console.warn("Failed to get API key from function", e);
        }

        // 回退到 config.js (保路供本地測試使用)
        if (typeof window !== 'undefined' && (window as any).CONFIG && (window as any).CONFIG.YOUTUBE_API_KEY) {
            return (window as any).CONFIG.YOUTUBE_API_KEY;
        }

        return null;
    },

    // 從 videoID 透過 YouTube Data API 獲取頻道真實 ID
    async getChannelIdFromVideoId(videoId: string): Promise<string> {
        const info = await this.getVideoInfo(videoId);
        return info.channelId;
    },

    // 獲取影片詳細資訊
    async getVideoInfo(videoId: string): Promise<{ title: string; channelId: string; channelTitle: string }> {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            throw new Error('YouTube API Key 未配置');
        }

        if (!videoId || typeof videoId !== 'string') {
            throw new Error(i18n.t('stream:youtube_video_id_invalid', { videoId: 'unknown' }));
        }

        try {
            const url = `https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(videoId)}&part=snippet&key=${encodeURIComponent(apiKey)}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`YouTube API 請求失敗: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.items || data.items.length === 0) {
                throw new Error(i18n.t('stream:video_not_found'));
            }

            const snippet = data.items[0].snippet;
            if (!snippet) {
                throw new Error(i18n.t('stream:fetch_video_error'));
            }

            return {
                title: snippet.title,
                channelId: snippet.channelId,
                channelTitle: snippet.channelTitle
            };
        } catch (error) {
            throw error;
        }
    },

    // 從 channelID 透過 YouTube Data API 獲取頻道標題
    async getChannelTitleFromChannelId(channelId: string): Promise<string> {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            throw new Error('YouTube API Key 未配置');
        }

        if (!channelId || typeof channelId !== 'string') {
            throw new Error(i18n.t('stream:channel_id_invalid'));
        }

        try {
            const url = `https://www.googleapis.com/youtube/v3/channels?id=${encodeURIComponent(channelId)}&part=snippet&key=${encodeURIComponent(apiKey)}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`YouTube API 請求失敗: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.items || data.items.length === 0) {
                throw new Error(i18n.t('stream:channel_not_found'));
            }

            const title = data.items[0].snippet?.title;
            if (!title) {
                throw new Error(i18n.t('stream:fetch_channel_error'));
            }

            return title;
        } catch (error) {
            throw error;
        }
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
                headers: { 'Accept': 'application/json' },
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
