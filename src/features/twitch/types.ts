/**
 * Twitch API System - Type Definitions & Contracts
 */

// --- 1. Configuration Contract ---

export interface TwitchApiConfig {
    clientId: string;
    clientSecret?: string;
    accessToken?: string;

    // Networking
    baseUrl: string;
    oauthTokenUrl: string;

    // Proxy
    useProxy: boolean;
    proxyUrl?: string;

    // Caching & Limits
    cacheEnabled: boolean;
    cacheDuration: number; // ms

    rateLimit: {
        maxRequests: number;
        windowMs: number;
    };
}

export interface ConfigResolverContract {
    /**
     * Resolves configuration from Env > Window > LocalStorage
     */
    resolve(): TwitchApiConfig;

    /**
     * Updates runtime configuration and persists allowable fields to LocalStorage
     */
    update(updates: Partial<TwitchApiConfig>): TwitchApiConfig;
}

// --- 2. Authentication Contract ---

export interface TwitchToken {
    accessToken: string;
    expiresAt: number; // timestamp
}

export interface TokenProviderContract {
    /**
     * Returns a valid access token.
     * Logic:
     * 1. Check memory/cache (if valid)
     * 2. Check LocalStorage (if valid)
     * 3. Fetch from Proxy/Pages Function (primary)
     * 4. Fallback to Direct Twitch OAuth (if secret avail)
     */
    getAccessToken(): Promise<string>;

    /**
     * Forces a refresh of the token (clears cache and refetches)
     */
    refreshToken(): Promise<string>;

    /**
     * Clears all stored tokens
     */
    clearToken(): void;
}

// --- 3. Rate Limit Contract ---

export interface RateLimitState {
    requests: number[]; // timestamps
    resetTime: number;
}

export interface RateLimitNotifierContract {
    /**
     * Shows the rate limit warning to the user.
     * @param waitSeconds Seconds to wait
     * SIDE EFFECT: This interacts with DOM (via adapter)
     */
    notify(waitSeconds: number): void;
}

// --- 4. Client Contract ---

export interface TwitchClientContract {
    /**
     * Performs an authenticated get request to the Helix API.
     * Handles: Headers, Auto-Auth, Rate Limiting, 401 Re-auth
     */
    get<T>(endpoint: string, params?: Record<string, any>): Promise<T | null>;
}

// --- 5. Service Contract (Public API) ---

export interface ChannelSearchResult {
    id: string;
    login: string;
    displayName: string;
    title: string;
    isLive: boolean;
    thumbnailUrl: string;
    gameName: string;
    viewerCount: number;
    startedAt: string;
    url: string;
}

export interface LiveStatusResult {
    isLive: boolean | null; // null = unknown/error
    channelLogin: string;
    title?: string;
    gameName?: string;
    viewerCount?: number;
    startedAt?: string;
    thumbnailUrl?: string;
    error?: string;
}

export interface TwitchApiContract {
    /**
     * Searches channels (helix/search/channels)
     */
    searchChannels(query: string, limit?: number): Promise<ChannelSearchResult[]>;

    /**
     * Checks if a single channel is live (helix/streams)
     */
    checkChannelLiveStatus(channelLogin: string): Promise<LiveStatusResult>;

    /**
     * Checks multiple channels live status in batches
     */
    checkMultipleChannelsLiveStatus(channelLogins: string[]): Promise<Record<string, LiveStatusResult>>;

    /**
     * Updates configuration
     */
    setConfig(config: Partial<TwitchApiConfig>): void;

    /**
     * Gets current configuration (sanitized)
     */
    getConfig(): Partial<TwitchApiConfig>;

    /**
     * Clears internal memory cache
     */
    clearCache(): void;
}

// --- 6. Legacy Bridge ---

declare global {
    interface Window {
        twitchApi?: TwitchApiContract;

        // Legacy Envs (for reference)
        CONFIG?: any;
        __ENV__?: any;
    }
}
