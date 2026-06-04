import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth, type AuthState } from '../hooks/useAuth';
import { MfaLoginGate } from '../features/account/MfaLoginGate';
import { isDevAuthMockEnabled, buildDevAuthMock } from './devAuthMock';

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const realAuth = useAuth();

  // DEV-only 唯讀 mock：僅在 import.meta.env.DEV 且 localStorage.devMockAuth==='1' 時，
  // 用假的「已登入」唯讀狀態覆蓋真實 auth，供 auth-gated 頁面渲染截圖。
  // 生產 build (DEV=false) 整段不啟用；mutation 全 no-op，不觸發任何網路寫入。
  const auth = useMemo<AuthState>(
    () => (isDevAuthMockEnabled() ? buildDevAuthMock() : realAuth),
    [realAuth],
  );

  return (
    <AuthContext.Provider value={auth}>
      {children}
      {/* 全域強制 MFA 閘門：user 啟用 2FA 但 session aal1 → 必須先驗證才能使用 app。
          配合 server endpoint aal2 檢查 + RLS aal2 policy，2FA 在攻擊者偷到
          OAuth credentials 場景下也能起到實質保護。 */}
      <MfaLoginGate
        open={auth.mfaRequired}
        onSuccess={auth.onMfaVerified}
        onLogout={auth.logout}
      />
    </AuthContext.Provider>
  );
}

/**
 * 從 context 取得認證狀態
 * 必須在 AuthProvider 內使用
 */
export function useAuthContext(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return ctx;
}
