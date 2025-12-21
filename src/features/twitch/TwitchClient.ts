import { TwitchApiConfig, TwitchClientContract, TokenProviderContract, RateLimitNotifierContract } from './types.ts';

export class TwitchClient implements TwitchClientContract {
    private requestHistory: number[] = [];

    constructor(
        private getConfig: () => TwitchApiConfig,
        private tokenProvider: TokenProviderContract,
        private rateLimitNotifier: RateLimitNotifierContract
    ) { }

    public async get<T>(endpoint: string, params: Record<string, any> = {}): Promise<T | null> {
        const config = this.getConfig();
        const win = (typeof window !== 'undefined' ? window : {}) as any;
        const debug = !!win.__MS_DEBUG_TWITCH__;

        this.checkRateLimit(config);

        // Build URL
        const url = this.buildUrl(endpoint, params, config);

        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        // If not using proxy, we need Client-ID and Authorization
        if (!config.useProxy) {
            if (!config.clientId) {
                const msg = 'Missing Client ID (Not using Proxy). Check VITE_TWITCH_CLIENT_ID.';
                if (debug) console.error(`[TwitchClient] ${msg}`);
                throw new Error(msg);
            }
            headers['Client-ID'] = config.clientId;

            try {
                const token = await this.tokenProvider.getAccessToken();
                headers['Authorization'] = `Bearer ${token}`;
            } catch (e: any) {
                if (debug) console.error('[TwitchClient] Token error:', e);
                throw new Error(`無法取得 Access Token：${e.message || e}`);
            }
        }

        // Debug Request
        if (debug) {
            console.log(`[TwitchClient] GET ${url}`, {
                useProxy: config.useProxy,
                headers: { ...headers, Authorization: headers.Authorization ? 'Bearer ******' : undefined }
            });
        }

        // Execute Request
        try {
            const res = await fetch(url, { method: 'GET', headers });

            if (debug) {
                console.log(`[TwitchClient] Response ${res.status} ${res.statusText}`);
            }

            if (!res.ok) {
                const errBody = await res.text(); // Clone or text? fetch body can execute once.
                // We passed response to handleError, so wait, reading text here might lock body?
                // handleError implementation tries to read json or text?
                // Actually, let's peek body if debug, but cloning res is safer.
                if (debug) console.log(`[TwitchClient] Error Body (Peek):`, errBody.slice(0, 500));

                // Construct a new response object with same body to pass to handler, or just pass original if we didn't consume it?
                // Using new Response(errBody, ...) is safest if we consumed it.
                const safeRes = new Response(errBody, { status: res.status, statusText: res.statusText, headers: res.headers });
                Object.defineProperty(safeRes, 'url', { value: res.url }); // url is read-only

                return await this.handleError(safeRes, endpoint, params, headers, config);
            }

            return await res.json();
        } catch (e: any) {
            if (debug) console.error('[TwitchClient] Fetch failed:', e);
            if (e.message && e.message.includes('API')) throw e; // Rethrow custom errors
            if (e.name === 'TypeError' && e.message.includes('fetch')) {
                throw new Error('無法連接到 Twitch API，請檢查網路連線或後端代理設定');
            }
            throw e;
        }
    }

    private checkRateLimit(config: TwitchApiConfig) {
        const now = Date.now();
        const limit = config.rateLimit;

        // Clean old
        this.requestHistory = this.requestHistory.filter(t => now - t < limit.windowMs);

        // Check count
        if (this.requestHistory.length >= limit.maxRequests) {
            // Find when window resets (oldest request + window)
            const oldest = this.requestHistory[0] || now;
            const resetTime = oldest + limit.windowMs;
            const waitSeconds = Math.ceil((resetTime - now) / 1000);

            this.rateLimitNotifier.notify(waitSeconds);
            throw new Error(`Twitch API 速率限制：請等待 ${waitSeconds} 秒後再試`);
        }

        this.requestHistory.push(now);
    }

    private async handleError(
        res: Response,
        endpoint: string,
        params: any,
        originalHeaders: any,
        config: TwitchApiConfig
    ): Promise<any> {
        // 401 Re-auth
        if (res.status === 401 && !config.useProxy) {
            // Force refresh
            try {
                const newToken = await this.tokenProvider.refreshToken();
                originalHeaders['Authorization'] = `Bearer ${newToken}`;

                // Retry Once
                const win = (typeof window !== 'undefined' ? window : {}) as any;
                if (win.__MS_DEBUG_TWITCH__) console.log('[TwitchClient] Retrying after 401...');

                const retryUrl = this.buildUrl(endpoint, params, config);
                const retryRes = await fetch(retryUrl, { method: 'GET', headers: originalHeaders });
                if (retryRes.ok) return await retryRes.json();
            } catch (retryErr) {
                // Determine error message based on failure
            }
            throw new Error('Twitch API 認證失敗，請檢查 Client ID 和 Client Secret 設定');
        } else if (res.status === 401) {
            throw new Error('Twitch API 認證失敗，請檢查後端代理設定');
        }

        if (res.status === 429) throw new Error('API 請求過於頻繁，請稍後再試');
        if (res.status === 404) return null;

        throw new Error(`API 請求失敗：${res.status} ${res.statusText}`);
    }

    private buildUrl(endpoint: string, params: Record<string, any>, config: TwitchApiConfig): string {
        const query = this.serializeParams(params);

        if (config.useProxy && config.proxyUrl) {
            // Proxy mode
            const base = `${config.proxyUrl}?endpoint=${encodeURIComponent(endpoint)}`;
            return query ? `${base}&${query}` : base;
        } else {
            // Direct mode
            const base = `${config.baseUrl}${endpoint}`;
            const separator = endpoint.includes('?') ? '&' : '?';
            return query ? `${base}${separator}${query}` : base;
        }
    }

    private serializeParams(params: Record<string, any>): string {
        const out = new URLSearchParams();
        for (const k in params) {
            const v = params[k];
            if (typeof v === 'boolean') out.append(k, v.toString());
            else out.append(k, String(v));
        }
        return out.toString();
    }
}
