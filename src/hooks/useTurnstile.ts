import { useState, useEffect, useCallback, useRef } from 'react';

interface TurnstileState {
  /** Turnstile Site Key（從後端取得） */
  siteKey: string | null;
  /** 前端取得的 Turnstile token */
  token: string | null;
  /** 是否正在驗證中 */
  isVerifying: boolean;
  /** 驗證錯誤訊息 */
  error: string | null;
  /** token 是否已通過後端驗證 */
  isVerified: boolean;
  /** 設定 token（由 Turnstile widget onSuccess 回呼使用） */
  setToken: (token: string) => void;
  /** 透過後端驗證 token */
  verifyToken: () => Promise<boolean>;
  /** 重置狀態（用於重試或表單重設） */
  reset: () => void;
  /** Turnstile widget ref（用於程式化重置） */
  widgetRef: React.MutableRefObject<{ reset: () => void } | null>;
}

let cachedSiteKey: string | null = null;

async function fetchSiteKey(): Promise<string | null> {
  if (cachedSiteKey) return cachedSiteKey;

  try {
    const res = await fetch('/api/turnstile-config');
    const data = await res.json();
    cachedSiteKey = data.siteKey || null;
    return cachedSiteKey;
  } catch {
    return null;
  }
}

/**
 * Turnstile 驗證 Hook
 *
 * 使用方式：
 * 1. 在表單中放入 <Turnstile siteKey={siteKey} onSuccess={setToken} />
 * 2. 表單提交前呼叫 verifyToken() 驗證 token
 * 3. 驗證通過後才允許提交
 */
export function useTurnstile(): TurnstileState {
  const [siteKey, setSiteKey] = useState<string | null>(cachedSiteKey);
  const [token, setToken] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const widgetRef = useRef<{ reset: () => void } | null>(null);

  // 載入 Site Key
  useEffect(() => {
    if (!siteKey) {
      fetchSiteKey().then(setSiteKey);
    }
  }, [siteKey]);

  const verifyToken = useCallback(async (): Promise<boolean> => {
    if (!token) {
      setError('請完成人機驗證');
      return false;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const res = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (data.success) {
        setIsVerified(true);
        return true;
      } else {
        setError(data.error || '驗證失敗，請重試');
        setIsVerified(false);
        // 驗證失敗時重置 widget
        widgetRef.current?.reset();
        setToken(null);
        return false;
      }
    } catch {
      setError('網路錯誤，請重試');
      setIsVerified(false);
      return false;
    } finally {
      setIsVerifying(false);
    }
  }, [token]);

  const reset = useCallback(() => {
    setToken(null);
    setError(null);
    setIsVerified(false);
    setIsVerifying(false);
    widgetRef.current?.reset();
  }, []);

  return {
    siteKey,
    token,
    isVerifying,
    error,
    isVerified,
    setToken,
    verifyToken,
    reset,
    widgetRef,
  };
}
