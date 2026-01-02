import { useState, useEffect, useCallback } from 'react';
import { twitchService } from '../features/twitch/TwitchService';

const STATE_KEY = 'twitch_auth_state';
const IMPORT_PENDING_KEY = 'twitch_import_pending';

export interface TwitchAuth {
    token: string | null;
    isLoggedIn: boolean;
    login: () => void;
    logout: () => void;
    isProcessing: boolean;
    shouldOpenSettings: boolean; // Flag to indicate if settings should be opened after redirect
    clearPendingFlag: () => void;
}

export function useTwitchAuth(): TwitchAuth {
    const [token, setToken] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [shouldOpenSettings, setShouldOpenSettings] = useState(false);

    // Initialize: Check hash for token
    useEffect(() => {
        const hash = window.location.hash;
        if (!hash) {
            // If no hash, check if we have a pending import flag
            // This is useful if the user refreshed or navigated back, but we want to re-open the modal if they are "logged in" logically (though token is gone on refresh per requirement)
            // actually, per requirement, token is memory only, so on refresh it's gone.
            // But if we just redirected back from Twitch, we might have the flag + hash.
            const pending = sessionStorage.getItem(IMPORT_PENDING_KEY);
            if (pending) {
                setShouldOpenSettings(true);
            }
            return;
        }

        if (hash.includes('access_token')) {
            setIsProcessing(true);
            const params = new URLSearchParams(hash.substring(1)); // remove #
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
                // Clear hash to clean up URL
                window.history.replaceState(null, '', window.location.pathname);

                // Check if we initiated this flow for import
                const pending = sessionStorage.getItem(IMPORT_PENDING_KEY);
                if (pending) {
                    setShouldOpenSettings(true);
                }
            }

            sessionStorage.removeItem(STATE_KEY);
            setIsProcessing(false);
        }
    }, []);

    const login = useCallback(() => {
        const config = twitchService.getConfig();
        if (!config.clientId) {
            alert('請先設定 Twitch Client ID');
            return;
        }

        const redirectUri = 'http://localhost:3000/'; // Fixed per requirement
        const scope = 'user:read:follows';
        const state = Math.random().toString(36).substring(7);

        sessionStorage.setItem(STATE_KEY, state);
        sessionStorage.setItem(IMPORT_PENDING_KEY, 'true'); // Flag to re-open UI

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
        // Optional: Revoke token via API if needed, but for implicit flow just clearing client side is standard
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
        clearPendingFlag
    };
}
