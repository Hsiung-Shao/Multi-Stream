import { useState, useEffect, useCallback } from 'react';
import { twitchService } from '../features/twitch/TwitchService';

const STATE_KEY = 'twitch_auth_state';
const IMPORT_PENDING_KEY = 'twitch_import_pending';
const TOKEN_KEY = 'twitch_user_token';
export const RETURN_PAGE_KEY = 'twitch_return_page';

export interface TwitchAuth {
    token: string | null;
    isLoggedIn: boolean;
    login: () => Promise<void>;
    logout: () => void;
    isProcessing: boolean;
    shouldOpenSettings: boolean;
    clearPendingFlag: () => void;
    clearToken: () => void;
}

export function useTwitchAuth(): TwitchAuth {
    const [token, setToken] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [shouldOpenSettings, setShouldOpenSettings] = useState(false);

    // Initialize: Check sessionStorage first, then hash
    useEffect(() => {
        // 1. Check if token already exists in sessionStorage (e.g. after route navigation)
        const storedToken = sessionStorage.getItem(TOKEN_KEY);
        if (storedToken) {
            setToken(storedToken);
            const pending = sessionStorage.getItem(IMPORT_PENDING_KEY);
            if (pending) {
                setShouldOpenSettings(true);
            }
            return;
        }

        // 2. Check hash for token (OAuth redirect callback)
        const hash = window.location.hash;
        if (!hash) {
            const pending = sessionStorage.getItem(IMPORT_PENDING_KEY);
            if (pending) {
                setShouldOpenSettings(true);
            }
            return;
        }

        if (hash.includes('access_token')) {
            setIsProcessing(true);
            const params = new URLSearchParams(hash.substring(1));
            const accessToken = params.get('access_token');
            const state = params.get('state');
            const storedState = sessionStorage.getItem(STATE_KEY);

            // Verify state to prevent CSRF
            if (state !== storedState) {
                console.error('Twitch Auth State Mismatch');
                setIsProcessing(false);
                return;
            }

            if (accessToken) {
                setToken(accessToken);
                sessionStorage.setItem(TOKEN_KEY, accessToken);
                // Clear hash to clean up URL
                window.history.replaceState(null, '', window.location.pathname);

                const pending = sessionStorage.getItem(IMPORT_PENDING_KEY);
                if (pending) {
                    setShouldOpenSettings(true);
                }
            }

            sessionStorage.removeItem(STATE_KEY);
            setIsProcessing(false);
        }
    }, []);

    const login = useCallback(async () => {
        // 確保遠端配置已載入（修復首次載入 Client ID 缺失的問題）
        await twitchService.ensureConfig();

        const config = twitchService.getConfig();
        if (!config.clientId) {
            alert('請先設定 Twitch Client ID');
            return;
        }

        // Save current page for auto-return after OAuth
        const currentPath = window.location.pathname;
        if (currentPath && currentPath !== '/') {
            sessionStorage.setItem(RETURN_PAGE_KEY, currentPath);
        }

        const redirectUri = window.location.origin + '/';
        const scope = 'user:read:follows';
        const state = Math.random().toString(36).substring(7);

        sessionStorage.setItem(STATE_KEY, state);
        sessionStorage.setItem(IMPORT_PENDING_KEY, 'true');

        const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
        authUrl.searchParams.append('client_id', config.clientId);
        authUrl.searchParams.append('redirect_uri', redirectUri);
        authUrl.searchParams.append('response_type', 'token');
        authUrl.searchParams.append('scope', scope);
        authUrl.searchParams.append('state', state);

        window.location.href = authUrl.toString();
    }, []);

    const logout = useCallback(() => {
        setToken(null);
        setShouldOpenSettings(false);
        sessionStorage.removeItem(IMPORT_PENDING_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(RETURN_PAGE_KEY);
    }, []);

    const clearToken = useCallback(() => {
        setToken(null);
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(IMPORT_PENDING_KEY);
    }, []);

    const clearPendingFlag = useCallback(() => {
        setShouldOpenSettings(false);
        sessionStorage.removeItem(IMPORT_PENDING_KEY);
    }, []);

    return {
        token,
        isLoggedIn: !!token,
        login,
        logout,
        isProcessing,
        shouldOpenSettings,
        clearPendingFlag,
        clearToken
    };
}
