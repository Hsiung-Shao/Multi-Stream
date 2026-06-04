import type { User, UserIdentity } from '@supabase/supabase-js';
import type { AuthState, UserProfile } from '../hooks/useAuth';

/**
 * DEV-only 唯讀 auth mock。
 *
 * 啟用條件：`import.meta.env.DEV && localStorage.devMockAuth === '1'`。
 * 用途：讓 auth-gated 頁面（如 /account）在無真實登入時也能渲染 shell，
 *       供視覺驗證 / 截圖。
 *
 * 安全保證：
 *   - 僅在 DEV build 生效（生產 import.meta.env.DEV === false，整段不啟用）。
 *   - 所有 mutation（login/logout/link/unlink/updateDisplayName/refreshProfile…）
 *     一律替換為 no-op，**絕不觸發任何網路寫入**。
 *   - 預設關閉：localStorage 沒設 devMockAuth='1' 就回 null，沿用真實 useAuth。
 */
export function isDevAuthMockEnabled(): boolean {
    if (!import.meta.env.DEV) return false;
    try {
        return localStorage.getItem('devMockAuth') === '1';
    } catch {
        return false;
    }
}

const noopAsync = async () => { /* dev mock: no network */ };

const MOCK_PROFILE: UserProfile = {
    id: 'dev-mock-profile',
    supabase_auth_id: 'dev-mock-user',
    display_name: 'Dev Mock User',
    avatar_url: null,
    trust_level: 'trusted',
    twitch_login: 'dev_mock',
    discord_username: null,
    created_at: '2025-11-26T00:00:00.000Z',
};

const MOCK_USER = {
    id: 'dev-mock-user',
    email: 'dev-mock@example.com',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2025-11-26T00:00:00.000Z',
    identities: [
        { provider: 'twitch', identity_id: 'dev-twitch' } as unknown as UserIdentity,
    ],
} as unknown as User;

/**
 * 用真實 useAuth 回傳值為底，覆蓋為「已登入」唯讀狀態。
 * 保留真實 mfa gate 相關欄位為安全預設（不彈 gate），mutation 全 no-op。
 */
export function buildDevAuthMock(): AuthState {
    return {
        user: MOCK_USER,
        profile: MOCK_PROFILE,
        session: null,
        isLoading: false,
        isLoggedIn: true,
        isAdmin: false,
        canModerate: false,
        isBanned: false,
        identities: MOCK_USER.identities ?? [],
        mfaRequired: false,
        onMfaVerified: noopAsync,
        recheckMfa: noopAsync,
        login: noopAsync,
        logout: noopAsync,
        refreshProfile: noopAsync,
        updateDisplayName: async () => false,
        linkIdentity: noopAsync,
        unlinkIdentity: noopAsync,
    };
}
