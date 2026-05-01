import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../lib/supabase';
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

  // 從 user_profiles 取得用戶個人資料
  // 錯誤 silent — UI 透過 isLoggedIn / profile === null 表達狀態
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
        setUser(currentSession.user);
        setSession(currentSession);

        // 取得或建立 profile
        let userProfile = await fetchProfile(currentSession.user.id);
        if (!userProfile && mounted) {
          userProfile = await createProfile(currentSession.user);
        }
        if (mounted) setProfile(userProfile);
      }

      setIsLoading(false);

      // 監聽認證狀態變化
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, newSession) => {
          if (!mounted) return;

          setSession(newSession);
          setUser(newSession?.user ?? null);

          if (newSession?.user) {
            let userProfile = await fetchProfile(newSession.user.id);
            if (!userProfile && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
              userProfile = await createProfile(newSession.user);
            }
            if (mounted) setProfile(userProfile);
          } else {
            setProfile(null);
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
    isLoggedIn: !!user,
    isAdmin: profile?.trust_level === 'admin',
    canModerate: profile?.trust_level === 'admin' || profile?.trust_level === 'moderator',
    isBanned: profile?.trust_level === 'banned',
    identities: user?.identities ?? [],
    login,
    logout,
    refreshProfile,
    updateDisplayName,
    linkIdentity,
    unlinkIdentity,
  };
}
