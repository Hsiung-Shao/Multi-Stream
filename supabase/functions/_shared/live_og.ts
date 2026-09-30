// live-og：抓頻道 /live 頁判斷「直播中／最近一場待機室」，不耗 YouTube Data API 配額。
// 2026-09-30 使用者裁定：直播狀態以 live-og 為主、RSS 為輔、API 最後（見 rules.ts）。
//
// 偵測規則移植自 functions/lib/youtube-live-og.js（前端端點與 sync-livestreams 共用的那一套），差異：
//   - 回傳 ok：抓取失敗（非 200、逾時、例外）與「確實沒有直播」分開，失敗時不改任何場次
//   - scheduledStart 轉成 ISO 字串
// 只用 Web API（fetch、AbortController、regex），Deno Edge Function 與 vitest 都能直接跑。
//
// 已知成本：/live 頁每頁約 1.5MB，解析是 CPU 大宗（Cloudflare 上單次 8–11ms）；Edge Function 的 CPU 上限 2 秒，
// 所以每輪只查「有直播中或 2 小時內待機室」的頻道，並限制頻道數（見 schedule-light）。

import { isExpired, isScheduleFrame } from './rules.ts';
import type { RosterChannel, StreamRecord, StreamRow } from './types.ts';

const UC_RE = /^UC[a-zA-Z0-9_-]{22}$/;
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

// social bot UA 讓 YouTube 回靜態 meta（og:image 等）；CONSENT cookie 避開同意頁
const SOCIAL_BOT_HEADERS: Record<string, string> = {
  'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+917;',
};
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export interface LiveOgResult {
  /** false＝抓取失敗（不能據此判斷下播） */
  ok: boolean;
  isLive: boolean;
  isUpcoming: boolean;
  videoId: string | null;
  title: string | null;
  /** 待機室的預定時間（ISO） */
  scheduledStart: string | null;
}

const FAILED: LiveOgResult = { ok: false, isLive: false, isUpcoming: false, videoId: null, title: null, scheduledStart: null };
const OFFLINE: LiveOgResult = { ok: true, isLive: false, isUpcoming: false, videoId: null, title: null, scheduledStart: null };

/** videoId 四來源依序：og:image／twitter:image → canonical → og:url → 任何 _live.jpg */
export function extractVideoId(html: string): string | null {
  const metaOg =
    html.match(/<meta\s+(?:property|name|itemprop)=["'](?:og:image|twitter:image|image)["']\s+content=["'](.*?)["']/i) ||
    html.match(/<meta\s+content=["'](.*?)["']\s+(?:property|name|itemprop)=["'](?:og:image|twitter:image|image)["']/i);
  const fromOg = metaOg?.[1].match(/\/vi\/([a-zA-Z0-9_-]{11})\//)?.[1];
  if (fromOg) return fromOg;
  const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["'](.*?)["']/i)?.[1].match(/\/watch\?v=([a-zA-Z0-9_-]{11})/)?.[1];
  if (canonical) return canonical;
  const ogUrl = html.match(/<meta\s+property=["']og:url["']\s+content=["'](.*?)["']/i)?.[1];
  const fromUrl = ogUrl?.includes('watch?v=') ? ogUrl.match(/v=([a-zA-Z0-9_-]{11})/)?.[1] : undefined;
  if (fromUrl) return fromUrl;
  return html.match(/https:\/\/i\.ytimg\.com\/vi\/([a-zA-Z0-9_-]{11})\/(?:maxres|hq)default_live\.jpg/)?.[1] ?? null;
}

export function extractTitle(html: string): string | null {
  const og = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  if (og) return og[1].slice(0, 200);
  const t = html.match(/<title>(.*?)<\/title>/);
  if (t && t[1] && !/^YouTube$/i.test(t[1].trim())) return t[1].replace(/\s*-\s*YouTube\s*$/i, '').slice(0, 200);
  const j = html.match(/"title":"((?:[^"\\]|\\.)+)"/);
  if (j) {
    try {
      return (JSON.parse(`"${j[1]}"`) as string).slice(0, 200);
    } catch {
      return j[1].slice(0, 200);
    }
  }
  return null;
}

/** /live 頁 HTML → videoId、是否待機、預定時間、標題（HEAD 縮圖確認直播由 detectLiveOg 做） */
export function parseLiveOgHtml(html: string): { videoId: string | null; isUpcoming: boolean; scheduledStart: string | null; title: string | null } {
  const videoId = extractVideoId(html);
  if (!videoId) return { videoId: null, isUpcoming: false, scheduledStart: null, title: null };
  // 排程也會有 _live.jpg 縮圖：HTML 標記為 UPCOMING 就不當直播
  const isUpcoming = html.includes('"status":"UPCOMING"') || html.includes('"isUpcoming":true') || /"scheduledStartTime"\s*:\s*"\d+"/.test(html);
  const epoch = html.match(/"scheduledStartTime"\s*:\s*"(\d+)"/)?.[1];
  const scheduledStart = isUpcoming && epoch ? new Date(Number(epoch) * 1000).toISOString() : null;
  return { videoId, isUpcoming, scheduledStart, title: extractTitle(html) };
}

async function fetchWithTimeout(fetchFn: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 偵測一個頻道；抓取失敗回 ok=false */
export async function detectLiveOg(channelId: string, opts: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<LiveOgResult> {
  if (!UC_RE.test(channelId)) return FAILED;
  const fetchFn = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 8000;
  try {
    const res = await fetchWithTimeout(
      fetchFn,
      `https://www.youtube.com/channel/${channelId}/live?ucbcb=1&hl=en&gl=US`,
      { method: 'GET', headers: SOCIAL_BOT_HEADERS, redirect: 'follow' },
      timeoutMs,
    );
    if (!res.ok) {
      await res.text().catch(() => '');
      return FAILED;
    }
    const parsed = parseLiveOgHtml(await res.text());
    if (!parsed.videoId) return OFFLINE;
    if (parsed.isUpcoming) {
      return { ok: true, isLive: false, isUpcoming: true, videoId: parsed.videoId, title: parsed.title, scheduledStart: parsed.scheduledStart };
    }
    // _live.jpg 只有正在直播時才存在：200＝直播中；HEAD 失敗視同非直播（頁面已成功抓到，不算抓取失敗）
    let live = false;
    try {
      const img = await fetchWithTimeout(fetchFn, `https://i.ytimg.com/vi/${parsed.videoId}/hqdefault_live.jpg`, { method: 'HEAD', headers: { 'User-Agent': BROWSER_UA } }, timeoutMs);
      live = img.status === 200;
    } catch {
      live = false;
    }
    return live
      ? { ok: true, isLive: true, isUpcoming: false, videoId: parsed.videoId, title: parsed.title, scheduledStart: null }
      : OFFLINE;
  } catch {
    return FAILED;
  }
}

export interface LiveOgApply {
  /** 既有場次（含 id）的新狀態 */
  changed: StreamRecord[];
  /** 資料庫還沒有的場次（直播中或待機室，RSS 還沒掃到） */
  created: StreamRow[];
  live: number;
  upcoming: number;
  ended: number;
  expired: number;
}

const ACTIVE = new Set(['scheduled', 'live']);

/**
 * 一個頻道的 live-og 結果 → 場次變化（純函式）。
 *   - 抓取失敗：不動。
 *   - 直播中 V：V 設為 live（沒有就新增）；同頻道其他 live 場次 → ended。
 *   - 待機 V：V 設為 scheduled 並更新預定時間（改期）；同頻道 live 的 → ended。
 *   - 沒有直播也沒有待機：同頻道 live 的 → ended。
 *   - 同頻道其他 scheduled 場次照既有規則過期（排定時間過後 3 小時）。
 * current：這個頻道目前 scheduled／live 的場次；known：V 在資料庫裡的列（任何狀態），沒有就 undefined。
 */
export function applyLiveOg(
  channel: Pick<RosterChannel, 'channelId' | 'vtuberId'>,
  result: LiveOgResult,
  current: readonly StreamRecord[],
  known: StreamRecord | undefined,
  now: number,
): LiveOgApply {
  const out: LiveOgApply = { changed: [], created: [], live: 0, upcoming: 0, ended: 0, expired: 0 };
  if (!result.ok) return out;
  const nowIso = new Date(now).toISOString();
  const target = result.videoId && VIDEO_ID_RE.test(result.videoId) ? result.videoId : null;
  const isLive = !!target && result.isLive;
  const isUpcoming = !!target && result.isUpcoming;

  if (target && (isLive || isUpcoming)) {
    const row = current.find((s) => s.external_id === target) ?? known;
    const frame = isUpcoming ? isScheduleFrame(result.scheduledStart, now) : false;
    const thumb = isLive ? `https://i.ytimg.com/vi/${target}/hqdefault_live.jpg` : `https://i.ytimg.com/vi/${target}/hqdefault.jpg`;
    if (row) {
      out.changed.push({
        ...row,
        status: isLive ? 'live' : 'scheduled',
        scheduled_start: isUpcoming ? (result.scheduledStart ?? row.scheduled_start) : row.scheduled_start,
        actual_start: isLive ? (row.actual_start ?? nowIso) : row.actual_start,
        actual_end: null,
        title: result.title ?? row.title,
        thumbnail_url: row.thumbnail_url ?? thumb,
        viewer_count: null,
        is_schedule_frame: frame,
        fetched_at: nowIso,
      });
    } else {
      out.created.push({
        vtuber_id: channel.vtuberId,
        channel_id: channel.channelId,
        platform: 'youtube',
        external_id: target,
        source: 'yt_waiting_room',
        status: isLive ? 'live' : 'scheduled',
        scheduled_start: isUpcoming ? result.scheduledStart : null,
        scheduled_end: null,
        actual_start: isLive ? nowIso : null,
        actual_end: null,
        title: result.title,
        category: null,
        thumbnail_url: thumb,
        viewer_count: null,
        is_schedule_frame: frame,
        fetched_at: nowIso,
      });
    }
    if (isLive) out.live += 1;
    else out.upcoming += 1;
  }

  for (const s of current) {
    if (s.external_id === target || !ACTIVE.has(s.status)) continue;
    if (s.status === 'live') {
      out.changed.push({ ...s, status: 'ended', actual_end: nowIso, viewer_count: null, fetched_at: nowIso });
      out.ended += 1;
    } else if (isExpired(s, now)) {
      out.changed.push({ ...s, status: 'expired', fetched_at: nowIso });
      out.expired += 1;
    }
  }
  return out;
}
