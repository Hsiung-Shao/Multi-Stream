import {
    TwitchApiConfig,
    TwitchApiContract,
    ConfigResolverContract,
    TokenProviderContract,
    TwitchClientContract,
    RateLimitNotifierContract,
    ChannelSearchResult,
    LiveStatusResult
} from './types.ts';

import { TwitchConfigResolver } from './TwitchConfig.ts';
import { TokenProvider } from './TokenProvider.ts';
import { TwitchClient } from './TwitchClient.ts';
import { DomRateLimitNotifier } from './RateLimitNotifier.ts';

/**
 * Service orchestrating all Twitch Interactions.
 * Keeps instances of Config, TokenProvider, Client internally to avoid auto-run side effects.
 */
export class TwitchService implements TwitchApiContract {
    private configResolver: ConfigResolverContract;
    private tokenProvider: TokenProviderContract;
    private client: TwitchClientContract;
    private notifier: RateLimitNotifierContract;

    // In-memory cache
    private apiCache = new Map<string, { data: any, timestamp: number }>();

    // Config fetch state
    private configPromise: Promise<void> | null = null;
    private configLoaded = false;

    // Dependencies are injected for testability, defaulted for production
    constructor(
        configResolver?: ConfigResolverContract,
        tokenProvider?: TokenProviderContract,
        client?: TwitchClientContract,
        notifier?: RateLimitNotifierContract
    ) {
        this.configResolver = configResolver || new TwitchConfigResolver();

        const getConfig = () => this.configResolver.resolve();

        this.tokenProvider = tokenProvider || new TokenProvider(getConfig);
        this.notifier = notifier || new DomRateLimitNotifier();
        this.client = client || new TwitchClient(getConfig, this.tokenProvider, this.notifier);
    }

    // --- Private: Lazy Config Loading ---

    private async ensureConfig(): Promise<void> {
        // Optimization: If loaded or has static client ID, skip
        if (this.configLoaded) return;
        const current = this.configResolver.resolve();
        // If we have a clientId from Env/Storage, we consider it "loaded" enough, 
        // unless you want to *force* remote config override. 
        // User requirements: "clientId 缺失時，不要直接 fail... 先嘗試呼叫"
        if (current.clientId) {
            this.configLoaded = true;
            return;
        }

        // If defined but pending, wait
        if (this.configPromise) {
            return this.configPromise;
        }

        // Start fetch
        this.configPromise = this.fetchRemoteConfig().finally(() => {
            this.configPromise = null;
        });

        await this.configPromise;
        this.configLoaded = true;
    }

    private async fetchRemoteConfig(): Promise<void> {
        const win = (typeof window !== 'undefined' ? window : {}) as any;
        const debug = !!win.__MS_DEBUG_TWITCH__;

        try {
            if (debug) console.debug('[TwitchService] Fetching remote config from /api/twitch-config');
            const res = await fetch('/api/twitch-config');
            if (!res.ok) {
                if (debug) console.warn('[TwitchService] Remote config fetch failed:', res.status);
                return;
            }

            const data = await res.json();
            if (debug) console.debug('[TwitchService] Remote config received:', {
                hasClientId: !!data.clientId,
                useProxy: data.useProxy
            });

            if (data.clientId) {
                this.configResolver.update({
                    clientId: data.clientId,
                    // Direct Mode: Force disable proxy even if backend says otherwise (legacy)
                    useProxy: false,
                    proxyUrl: ''
                });
            }
        } catch (e) {
            if (debug) console.warn('[TwitchService] Remote config fetch error:', e);
            // Don't throw, let legacy logic fail if it must
        }
    }

    // --- Public API Implementation ---

    public async searchChannels(query: string, limit = 10): Promise<ChannelSearchResult[]> {
        if (!query?.trim()) return [];
        await this.ensureConfig();

        const cacheKey = `search_${query}_${limit}`;
        const cached = this.getFromCache<any>(cacheKey);
        if (cached) return this.mapSearchResults(cached);

        try {
            const data = await this.client.get<any>('/search/channels', {
                query: query.trim(),
                first: limit,
                live_only: false
            });

            if (!data?.data) return [];
            this.setCache(cacheKey, data);
            return this.mapSearchResults(data);
        } catch (e) {
            throw e;
        }
    }

    public async checkChannelLiveStatus(channelLogin: string): Promise<LiveStatusResult> {
        if (!channelLogin) return { isLive: null, channelLogin: '' };
        await this.ensureConfig();

        try {
            const data = await this.client.get<any>('/streams', { user_login: channelLogin });

            if (!data?.data?.length) {
                return { isLive: false, channelLogin };
            }

            const stream = data.data[0];
            return {
                isLive: true,
                channelLogin,
                title: stream.title,
                gameName: stream.game_name,
                viewerCount: stream.viewer_count,
                startedAt: stream.started_at,
                thumbnailUrl: stream.thumbnail_url
            };
        } catch (e: any) {
            // Swallow error per contract
            return { isLive: null, channelLogin, error: e.message };
        }
    }

    public async checkMultipleChannelsLiveStatus(channelLogins: string[]): Promise<Record<string, LiveStatusResult>> {
        if (!channelLogins?.length) return {};
        await this.ensureConfig();

        const BATCH_SIZE = 100;
        const results: Record<string, LiveStatusResult> = {};

        // Init all as offline
        channelLogins.forEach(login => {
            results[login] = { isLive: false, channelLogin: login };
        });

        // Batch Process
        for (let i = 0; i < channelLogins.length; i += BATCH_SIZE) {
            const batch = channelLogins.slice(i, i + BATCH_SIZE);
            try {
                // Manual query construction for repeated keys
                const qs = new URLSearchParams();
                batch.forEach(login => qs.append('user_login', login));
                const endpointWithQuery = `/streams?${qs.toString()}`;

                const data = await this.client.get<any>(endpointWithQuery);

                if (data?.data) {
                    data.data.forEach((stream: any) => {
                        const login = stream.user_login.toLowerCase();
                        results[login] = {
                            isLive: true,
                            channelLogin: login,
                            title: stream.title,
                            gameName: stream.game_name,
                            viewerCount: stream.viewer_count,
                            startedAt: stream.started_at,
                            thumbnailUrl: stream.thumbnail_url
                        };
                    });
                }

                if (i + BATCH_SIZE < channelLogins.length) {
                    await new Promise(r => setTimeout(r, 200));
                }

            } catch (e) {
                // Batch failed? Legacy swallows the error for the batch.
            }
        }

        return results;
    }

    public setConfig(config: Partial<TwitchApiConfig>): void {
        const newConf = this.configResolver.update(config);
        // If secrets changed, clear token
        if (config.clientSecret || config.clientId) {
            this.tokenProvider.clearToken();
        }
    }

    public getConfig(): Partial<TwitchApiConfig> {
        const conf = this.configResolver.resolve();
        // Hide secret
        return {
            clientId: conf.clientId,
            clientSecret: conf.clientSecret ? '******' : undefined,
            useProxy: conf.useProxy,
            proxyUrl: conf.proxyUrl
        };
    }

    public clearCache(): void {
        this.apiCache.clear();
    }

    // --- Helpers ---

    private getFromCache<T>(key: string): T | null {
        const config = this.configResolver.resolve();
        if (!config.cacheEnabled) return null;

        const cached = this.apiCache.get(key);
        if (!cached) return null;

        if (Date.now() - cached.timestamp > config.cacheDuration) {
            this.apiCache.delete(key);
            return null;
        }
        return cached.data;
    }

    private setCache(key: string, data: any) {
        const config = this.configResolver.resolve();
        if (config.cacheEnabled) {
            this.apiCache.set(key, { data, timestamp: Date.now() });
        }
    }

    private mapSearchResults(data: any): ChannelSearchResult[] {
        if (!data?.data) return [];
        return data.data.map((channel: any) => ({
            id: channel.id,
            login: channel.broadcaster_login,
            displayName: channel.display_name,
            title: channel.title,
            isLive: channel.is_live,
            thumbnailUrl: channel.thumbnail_url,
            gameName: channel.game_name,
            viewerCount: channel.is_live ? (channel.viewer_count || 0) : 0,
            startedAt: channel.started_at,
            url: `https://www.twitch.tv/${channel.broadcaster_login}`
        }));
    }
}

export const twitchService = new TwitchService();
