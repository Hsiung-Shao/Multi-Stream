import { TwitchApiConfig, ConfigResolverContract } from './types.ts';

const DEFAULT_CONFIG: TwitchApiConfig = {
    clientId: '',
    clientSecret: '',
    accessToken: '',
    baseUrl: 'https://api.twitch.tv/helix',
    oauthTokenUrl: 'https://id.twitch.tv/oauth2/token',
    useProxy: false,
    proxyUrl: '',
    cacheEnabled: true,
    cacheDuration: 60000,
    rateLimit: {
        maxRequests: 30,
        windowMs: 60000
    }
};

/**
 * Manages configuration resolution and persistence.
 * Adheres to: Env > Window.CONFIG > LocalStorage > Defaults
 */
export class TwitchConfigResolver implements ConfigResolverContract {

    public resolve(): TwitchApiConfig {
        const config = { ...DEFAULT_CONFIG };
        const win = (typeof window !== 'undefined' ? window : {}) as any;
        const env = (import.meta as any).env || {};

        // Helper to get environment value
        const getEnv = (key: string): string | undefined => {
            // Check import.meta.env
            if (env[key]) return env[key];
            // Check window.__ENV__
            if (win.__ENV__ && win.__ENV__[key]) return win.__ENV__[key];
            return undefined;
        };

        // Helper to get global config value
        const getGlobal = (key: string): string | undefined => {
            if (win.CONFIG && win.CONFIG[key]) return win.CONFIG[key];
            return undefined;
        };

        // Helper to get localStorage value
        const getStorage = (key: string): string | undefined => {
            try {
                return localStorage.getItem(key) || undefined;
            } catch { return undefined; }
        };

        // --- Resolve Values ---

        // Client ID
        config.clientId =
            getEnv('VITE_TWITCH_CLIENT_ID') ||
            getEnv('TWITCH_CLIENT_ID') ||
            getGlobal('TWITCH_CLIENT_ID') ||
            getStorage('twitchClientId') ||
            '';

        // Client Secret
        config.clientSecret =
            getEnv('TWITCH_CLIENT_SECRET') ||
            getGlobal('TWITCH_CLIENT_SECRET') ||
            getStorage('twitchClientSecret') ||
            '';

        // Access Token
        config.accessToken =
            getGlobal('TWITCH_ACCESS_TOKEN') ||
            getStorage('twitchAccessToken') ||
            '';

        // Proxy URL
        config.proxyUrl =
            getGlobal('TWITCH_PROXY_URL') ||
            getStorage('twitchProxyUrl') ||
            '';

        // Use Proxy
        const globalUseProxy = getGlobal('TWITCH_USE_PROXY');
        const storageUseProxy = getStorage('twitchUseProxy');

        if (globalUseProxy !== undefined) {
            config.useProxy = Boolean(globalUseProxy);
        } else if (storageUseProxy !== undefined) {
            config.useProxy = storageUseProxy === 'true';
        }

        // --- Debug Logging ---
        if (win.__MS_DEBUG_TWITCH__) {
            console.debug('[TwitchConfig] Resolved:', {
                clientId: config.clientId ? '(Present)' : '(Missing)',
                hasSecret: !!config.clientSecret,
                useProxy: config.useProxy,
                proxyUrl: config.proxyUrl,
                baseUrl: config.baseUrl
            });
            if (!config.clientId) {
                console.warn('[TwitchConfig] NO CLIENT ID FOUND! API calls will fail.');
            }
        }

        return config;
    }

    public update(updates: Partial<TwitchApiConfig>): TwitchApiConfig {
        const current = this.resolve();
        const merged = { ...current, ...updates };

        try {
            if (updates.clientId !== undefined) localStorage.setItem('twitchClientId', updates.clientId);
            if (updates.clientSecret !== undefined) localStorage.setItem('twitchClientSecret', updates.clientSecret);
            if (updates.accessToken !== undefined) localStorage.setItem('twitchAccessToken', updates.accessToken);
            if (updates.proxyUrl !== undefined) localStorage.setItem('twitchProxyUrl', updates.proxyUrl);
            if (updates.useProxy !== undefined) localStorage.setItem('twitchUseProxy', updates.useProxy.toString());
        } catch (e) {
            console.error('Failed to persist Twitch config', e);
        }

        return merged;
    }
}
