import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase, manualRefreshSession } from '../lib/supabase';
import type { Session, User, Provider, UserIdentity } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  supabase_auth_id: string;
  display_name: string;
  avatar_url: string | null;
  trust_level: 'new' | 'trusted' | 'moderator' | 'admin' | 'banned';
  twitch_login: string | null;
  discord_username: string | null;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  /** 純 admin（最高權限） */
  isAdmin: boolean;
  /** admin 或 moderator — 可進後台、可審核投稿/活動 */
  canModerate: boolean;
  isBanned: boolean;
  /** 已連結的 OAuth identities（Twitch / Google / Discord） */
  identities: UserIdentity[];
  /** user 啟用 2FA 但 session 仍是 aal1 — App 層應顯示強制 challenge gate */
  mfaRequired: boolean;
  /** 通過 TOTP 升 aal2 後呼叫，清除 mfaRequired + 強制 refresh + 拉 profile */
  onMfaVerified: () => void | Promise<void>;
  /** 重新檢查 aal level（例如手動 refreshSession 後） */
  recheckMfa: () => Promise<void>;
  login: (provider: Provider) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<boolean>;
  /** 把當前 session 加綁一個新 OAuth provider（manual linking）。需 Supabase Dashboard 啟用 manual linking */
  linkIdentity: (provider: Provider) => Promise<void>;
  /** 解除一個已綁定的 OAuth identity；若是最後一個會 throw，呼叫端應改走 deleteAccount */
  unlinkIdentity: (identity: UserIdentity) => Promise<void>;
}

/**
 * 統一認證 hook
 * 支援 Twitch / Google / Discord OAuth 登入
 * 透過 Supabase Auth 管理 session，搭配 user_profiles 表追蹤用戶資訊
 *
 * 注意：此 hook 用於平台認證（發文、檢舉等）
 * 與 useTwitchAuth 不同，後者是 Twitch API 存取（匯入追隨清單）
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mfaRequired, setMfaRequiredState] = useState(false);

  // mfaRequired 同時用 ref 同步，方便 onAuthStateChange callback 在 closure 中讀最新值
  // （callback 用 deps=[]，不能 capture state）
  const mfaRequiredRef = useRef(false);
  const setMfaRequired = useCallback((val: boolean) => {
    mfaRequiredRef.current = val;
    setMfaRequiredState(val);
  }, []);

  // 同步 decode access_token 的 aal claim — 用來在 setUser 之前決定要不要先樂觀
  // 設 mfaRequired=true，避免 OAuth callback 後 user 短暫看到「已登入但沒資料」UI
  const decodeAalSync = (token: string | undefined | null): 'aal1' | 'aal2' => {
    if (!token) return 'aal1';
    try {
      const payload = JSON.parse(
        atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
      );
      return payload?.aal === 'aal2' ? 'aal2' : 'aal1';
    } catch {
      return 'aal1';
    }
  };

  // 從 user_profiles 取得用戶個人資料
  // 錯誤 silent — UI 透過 isLoggedIn / profile === null 表達狀態
  // 注意：必須宣告在 onMfaVerified 之前，避免 useCallback deps array TDZ
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const supabase = await getSupabase();
      if (!supabase) return null;

      const { data } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('supabase_auth_id', userId)
        .single();

      return data as UserProfile | null;
    } catch {
      return null;
    }
  }, []);

  // 檢查當前 session 是否需要強制升 aal2：
  // 用 manualRefreshSession (raw fetch) + token decode + /api/account/totp-status，
  // 完全繞過 supabase.auth.mfa.getAuthenticatorAssuranceLevel —— 該方法依賴
  // supabase-js 內部 user object 的 factors 屬性，OAuth callback 剛完成時尚未
  // hydrate 完整，可能誤判 nextLevel='aal1' 而不彈 gate（實測撞到此問題）。
  //
  // 邏輯：
  //   token aal=aal2 → 不需要 gate
  //   token aal=aal1 + server 看到 enrolled=true → 必須 gate
  //   token aal=aal1 + server 看到 enrolled=false → 不需要（沒啟用 2FA 的 user）
  const checkMfaRequired = useCallback(async (): Promise<boolean> => {
    try {
      const refreshed = await manualRefreshSession();
      if (!refreshed?.access_token) return false;

      // decode aal claim
      let aal = 'aal1';
      try {
        const payload = JSON.parse(
          atob(refreshed.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
        );
        aal = payload?.aal || 'aal1';
      } catch { /* ignore */ }
      if (aal === 'aal2') return false;

      // 用 raw fetch 打 totp-status 看 server 端 enrolled 狀態（用 service_role 查
      // mfa_factors，不受 client SDK race 與 RLS 影響）
      const res = await fetch('/api/account/totp-status', {
        headers: { 'Authorization': `Bearer ${refreshed.access_token}` },
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data?.enrolled === true;
    } catch {
      return false;
    }
  }, []);

  const onMfaVerified = useCallback(async () => {
    // verify 通過 / no_factor 自動 dismiss 後：
    // 1. 先用 manualRefreshSession 拿新 aal2 token + setSession 寫回 cache
    //    （讓 reload 後從 localStorage 讀到的就是 aal2）
    // 2. window.location.reload() 重整頁面
    //
    // 自動 reload 的好處：徹底清掉所有 stale state（race window 內各 component
    // 用 aal1 token 拿不到 RLS 資料的錯誤狀態、supabase.from 卡住的 pending
    // request 等）。reload 後 useAuth init 用 fresh aal2 token 重新拉 profile /
    // favorites，UI 立即正確。
    try {
      const refreshed = await manualRefreshSession();
      if (refreshed) {
        const supabase = await getSupabase();
        if (supabase) {
          await Promise.race([
            supabase.auth.setSession({
              access_token: refreshed.access_token,
              refresh_token: refreshed.refresh_token,
            }),
            new Promise(r => setTimeout(r, 2000)),
          ]).catch(() => undefined);
        }
      }
    } catch { /* ignore — reload 後 useAuth init 會自己再 refresh */ }

    if (typeof window !== 'undefined') {
      window.location.reload();
    } else {
      // SSR 防呆 fallback（理論上不會走到，client component 才用 useAuth）
      setMfaRequired(false);
    }
  }, []);

  const recheckMfa = useCallback(async () => {
    const required = await checkMfaRequired();
    setMfaRequired(required);
  }, [checkMfaRequired]);

  // 建立新用戶的 user_profiles 記錄
  const createProfile = useCallback(async (authUser: User): Promise<UserProfile | null> => {
    try {
      const supabase = await getSupabase();
      if (!supabase) return null;

      const meta = authUser.user_metadata || {};
      const provider = authUser.app_metadata?.provider || '';

      const profileData: Record<string, unknown> = {
        supabase_auth_id: authUser.id,
        display_name: meta.full_name || meta.name || meta.preferred_username || meta.user_name || 'User',
        avatar_url: meta.avatar_url || meta.picture || null,
      };

      // 根據 OAuth provider 填入對應欄位
      if (provider === 'twitch') {
        profileData.twitch_id = meta.provider_id || meta.sub;
        profileData.twitch_login = meta.preferred_username || meta.user_name;
        profileData.twitch_display_name = meta.full_name || meta.name;
        profileData.twitch_avatar_url = meta.avatar_url || meta.picture;
        if (meta.created_at) {
          profileData.twitch_created_at = meta.created_at;
        }
      } else if (provider === 'google') {
        profileData.google_id = meta.provider_id || meta.sub;
        profileData.google_display_name = meta.full_name || meta.name;
        profileData.google_avatar_url = meta.avatar_url || meta.picture;
      } else if (provider === 'discord') {
        profileData.discord_id = meta.provider_id || meta.sub;
        profileData.discord_username = meta.full_name || meta.name || meta.preferred_username;
        profileData.discord_avatar_url = meta.avatar_url || meta.picture;
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .insert(profileData)
        .select()
        .single();

      if (error) return null;
      return data as UserProfile;
    } catch {
      return null;
    }
  }, []);

  // 初始化：取得 session 並監聽變化
  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      const supabase = await getSupabase();
      if (!supabase || !mounted) {
        setIsLoading(false);
        return;
      }

      // 取得當前 session
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (currentSession?.user) {
        // 樂觀預設 mfaRequired：aal1 token 先設 true（避免短暫「已登入但沒資料」UI 錯覺），
        // aal2 token 跳過。後續 checkMfaRequired 會校正（如果 user 沒啟用 2FA，校正回 false）
        const tokenAal = decodeAalSync(currentSession.access_token);
        if (tokenAal === 'aal1') {
          setMfaRequired(true);
        }

        setUser(currentSession.user);
        setSession(currentSession);

        // 確認是否真的需要 mfa challenge（看 user 有無 verified factor）
        const required = mounted ? await checkMfaRequired() : false;
        if (mounted) setMfaRequired(required);

        if (!required) {
          let userProfile = await fetchProfile(currentSession.user.id);
          if (!userProfile && mounted) {
            userProfile = await createProfile(currentSession.user);
          }
          if (mounted) setProfile(userProfile);
        }
      }

      setIsLoading(false);

      // 監聽認證狀態變化
      // 重要：限制 re-check mfaRequired 的事件範圍。INITIAL_SESSION / TOKEN_REFRESHED
      // 發 race 一次回 false 會把 modal 誤關（observed in production：dialog 自動消失）。
      // 只在 SIGNED_IN（新 OAuth login）/ USER_UPDATED（user metadata change）/
      // MFA_CHALLENGE_VERIFIED（verify 成功降 aal2）這三個事件 re-check。
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, newSession) => {
          if (!mounted) return;

          setSession(newSession);
          setUser(newSession?.user ?? null);

          if (newSession?.user) {
            const shouldRecheck =
              event === 'SIGNED_IN' ||
              event === 'USER_UPDATED' ||
              event === 'MFA_CHALLENGE_VERIFIED';

            // 同樣樂觀預設：SIGNED_IN 拿到 aal1 token 立刻設 mfaRequired=true，
            // 避免 await checkMfaRequired() 期間短暫 isLoggedIn=true 但 fetchProfile 撞 RLS
            if (event === 'SIGNED_IN') {
              const tokenAal = decodeAalSync(newSession.access_token);
              if (tokenAal === 'aal1') {
                setMfaRequired(true);
              }
            }

            let needsMfa = mfaRequiredRef.current;
            if (shouldRecheck) {
              needsMfa = await checkMfaRequired();
              if (!mounted) return;
              setMfaRequired(needsMfa);
            }
            // INITIAL_SESSION / TOKEN_REFRESHED 等事件保持當前 mfaRequired 不變

            if (!needsMfa) {
              let userProfile = await fetchProfile(newSession.user.id);
              if (!userProfile && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
                userProfile = await createProfile(newSession.user);
              }
              if (mounted) setProfile(userProfile);
            }
          } else {
            setProfile(null);
            setMfaRequired(false);
          }
        }
      );

      unsubscribe = () => subscription.unsubscribe();
    };

    init();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (provider: Provider) => {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('Supabase not available');

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // OAuth 回到首頁 root，由 useRouter 補上 lang prefix；hash 含 access_token 流程不變
        redirectTo: window.location.origin + '/',
      },
    });

    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    const supabase = await getSupabase();
    if (!supabase) return;

    // 即使 signOut 失敗也清前端狀態（user 體驗上已登出）
    await supabase.auth.signOut().catch(() => undefined);
    setUser(null);
    setProfile(null);
    setSession(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const userProfile = await fetchProfile(user.id);
    setProfile(userProfile);
  }, [user, fetchProfile]);

  const updateDisplayName = useCallback(async (name: string): Promise<boolean> => {
    if (!profile) return false;
    try {
      const supabase = await getSupabase();
      if (!supabase) return false;

      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 50) return false;

      const { error } = await supabase
        .from('user_profiles')
        .update({ display_name: trimmed })
        .eq('id', profile.id);

      if (error) return false;

      setProfile((prev) => prev ? { ...prev, display_name: trimmed } : prev);
      return true;
    } catch {
      return false;
    }
  }, [profile]);

  // 連結新 OAuth provider — Supabase 會跳到 OAuth flow，回來後 onAuthStateChange 觸發 user 更新
  const linkIdentity = useCallback(async (provider: Provider) => {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('Supabase not available');
    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: window.location.origin + '/' },
    });
    if (error) throw error;
  }, []);

  // 解除已綁 OAuth identity — 呼叫端必須先檢查至少剩 2 個 identity；
  // 解除最後一個應改走 deleteAccount 流程（plan PR 4 設計）
  const unlinkIdentity = useCallback(async (identity: UserIdentity) => {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('Supabase not available');
    if (!user || !user.identities || user.identities.length <= 1) {
      throw new Error('Cannot unlink last identity; use deleteAccount instead');
    }
    const { error } = await supabase.auth.unlinkIdentity(identity);
    if (error) throw error;
    // 重新撈 user，identities 陣列會更新
    const { data: { user: refreshed } } = await supabase.auth.getUser();
    if (refreshed) setUser(refreshed);
  }, [user]);

  return {
    user,
    profile,
    session,
    isLoading,
    // 必須通過 MFA 才算 logged in。OAuth 後 user 已 set 但未 verify TOTP 的階段
    // isLoggedIn=false：背景 UI 顯示 logged-out 樣式（不誤 fetchProfile 撞 RLS），
    // MfaLoginGate 蓋上方提供 verify / 備援碼 / 登出三條出路。
    isLoggedIn: !!user && !mfaRequired,
    isAdmin: profile?.trust_level === 'admin',
    canModerate: profile?.trust_level === 'admin' || profile?.trust_level === 'moderator',
    isBanned: profile?.trust_level === 'banned',
    identities: user?.identities ?? [],
    mfaRequired,
    onMfaVerified,
    recheckMfa,
    login,
    logout,
    refreshProfile,
    updateDisplayName,
    linkIdentity,
    unlinkIdentity,
  };
}
