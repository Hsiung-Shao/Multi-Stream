import { createContext, useContext, type ReactNode } from 'react';
import { useAuth, type AuthState } from '../hooks/useAuth';

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
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
