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

const CHANNEL_ID_REGEX = /^UC[A-Za-z0-9_-]{22}$/;

// 本 session 內已確認蒐集(DB 命中或寫入成功）的 channelId。
// 直播檢查會每 5 分鐘對所有 YT 收藏重跑，靠這個 set 短路掉重複的 getCachedChannel 往返。
const collectedChannelIds = new Set<string>();

/**
 * 蒐集用:把 channel_id ↔ channel_title 寫進離線資料庫，但「寫入前先查 DB」避免重複 POST。
 *
 * 給「新增收藏」「直播狀態查詢」兩條蒐集路徑共用。fire-and-forget：
 * - channelId 不是合法 YT 格式 / 沒有 title → 直接略過
 * - 本 session 已蒐集過 → 直接略過（不再查 DB）
 * - getCachedChannel 命中(且未過期）→ 不重複寫入
 * - 任何錯誤都吞掉，絕不阻塞呼叫端主流程（失敗不記入 set，保留下次重試）
 */
export async function cacheChannelIfAbsent(
  channelId: string | null | undefined,
  channelTitle: string | null | undefined,
): Promise<void> {
  if (!channelId || !CHANNEL_ID_REGEX.test(channelId)) return;
  if (collectedChannelIds.has(channelId)) return;
  const title = (channelTitle ?? '').trim();
  if (!title) return;

  try {
    // 查 DB（L1 memoryCache → L2 Supabase；>24h stale 會回 null 而觸發刷新）
    if (await getCachedChannel(channelId)) {
      collectedChannelIds.add(channelId);
      return;
    }
    await upsertChannel({ channel_id: channelId, channel_title: title });
    collectedChannelIds.add(channelId);
  } catch {
    /* fire-and-forget：蒐集失敗不影響呼叫端 */
  }
}
