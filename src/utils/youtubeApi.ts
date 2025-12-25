
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

        // 回退到 config.js (Legacy global config)
        if (typeof window !== 'undefined' && (window as any).CONFIG && (window as any).CONFIG.YOUTUBE_API_KEY) {
            return (window as any).CONFIG.YOUTUBE_API_KEY;
        }

        return null;
    },

    // 從 videoID 透過 YouTube Data API 獲取頻道真實 ID
    async getChannelIdFromVideoId(videoId: string): Promise<string> {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            throw new Error('YouTube API Key 未配置');
        }

        if (!videoId || typeof videoId !== 'string') {
            throw new Error('無效的 videoID');
        }

        try {
            const url = `https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(videoId)}&part=snippet&key=${encodeURIComponent(apiKey)}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`YouTube API 請求失敗: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.items || data.items.length === 0) {
                throw new Error('找不到該影片');
            }

            const channelId = data.items[0].snippet?.channelId;
            if (!channelId) {
                throw new Error('無法從影片中獲取頻道 ID');
            }

            return channelId;
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
            throw new Error('無效的 channelId');
        }

        try {
            const url = `https://www.googleapis.com/youtube/v3/channels?id=${encodeURIComponent(channelId)}&part=snippet&key=${encodeURIComponent(apiKey)}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`YouTube API 請求失敗: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.items || data.items.length === 0) {
                throw new Error('找不到該頻道');
            }

            const title = data.items[0].snippet?.title;
            if (!title) {
                throw new Error('無法獲取頻道標題');
            }

            return title;
        } catch (error) {
            throw error;
        }
    },

    async checkChannelLiveStatus(channelId: string): Promise<{ isLive: boolean; liveVideoId?: string; finalUrl?: string }> {
        // Use Cloudflare Pages Function proxy which implements robust checking (HTML parsing + verification)
        try {
            const url = `/api/youtube-channel-live?channelId=${encodeURIComponent(channelId)}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                // If 404, channel might not exist. If 500, server error.
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

            return { isLive: false };
        } catch (e) {
            console.error("Check live status failed", e);
            return { isLive: false };
        }
    }
};
