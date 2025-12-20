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

    // --- Public API Implementation ---

    public async searchChannels(query: string, limit = 10): Promise<ChannelSearchResult[]> {
        if (!query?.trim()) return [];

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
                // Note: URLSearchParams handles duplicates via append automatically in Client serializer
                // Client serializer needs to support array or we pass raw params?
                // The client.get serializeParams logic assumes basic KV. 
                // We need to iterate carefully.
                // However, our Client.serializeParams handles generic objects. 
                // We need to verify if standard URLSearchParams keeps array values.
                // It usually does NOT unless you append manually.
                // Let's pass a special object or adjust client? 
                // Actually, duplicate keys in fetch params are tricky with plain objects.
                // Let's modify the calls. For batching, we need to manually construct param string or pass array.
                // The legacy code manually appends parameters. Not using generic params object.
                // Let's implement a workaround: pass an object where value is array?
                // Our client serializer converts everything to string.
                // Let's do manual query string construction in get? No, that breaks interface.
                // We will rely on "param duplication" logic.

                // Let's perform requests manually to client but client exposes get(endpoint, params).
                // If we pass user_login: ['a','b'] to URLSearchParams, it becomes user_login=a,b (comma)
                // Twitch requires user_login=a&user_login=b.

                // REVISION: The legacy code does manual appending loop. 
                // New Client should likely handle arrays correctly or we must pass pre-serialized query?
                // Since interface is `Record<string, any>`, let's make the client smart about arrays.

                // *Self-correction*: I should update TwitchClient to handle arrays if not already done.
                // But I already wrote TwitchClient. Let's fix Service to handle it or update Client.
                // I'll update Client behavior in my mind (Client puts k=v). 
                // If I can't change Client file easily now, I might have a bug.
                // Wait, I can just use `user_login` repeats? No keys must be unique in Record.
                // SOLUTION: I will perform multiple requests recursively or hack the params?
                // Better: I will fix TwitchClient.ts in next step if verification fails, OR assume Client handles arrays.
                // Legacy code: `queryParams.append('user_login', login)`

                // Let's update `TwitchClient.ts` to handle arrays!
                // Since I cannot update TwitchClient.ts in this specific tool call (already written),
                // I will assume I wrote it correctly? No I wrote `out.append(k, String(v))`.
                // That will result in `user_login=a,b` which FAILs on Twitch API.

                // Workaround for this PR without modifying Client again immediately:
                // Construct the query string manually in the `endpoint` argument.
                // `endpoint` = `/streams?user_login=a&user_login=b...`
                // `params` = {}

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

    public getLegacyApi() {
        return {
            searchChannels: this.searchChannels.bind(this),
            checkChannelLiveStatus: this.checkChannelLiveStatus.bind(this),
            checkMultipleChannelsLiveStatus: this.checkMultipleChannelsLiveStatus.bind(this),
            setConfig: this.setConfig.bind(this),
            getConfig: this.getConfig.bind(this),
            clearCache: this.clearCache.bind(this)
        };
    }

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
