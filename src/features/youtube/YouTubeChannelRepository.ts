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
 * 記住本次 session 查到的頻道名稱（只寫記憶體快取）。
 *
 * 2026-11-27 起不再 POST 到 /api/youtube/cache-channel（匿名可覆寫任意頻道名，已刪除）：
 * 共用的 youtube_channels 改由伺服器端點自己寫入伺服器查到的名稱（/api/youtube/lookup、
 * /api/youtube-channel-page、cron 全表刷新）。
 */
export async function upsertChannel(channel: YouTubeChannelData): Promise<boolean> {
  memoryCache.set(channel.channel_id, { data: channel, expiresAt: Date.now() + MEMORY_TTL_MS });
  return true;
}
