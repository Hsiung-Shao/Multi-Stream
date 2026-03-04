import { TwitchApiConfig, TokenProviderContract } from './types.ts';

/**
 * Handles Access Token acquisition and persistence.
 * Primary: Cloudflare Pages Function (/api/twitch-token)
 * Fallback: Direct OAuth (id.twitch.tv) if Client Secret is available
 */
export class TokenProvider implements TokenProviderContract {
    private cachedToken: string | null = null;
    private cachedTokenExpiry = 0;

    constructor(private getConfig: () => TwitchApiConfig) { }

    public async getAccessToken(): Promise<string> {
        const win = (typeof window !== 'undefined' ? window : {}) as any;
        const debug = !!win.__MS_DEBUG_TWITCH__;

        // 1. Check Memory Cache
        const now = Date.now();
        if (this.cachedToken && now < this.cachedTokenExpiry) {
            if (debug) console.debug('[TokenProvider] Using memory cached token');
            return this.cachedToken;
        }

        // 2. Check Static Config Override
        const config = this.getConfig();
        if (config.accessToken) {
            if (debug) console.debug('[TokenProvider] Using config access token override');
            this.setCache(config.accessToken, now + (60 * 24 * 60 * 60 * 1000)); // Assume long-lived
            return config.accessToken;
        }

        // 3. Check LocalStorage
        try {
            const stored = localStorage.getItem('twitchAccessToken');
            const expiresAtStr = localStorage.getItem('twitchAccessTokenExpiresAt');
            if (stored && expiresAtStr) {
                const expiresAt = parseInt(expiresAtStr, 10);
                if (now < expiresAt) {
                    if (debug) console.debug('[TokenProvider] Using localStorage cached token');
                    this.cachedToken = stored;
                    this.cachedTokenExpiry = expiresAt;
                    return stored;
                } else if (debug) {
                    console.debug('[TokenProvider] LocalStorage token expired');
                }
            }
        } catch { }

        // 4. Fetch New Token (Pages -> Fallback Direct)
        return await this.fetchNewToken();
    }

    public async refreshToken(): Promise<string> {
        const win = (typeof window !== 'undefined' ? window : {}) as any;
        if (win.__MS_DEBUG_TWITCH__) console.debug('[TokenProvider] Refreshing token...');
        this.clearToken();
        return await this.fetchNewToken();
    }

    public clearToken(): void {
        this.cachedToken = null;
        this.cachedTokenExpiry = 0;
        try {
            localStorage.removeItem('twitchAccessToken');
            localStorage.removeItem('twitchAccessTokenExpiresAt');
        } catch { }
    }

    private async fetchNewToken(): Promise<string> {
        const win = (typeof window !== 'undefined' ? window : {}) as any;
        const debug = !!win.__MS_DEBUG_TWITCH__;

        // Try Pages Function first (Standard Production Path)
        try {
            if (debug) console.debug('[TokenProvider] Fetching from Pages /api/twitch-token');
            return await this.fetchFromPages();
        } catch (pagesError) {
            if (debug) console.warn('[TokenProvider] Pages fetch failed:', pagesError);

            // Fallback to Direct (If Secret is Available)
            const config = this.getConfig();
            if (config.clientSecret && config.clientId) {
                if (debug) console.debug('[TokenProvider] Fallback to direct OAuth');
                return await this.fetchDirectly(config);
            }
            throw new Error('Unable to acquire Twitch token');
        }
    }

    private async fetchFromPages(): Promise<string> {
        const res = await fetch('/api/twitch-token', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) {
            throw new Error(`Pages Error: ${res.status}`);
        }

        const data = await res.json();
        if (!data.access_token) throw new Error('No access_token in Pages response');

        return this.processToken(data);
    }

    private async fetchDirectly(config: TwitchApiConfig): Promise<string> {
        const params = new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret!,
            grant_type: 'client_credentials'
        });

        const res = await fetch(config.oauthTokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        if (!res.ok) {
            throw new Error(`Direct Auth Failed: ${res.status}`);
        }

        const data = await res.json();
        if (!data.access_token) throw new Error('No access_token in Direct response');

        return this.processToken(data);
    }

    private processToken(data: any): string {
        const token = data.access_token;
        // Default 3600s, buffer 5 mins (300s)
        const expiresInMs = (data.expires_in || 3600) * 1000;
        const expiresAt = Date.now() + expiresInMs - (5 * 60 * 1000);

        this.setCache(token, expiresAt);
        this.persistToken(token, expiresAt);
        return token;
    }

    private setCache(token: string, expiresAt: number) {
        this.cachedToken = token;
        this.cachedTokenExpiry = expiresAt;
    }

    private persistToken(token: string, expiresAt: number) {
        try {
            localStorage.setItem('twitchAccessToken', token);
            localStorage.setItem('twitchAccessTokenExpiresAt', expiresAt.toString());
        } catch { }
    }
}
