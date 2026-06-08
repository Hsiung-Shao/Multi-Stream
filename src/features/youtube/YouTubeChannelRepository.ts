import { getSupabase } from '../../lib/supabase';

export interface YouTubeChannelData {
  channel_id: string;
  channel_title: string;
  thumbnail_url?: string | null;
  subscriber_count?: number | null;
  view_count?: number | null;
  video_count?: number | null;
  description?: string | null;
  custom_url?: string | null;
  published_at?: string | null;
  last_live_title?: string | null;
  last_live_url?: string | null;
  last_live_at?: string | null;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MEMORY_TTL_MS = 5 * 60 * 1000; // 5 minutes in-memory

// L1 in-memory cache to avoid redundant Supabase round-trips within the same session
const memoryCache = new Map<string, { data: YouTubeChannelData; expiresAt: number }>();

/**
 * Get a cached YouTube channel by channel ID.
 * Checks in-memory cache first, then Supabase.
 */
export async function getCachedChannel(channelId: string): Promise<YouTubeChannelData | null> {
  // L1: in-memory
  const mem = memoryCache.get(channelId);
  if (mem && mem.expiresAt > Date.now()) return mem.data;

  // L2: Supabase
  try {
    const supabase = await getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('youtube_channels')
      .select('*')
      .eq('channel_id', channelId)
      .single();

    if (error || !data) return null;

    // Check if cache is stale
    const fetchedAt = new Date(data.fetched_at).getTime();
    if (Date.now() - fetchedAt > CACHE_TTL_MS) return null;

    const channel = data as YouTubeChannelData;
    memoryCache.set(channelId, { data: channel, expiresAt: Date.now() + MEMORY_TTL_MS });
    return channel;
  } catch {
    return null;
  }
}

/**
 * Upsert a YouTube channel record.
 *
 * 走後端 endpoint `/api/youtube/cache-channel`（service_role 寫入），不再直接打 Supabase。
 * 這是為了 RLS hardening：之後 youtube_channels 將禁止 anon/authenticated 直接 INSERT/UPDATE。
 *
 * 設計（2026-05-13）：cache 的目的是「儲存 channel_id ↔ channel_title 對應」以節省 YouTube
 * Data API quota（後續 user 查同一頻道直接從 Supabase 拿）。前端 youtubeApi 已從 YouTube
 * Data API 拿到 channel_id + channel_title，**直接傳給後端**；後端不會再呼一次 YouTube API
 * (避免雙倍消耗 quota)，只做 sanitize + service_role upsert。
 *
 * Fail-open：寫入失敗不 throw，caller（useStreamStore 用 .catch(() => {})）原本就視為非關鍵。
 */
export async function upsertChannel(channel: YouTubeChannelData): Promise<boolean> {
  // L1: 先用 caller 給的資料更新 in-memory cache，避免本次 session 重複請求
  memoryCache.set(channel.channel_id, { data: channel, expiresAt: Date.now() + MEMORY_TTL_MS });

  try {
    // 後端 endpoint 允許匿名寫入(收集 cache 對所有 user 都有益,
    // 不該因為「未登入」而錯過貢獻)。有 session token 就帶上,沒有也無妨。
    let accessToken: string | null = null;
    try {
      const supabase = await getSupabase();
      if (supabase) {
        const { data: sd } = await supabase.auth.getSession();
        accessToken = sd?.session?.access_token ?? null;
      }
    } catch {
      /* ignore — 視為無 session */
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const res = await fetch('/api/youtube/cache-channel', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        channel_id: channel.channel_id,
        channel_title: channel.channel_title,
      }),
    });

    if (!res.ok) {
      // 不阻塞流程；fire-and-forget 失敗只 warn
      let reason: string | undefined;
      try {
        const body = await res.json();
        reason = body?.reason;
      } catch {
        /* non-JSON */
      }
      console.warn('[youtube cache] backend write failed:', res.status, reason);
      return false;
    }

    // 後端回傳的 channel 是最新 metadata，用它覆寫 in-memory cache
    try {
      const data = await res.json();
      if (data?.ok && data?.channel?.channel_id) {
        memoryCache.set(data.channel.channel_id, {
          data: data.channel as YouTubeChannelData,
          expiresAt: Date.now() + MEMORY_TTL_MS,
        });
      }
    } catch {
      /* response 不是 JSON 也不致命 */
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Search cached YouTube channels by title (for autocomplete).
 */
export async function searchChannels(query: string, limit = 10): Promise<YouTubeChannelData[]> {
  try {
    const supabase = await getSupabase();
    if (!supabase) return [];

    // Escape LIKE wildcard characters
    const escaped = query.replace(/[%_]/g, '\\$&');

    const { data, error } = await supabase
      .from('youtube_channels')
      .select('*')
      .ilike('channel_title', `%${escaped}%`)
      .order('subscriber_count', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error || !data) return [];

    return data as YouTubeChannelData[];
  } catch {
    return [];
  }
}
