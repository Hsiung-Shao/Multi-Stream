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
            // 保留供本地測試使用 (config.js)
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

        // Client Secret（僅從環境變數取得，不應存在前端 localStorage）
        config.clientSecret =
            getEnv('TWITCH_CLIENT_SECRET') ||
            getGlobal('TWITCH_CLIENT_SECRET') ||
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
        const debug = Boolean(win.__MS_DEBUG_TWITCH__);
        if (debug) {
            console.debug('[TwitchConfig] Resolved:', {
                clientId: config.clientId ? '(Present)' : '(Missing)',
                hasSecret: !!config.clientSecret,
                useProxy: config.useProxy,
                proxyUrl: config.proxyUrl,
                baseUrl: config.baseUrl,
                envMode: import.meta.env.MODE,
                sources: {
                    viteEnv: !!getEnv('VITE_TWITCH_CLIENT_ID'),
                    globalConfig: !!getGlobal('TWITCH_CLIENT_ID'),
                    localStorage: !!getStorage('twitchClientId')
                }
            });
        }

        if (!config.clientId) {
            const msg = '[TwitchConfig] CRITICAL: Twitch Client ID is missing!';
            console.error(msg);
            console.error('Please set VITE_TWITCH_CLIENT_ID in your environment variables (e.g., .env file or Cloudflare Pages Settings).');
            if (debug) {
                console.warn('Diagnostics:');
                console.warn('1. Check if VITE_TWITCH_CLIENT_ID is set in Cloudflare Pages "Environment variables".');
                console.warn('2. If using config.js, ensure window.CONFIG.TWITCH_CLIENT_ID is populated.');
            }
        }

        return config;
    }

    public update(updates: Partial<TwitchApiConfig>): TwitchApiConfig {
        const current = this.resolve();
        const merged = { ...current, ...updates };

        try {
            if (updates.clientId !== undefined) localStorage.setItem('twitchClientId', updates.clientId);
            // clientSecret 不應存儲在 localStorage — 僅透過環境變數或後端 API 取得
            if (updates.accessToken !== undefined) localStorage.setItem('twitchAccessToken', updates.accessToken);
            if (updates.proxyUrl !== undefined) localStorage.setItem('twitchProxyUrl', updates.proxyUrl);
            if (updates.useProxy !== undefined) localStorage.setItem('twitchUseProxy', updates.useProxy.toString());
        } catch {
            console.error('Failed to persist Twitch config');
        }

        return merged;
    }
}
