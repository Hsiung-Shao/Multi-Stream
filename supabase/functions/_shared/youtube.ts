// YouTube Data API v3：只剩 videos.list（每次呼叫 1 單位，最多 50 支）。資料來源優先序是 live-og > RSS > API（見 rules.ts），
// 所以 API 只查 RSS 新發現影片的待機室時間；呼叫次數有上限（maxCalls，由 run.ts 依每輪上限與每日剩餘額度決定）。
// 伺服器端呼叫一律帶 Referer（金鑰有 HTTP referer 限制，缺了回 403）。

import type { YouTubeVideoFacts } from './rules.ts';

export interface YouTubeClientOptions {
  apiKey: string;
  referer: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** 這次執行最多可呼叫幾次（預設不限；run.ts 會依每輪上限與每日剩餘額度設定） */
  maxCalls?: number;
}

/** 超過呼叫上限：呼叫端應先用 remainingVideos() 切好，這個錯誤只是保險 */
export class QuotaBudgetError extends Error {
  constructor() {
    super('youtube quota budget exhausted');
    this.name = 'QuotaBudgetError';
  }
}

export interface YouTubeVideo {
  id: string;
  channelId: string | null;
  title: string | null;
  thumbnailUrl: string | null;
  facts: YouTubeVideoFacts;
  concurrentViewers: number | null;
}

export interface QuotaCounter {
  videosList: number;
  units(): number;
}

export function createQuotaCounter(): QuotaCounter {
  return {
    videosList: 0,
    units() {
      return this.videosList;
    },
  };
}

interface RawVideo {
  id: string;
  snippet?: {
    channelId?: string;
    title?: string;
    liveBroadcastContent?: string;
    thumbnails?: Record<string, { url?: string }>;
  };
  liveStreamingDetails?: {
    scheduledStartTime?: string;
    actualStartTime?: string;
    actualEndTime?: string;
    concurrentViewers?: string;
  };
}

/** API 的 items → 內部表示；呼叫端可直接測這段對應 */
export function toYouTubeVideo(item: RawVideo): YouTubeVideo {
  const sn = item.snippet ?? {};
  const ld = item.liveStreamingDetails;
  const th = sn.thumbnails ?? {};
  const viewers = ld?.concurrentViewers != null ? Number(ld.concurrentViewers) : null;
  return {
    id: item.id,
    channelId: sn.channelId ?? null,
    title: sn.title ? sn.title.slice(0, 300) : null,
    thumbnailUrl: th.maxres?.url ?? th.high?.url ?? th.medium?.url ?? th.default?.url ?? null,
    facts: {
      liveBroadcastContent: sn.liveBroadcastContent ?? 'none',
      scheduledStartTime: ld?.scheduledStartTime ?? null,
      actualStartTime: ld?.actualStartTime ?? null,
      actualEndTime: ld?.actualEndTime ?? null,
      hasLiveStreamingDetails: !!ld,
    },
    concurrentViewers: viewers != null && Number.isFinite(viewers) ? viewers : null,
  };
}

export class YouTubeClient {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  readonly quota = createQuotaCounter();
  /** YouTube 回了 quotaExceeded：當日配額已用完（run.ts 會把每日用量記成上限，整天不再打） */
  quotaExceeded = false;
  private readonly opts: YouTubeClientOptions;

  constructor(opts: YouTubeClientOptions) {
    this.opts = opts;
    this.fetchFn = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10000;
  }

  /** 這次執行還能查幾支影片（剩餘呼叫次數 × 50） */
  remainingVideos(): number {
    const max = this.opts.maxCalls ?? Infinity;
    return Math.max(0, max - this.quota.videosList) * 50;
  }

  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    const qs = new URLSearchParams({ ...params, key: this.opts.apiKey });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(`https://www.googleapis.com/youtube/v3/${path}?${qs}`, {
        headers: { Referer: this.opts.referer },
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok && text.includes('quotaExceeded')) this.quotaExceeded = true;
      if (!res.ok) throw new Error(`youtube ${path} HTTP ${res.status}: ${text.slice(0, 300)}`);
      return JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * videos.list：ids 會自動切成每批 50 支。回傳 Map(id → video)；API 沒回的 id 就是查不到（tombstone）。
   */
  async listVideos(ids: readonly string[]): Promise<Map<string, YouTubeVideo>> {
    const out = new Map<string, YouTubeVideo>();
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += 50) {
      const batch = unique.slice(i, i + 50);
      if (this.quota.videosList >= (this.opts.maxCalls ?? Infinity)) throw new QuotaBudgetError();
      // 先計數：失敗的請求 YouTube 一樣扣配額
      this.quota.videosList += 1;
      // fields 只留用得到的欄位：預設回應含 description 與五種縮圖，50 支可達數百 KB，
      // JSON.parse 的 CPU 時間在 Edge Function 是硬上限（本地 hard 2s）
      const data = (await this.get('videos', {
        part: 'snippet,liveStreamingDetails',
        id: batch.join(','),
        maxResults: '50',
        fields: 'items(id,snippet(channelId,title,liveBroadcastContent,thumbnails(high(url),default(url))),liveStreamingDetails)',
      })) as { items?: RawVideo[] };
      for (const item of data.items ?? []) out.set(item.id, toYouTubeVideo(item));
    }
    return out;
  }
}
