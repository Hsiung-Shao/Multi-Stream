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

        // --- DIRECT MODE ENFORCEMENT ---
        // We do NOT use the generic proxy (/api?endpoint=...) anymore.
        // We ALWAYS use Direct Twitch Helix URL.
        const baseUrl = 'https://api.twitch.tv/helix';
        const url = this.buildUrl(baseUrl, endpoint, params);

        // Headers for Direct API
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        // 1. Client ID Logic
        if (!config.clientId) {
            const msg = 'Missing Client ID. Check /api/twitch-config or VITE_TWITCH_CLIENT_ID.';
            if (debug) console.error(`[TwitchClient] ${msg}`);
            throw new Error(msg);
        }
        headers['Client-ID'] = config.clientId;

        // 2. Token Logic
        try {
            const token = await this.tokenProvider.getAccessToken();
            headers['Authorization'] = `Bearer ${token}`;
        } catch (e: any) {
            if (debug) console.error('[TwitchClient] Token error:', e);
            throw new Error(`無法取得 Access Token：${e.message || e}`);
        }

        // Debug Request
        if (debug) {
            console.log(`[TwitchClient] GET ${url}`, {
                headers: { ...headers, Authorization: headers.Authorization ? 'Bearer ******' : undefined }
            });
        }

        // Execute Request
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const res = await fetch(url, {
                method: 'GET',
                headers,
                signal: controller.signal
            });
            clearTimeout(id);

            if (debug) {
                console.log(`[TwitchClient] Response ${res.status} ${res.statusText}`);
            }

            // HTML / SPA Fallback Detection (Hard Check)
            const contentType = res.headers.get('content-type');
            if (!res.ok || (contentType && contentType.includes('text/html'))) {
                const errBody = await res.text();

                // If body looks like HTML, it's likely a 404 falling back to index.html or Cloudflare error page
                if (errBody.trim().startsWith('<') || (contentType && contentType.includes('text/html'))) {
                    const msg = `[TwitchClient] API Error: Received HTML instead of JSON. (Status: ${res.status}). Likely Network Error or SPA Fallback.`;
                    console.error(msg);
                    if (debug) console.log('Body Peek:', errBody.slice(0, 80));
                    throw new Error(msg);
                }

                if (!res.ok) {
                    if (debug) console.log(`[TwitchClient] Error Body (Peek):`, errBody.slice(0, 500));
                    const safeRes = new Response(errBody, { status: res.status, statusText: res.statusText, headers: res.headers });
                    Object.defineProperty(safeRes, 'url', { value: res.url });
                    return await this.handleError(safeRes, endpoint, params, headers);
                }
            }

            return await res.json();
        } catch (error) {
            if (debug) console.error('[TwitchClient] Fetch failed:', error);
            if (error instanceof SyntaxError) {
                console.error('[TwitchClient] JSON Parse Failed. Response might be HTML/Invalid.', error);
            }
            if ((error as Error).message && (error as Error).message.includes('API')) throw error;
            if ((error as Error).message && (error as Error).message.includes('HTML')) throw error;

            // Check for AbortError (Timeout)
            if ((error as Error).name === 'AbortError') {
                throw new Error('Twitch API 請求逾時 (10s)，請檢查網路狀況');
            }

            if ((error as Error).name === 'TypeError' && (error as Error).message.includes('fetch')) {
                throw new Error('無法連接到 Twitch API，請檢查網路連線');
            }
            throw error;
        }
    }

    private checkRateLimit(config: TwitchApiConfig) {
        const now = Date.now();
        const limit = config.rateLimit;

        // Clean old
        this.requestHistory = this.requestHistory.filter(t => now - t < limit.windowMs);

        // Check count
        if (this.requestHistory.length >= limit.maxRequests) {
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
        originalHeaders: any
    ): Promise<any> {
        // 401 Re-auth
        if (res.status === 401) {
            // Force refresh
            try {
                const newToken = await this.tokenProvider.refreshToken();
                originalHeaders['Authorization'] = `Bearer ${newToken}`;

                // Retry Once
                const win = (typeof window !== 'undefined' ? window : {}) as any;
                if (win.__MS_DEBUG_TWITCH__) console.log('[TwitchClient] Retrying after 401...');

                const baseUrl = 'https://api.twitch.tv/helix';
                const retryUrl = this.buildUrl(baseUrl, endpoint, params);
                const retryRes = await fetch(retryUrl, { method: 'GET', headers: originalHeaders });

                if (retryRes.ok) return await retryRes.json();
            } catch (retryErr) {
                // Determine error message based on failure
            }
            throw new Error('Twitch API 認證失敗，請檢查 Client ID 和 Client Secret 設定');
        }

        if (res.status === 429) throw new Error('API 請求過於頻繁，請稍後再試');
        if (res.status === 404) return null;

        throw new Error(`API 請求失敗：${res.status} ${res.statusText}`);
    }

    private buildUrl(baseUrl: string, endpoint: string, params: Record<string, any>): string {
        const query = this.serializeParams(params);
        const separator = endpoint.includes('?') ? '&' : '?';
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
        return query ? `${baseUrl}${cleanEndpoint}${separator}${query}` : `${baseUrl}${cleanEndpoint}`;
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
