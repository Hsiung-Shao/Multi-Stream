// live-og：抓頻道 /live 頁判斷「直播中／最近一場待機室」，不耗 YouTube Data API 配額。
// 2026-09-30 使用者裁定：直播狀態以 live-og 為主、RSS 為輔、API 最後（見 rules.ts）。
//
// 偵測規則移植自 functions/lib/youtube-live-og.js（前端端點與 sync-livestreams 共用的那一套），差異（code review 後）：
//   - 回傳 ok：抓取失敗與「確實沒有直播」分開，失敗時不改任何場次
//   - 頁面必須是這個頻道自己的（網址在 youtube.com、內容含自己的頻道 ID），否則當抓取失敗（同意頁、sorry 頁、限流頁）
//   - 確認直播的 HEAD 只有明確 404 才算沒在直播；其他狀態與例外當抓取失敗
//   - 不用「頁面上任何 _live.jpg」找 videoId（頻道頁會混到別人的直播）
//   - 標題正確處理引號與 HTML entity
// 只用 Web API（fetch、AbortController、regex），Deno Edge Function 與 vitest 都能直接跑。
//
// 已知成本：/live 頁每頁約 1.5MB，解析是 CPU 大宗；Edge Function 的 CPU 上限 2 秒，所以每輪限制頻道數（見 schedule-light）。

import { EXPIRE_AFTER_HOURS, isScheduleFrame } from './rules.ts';
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
  /** false＝抓取失敗或頁面不可信（不能據此判斷下播） */
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

/** 屬性值：支援單雙引號（雙引號內可以有 '，反之亦然） */
const attr = (html: string, re: RegExp): string | null => {
  const m = html.match(re);
  return m ? (m[2] ?? null) : null;
};

/** videoId 三來源依序：og:image／twitter:image → canonical → og:url */
export function extractVideoId(html: string): string | null {
  const img =
    attr(html, /<meta\s+(?:property|name|itemprop)=["'](?:og:image|twitter:image|image)["']\s+content=(["'])(.*?)\1/i) ??
    attr(html, /<meta\s+content=(["'])(.*?)\1\s+(?:property|name|itemprop)=["'](?:og:image|twitter:image|image)["']/i);
  const fromOg = img?.match(/\/vi\/([a-zA-Z0-9_-]{11})\//)?.[1];
  if (fromOg) return fromOg;
  const canonical = attr(html, /<link\s+rel=["']canonical["']\s+href=(["'])(.*?)\1/i)?.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/)?.[1];
  if (canonical) return canonical;
  const ogUrl = attr(html, /<meta\s+property=["']og:url["']\s+content=(["'])(.*?)\1/i);
  return ogUrl?.includes('watch?v=') ? (ogUrl.match(/v=([a-zA-Z0-9_-]{11})/)?.[1] ?? null) : null;
}

/** 常見 HTML entity；&amp; 放最後避免二次解碼 */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function extractTitle(html: string): string | null {
  const og =
    attr(html, /<meta\s+property=["']og:title["']\s+content=(["'])(.*?)\1/i) ?? attr(html, /<meta\s+content=(["'])(.*?)\1\s+property=["']og:title["']/i);
  if (og) return decodeHtmlEntities(og).slice(0, 200) || null;
  const t = html.match(/<title>(.*?)<\/title>/)?.[1];
  if (t && !/^YouTube$/i.test(t.trim())) return decodeHtmlEntities(t.replace(/\s*-\s*YouTube\s*$/i, '')).slice(0, 200);
  return null;
}

/** /live 頁 HTML → videoId、是否待機、預定時間、標題（HEAD 縮圖確認直播由 detectLiveOg 做） */
export function parseLiveOgHtml(html: string): { videoId: string | null; isUpcoming: boolean; scheduledStart: string | null; title: string | null } {
  const videoId = extractVideoId(html);
  if (!videoId) return { videoId: null, isUpcoming: false, scheduledStart: null, title: null };
  // 排程也會有 _live.jpg 縮圖：HTML 標記為 UPCOMING 就不當直播。
  // 只看這支影片的 ytInitialPlayerResponse（實測在頁面約 1.1MB 處、長約 10KB），推薦影片等其他區段的標記不算
  const player = playerResponseOf(html);
  const isUpcoming = player.includes('"status":"UPCOMING"') || player.includes('"isUpcoming":true') || /"scheduledStartTime"\s*:\s*"\d+"/.test(player);
  const epoch = player.match(/"scheduledStartTime"\s*:\s*"(\d+)"/)?.[1];
  const scheduledStart = isUpcoming && epoch ? new Date(Number(epoch) * 1000).toISOString() : null;
  return { videoId, isUpcoming, scheduledStart, title: extractTitle(html) };
}

/** ytInitialPlayerResponse 所在的 <script> 區段；找不到（測試片段、改版）就用整頁 */
export function playerResponseOf(html: string): string {
  const start = html.indexOf('ytInitialPlayerResponse');
  if (start < 0) return html;
  const end = html.indexOf('</script>', start);
  return html.slice(start, end < 0 ? undefined : end);
}

/** GET 並讀完內容，整段都在逾時內（只等到標頭的話，內容傳到一半卡住會讓整輪等到牆鐘上限） */
async function fetchTextWithTimeout(fetchFn: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<{ res: Response; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { ...init, signal: controller.signal });
    return { res, text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
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

/** 偵測一個頻道；抓取失敗、頁面不是這個頻道的、縮圖確認失敗都回 ok=false */
export async function detectLiveOg(channelId: string, opts: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<LiveOgResult> {
  if (!UC_RE.test(channelId)) return FAILED;
  const fetchFn = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 8000;
  try {
    const { res, text: html } = await fetchTextWithTimeout(
      fetchFn,
      `https://www.youtube.com/channel/${channelId}/live?ucbcb=1&hl=en&gl=US`,
      { method: 'GET', headers: SOCIAL_BOT_HEADERS, redirect: 'follow' },
      timeoutMs,
    );
    if (!res.ok) return FAILED;
    // 被導到同意頁（consent.youtube.com）等別的網域：不可信
    if (res.url && !/^https:\/\/(?:www\.|m\.)?youtube\.com\//.test(res.url)) return FAILED;
    // 頁面要提到自己的頻道 ID（直播頁的 videoDetails、頻道頁的 externalId／canonical 都會有）；
    // 限流頁、sorry 頁回 200 但沒有，不能當成「沒有直播」
    if (!html.includes(channelId)) return FAILED;
    const parsed = parseLiveOgHtml(html);
    if (!parsed.videoId) return OFFLINE;
    if (parsed.isUpcoming) {
      return { ok: true, isLive: false, isUpcoming: true, videoId: parsed.videoId, title: parsed.title, scheduledStart: parsed.scheduledStart };
    }
    // _live.jpg 只有正在直播時才存在：200＝直播中、404＝沒在直播；其他狀態或例外不可判斷
    const img = await fetchWithTimeout(
      fetchFn,
      `https://i.ytimg.com/vi/${parsed.videoId}/hqdefault_live.jpg`,
      { method: 'HEAD', headers: { 'User-Agent': BROWSER_UA } },
      timeoutMs,
    );
    if (img.status === 200) return { ok: true, isLive: true, isUpcoming: false, videoId: parsed.videoId, title: parsed.title, scheduledStart: null };
    if (img.status === 404) return OFFLINE;
    return FAILED;
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
  /** 需要結束、但呼叫端還不允許（下播要連續兩輪確認）的直播場次數 */
  endPending: number;
  /** 頁面指向別的頻道的影片：整個頻道這輪不動 */
  foreign: boolean;
}

/**
 * 一個頻道的 live-og 結果 → 場次變化（純函式）。
 *   - 抓取失敗：不動。
 *   - 影片在資料庫屬於別的頻道：不動（foreign）。
 *   - 直播中 V：V 設為 live（沒有就新增）；同頻道其他 live 場次視為下播。
 *   - 待機 V：V 設為 scheduled 並更新預定時間（改期）；已經開播或結束過的影片不改回待機；
 *     資料庫沒有、又沒有預定時間的不新增（交給 API 分類）。同頻道 live 的視為下播。
 *   - 沒有直播也沒有待機：同頻道 live 的視為下播。
 *   - 下播只有 allowEnd 時才改成 ended（呼叫端要求連續兩輪確認），否則記在 endPending。
 *   過期（排定時間過後 3 小時）改由資料庫端每輪統一處理（expireOverdue），不在這裡。
 */
export function applyLiveOg(
  channel: Pick<RosterChannel, 'channelId' | 'vtuberId'>,
  result: LiveOgResult,
  current: readonly StreamRecord[],
  known: StreamRecord | undefined,
  now: number,
  opts: { allowEnd: boolean } = { allowEnd: true },
): LiveOgApply {
  const out: LiveOgApply = { changed: [], created: [], live: 0, upcoming: 0, ended: 0, endPending: 0, foreign: false };
  if (!result.ok) return out;
  if (known && known.channel_id !== channel.channelId) {
    out.foreign = true;
    return out;
  }
  const nowIso = new Date(now).toISOString();
  const target = result.videoId && VIDEO_ID_RE.test(result.videoId) ? result.videoId : null;
  const isLive = !!target && result.isLive;
  const isUpcoming = !!target && result.isUpcoming;

  if (target && (isLive || isUpcoming)) {
    const row = current.find((s) => s.external_id === target) ?? known;
    const thumb = isLive ? `https://i.ytimg.com/vi/${target}/hqdefault_live.jpg` : `https://i.ytimg.com/vi/${target}/hqdefault.jpg`;
    if (row) {
      // 已開播或結束過的不改回待機；已過期／取消的，除非頁面給了還沒過期的新時間（否則每輪會在 expired 與 scheduled 之間來回）
      const staleRevive =
        isUpcoming &&
        (row.status === 'expired' || row.status === 'canceled') &&
        !(result.scheduledStart && Date.parse(result.scheduledStart) >= now - EXPIRE_AFTER_HOURS * 3_600_000);
      const revertToUpcoming = (isUpcoming && (row.actual_start || row.actual_end)) || staleRevive;
      if (!revertToUpcoming) {
        const scheduled = isUpcoming ? (result.scheduledStart ?? row.scheduled_start) : row.scheduled_start;
        out.changed.push({
          ...row,
          status: isLive ? 'live' : 'scheduled',
          scheduled_start: scheduled,
          actual_start: isLive ? (row.actual_start ?? nowIso) : row.actual_start,
          actual_end: null,
          // API 的標題為準，live-og 只補空值
          title: row.title ?? result.title,
          thumbnail_url: row.thumbnail_url ?? thumb,
          viewer_count: null,
          is_schedule_frame: isUpcoming ? isScheduleFrame(scheduled, now) : false,
          fetched_at: nowIso,
        });
        if (isLive) out.live += 1;
        else out.upcoming += 1;
      }
    } else if (isLive || result.scheduledStart) {
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
        is_schedule_frame: isUpcoming ? isScheduleFrame(result.scheduledStart, now) : false,
        fetched_at: nowIso,
      });
      if (isLive) out.live += 1;
      else out.upcoming += 1;
    }
  }

  for (const s of current) {
    if (s.external_id === target || s.status !== 'live') continue;
    if (!opts.allowEnd) {
      out.endPending += 1;
      continue;
    }
    out.changed.push({ ...s, status: 'ended', actual_end: nowIso, viewer_count: null, fetched_at: nowIso });
    out.ended += 1;
  }
  return out;
}
