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

    async checkChannelLiveStatus(channelId: string): Promise<{ isLive: boolean; liveVideoId?: string; finalUrl?: string; isUpcoming?: boolean; scheduledStartTime?: string; channelTitle?: string }> {
        // Strategy: Try the new lightweight "OG Image" API first. 
        // If it fails or implies uncertainty (which it theoretically shouldn't given the robust updates), 
        // fall back to the legacy full-scan API.

        const fetchWithTimeout = async (url: string, options: RequestInit = {}) => {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 10000); // 10s timeout
            try {
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });
                clearTimeout(id);
                return response;
            } catch (error) {
                clearTimeout(id);
                throw error;
            }
        };

        try {
            // 1. Try New API (Low Cost, High Speed)
            const ogUrl = `/api/youtube-channel-live-og?channelId=${encodeURIComponent(channelId)}`;
            const ogResp = await fetchWithTimeout(ogUrl, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (ogResp.ok) {
                const data = await ogResp.json();

                // If api returns explicit status (Live, Upcoming, or Offline)
                // We trust it.
                return {
                    isLive: !!data.isLive,
                    liveVideoId: data.videoId || data.liveVideoId,
                    finalUrl: data.finalUrl,
                    isUpcoming: !!data.isUpcoming,
                    scheduledStartTime: data.scheduledStartTime,
                    channelTitle: data.channelTitle || undefined
                };
            }
        } catch (e) {
            console.warn("[YouTubeAPI] Lightweight check failed, falling back to legacy", e);
        }

        // 2. Fallback: Legacy API (Higher Cost, Full Scan)
        try {
            const url = `/api/youtube-channel-live?channelId=${encodeURIComponent(channelId)}`;
            const response = await fetchWithTimeout(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                return { isLive: false };
            }

            const data = await response.json();

            if (data.isLive) {
                return {
                    isLive: true,
                    liveVideoId: data.liveVideoId,
                    finalUrl: data.finalUrl
                };
            }

            // Check for isUpcoming in legacy response if available
            if (data.isUpcoming) {
                return {
                    isLive: false,
                    isUpcoming: true,
                    scheduledStartTime: data.scheduledVideoId ? undefined : undefined // Legacy might not return time
                };
            }

            return { isLive: false };
        } catch (e) {
            console.error("Check live status failed (Legacy)", e);
            return { isLive: false };
        }
    }
};
