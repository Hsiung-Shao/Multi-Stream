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
 * Uses ON CONFLICT on channel_id to update existing records.
 * Also updates the in-memory cache.
 */
export async function upsertChannel(channel: YouTubeChannelData): Promise<boolean> {
  // Update in-memory cache immediately
  memoryCache.set(channel.channel_id, { data: channel, expiresAt: Date.now() + MEMORY_TTL_MS });

  try {
    const supabase = await getSupabase();
    if (!supabase) return false;

    const { error } = await supabase
      .from('youtube_channels')
      .upsert(
        {
          ...channel,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'channel_id' }
      );

    if (error) {
      console.warn('Failed to upsert YouTube channel:', error.message);
      return false;
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
