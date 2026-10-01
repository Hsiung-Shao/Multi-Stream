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
// 已知成本：/live 頁每頁約 1.5MB。2026-10-01 起串流讀取、只解析需要的兩小段（readLiveOgPage）；
// Edge Function 的 CPU 上限 2 秒，每輪仍限制頻道數（見 schedule-light）。

import { EXPIRE_AFTER_HOURS, isScheduleFrame } from './rules.ts';
import { detachString } from './strings.ts';
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
  /** ok=false 的原因（統計用）：bad_id／http_<狀態碼>／foreign_url／no_channel_id／thumb_<狀態碼>／error_<例外名稱>（AbortError＝逾時） */
  failReason?: string;
  /** 這次是退回整頁比對（YouTube 改版的徵兆；ogSweep 用來限制整輪成本） */
  fullPage?: boolean;
  isLive: boolean;
  isUpcoming: boolean;
  videoId: string | null;
  title: string | null;
  /** 待機室的預定時間（ISO） */
  scheduledStart: string | null;
}

const FAILED: LiveOgResult = { ok: false, isLive: false, isUpcoming: false, videoId: null, title: null, scheduledStart: null };
const failed = (failReason: string): LiveOgResult => ({ ...FAILED, failReason });
/** 例外名稱：逾時的 DOMException 在部分環境不是 Error 的實例，直接讀 name */
const errorName = (e: unknown): string => (typeof (e as { name?: unknown })?.name === 'string' ? (e as { name: string }).name : 'unknown');
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

// ── 頁面讀取：只讀需要的部分（移植自 functions/lib/live-og-page.js，2026-10-01） ──────────────────────
// /live 頁約 1.5～1.8MB，需要的資料位置固定：
//   - 頭 5KB：<title>、canonical、og:image／og:title／og:url
//   - 直播／待機（watch 頁）：`ytInitialPlayerResponse = {` 在約 1.1MB 處，"videoDetails"、"isUpcoming"、
//     "scheduledStartTime"、頻道 ID 都在同一個 <script> 內（長約 13～18KB）
//   - 離線（頻道頁）：頭 5KB 就決定了，後面用不到
// 串流讀取：頻道頁讀完頭 64KB 就取消下載；watch 頁讀到 playerResponse 的 </script> 就取消；regex 只在這兩段跑。
// 原本整頁讀完再整頁比對，CPU 與記憶體都花在用不到的 1MB 上（每輪 og 頻道數因此卡在 60）。
// 結構和預期不同時一律保守退回「讀完整頁、整頁比對」：前 64KB 沒有 canonical，或找到的區段沒有 "videoDetails"。

export const HEAD_CHARS = 64 * 1024;
// 只認「定義」的寫法；頁面後段還有 ytInitialPlayerResponse'] 之類的引用
const PLAYER_MARK = 'ytInitialPlayerResponse = {';
const PLAYER_CHECK = '"videoDetails"';
const SCRIPT_END = '</script>';
const CARRY = Math.max(PLAYER_MARK.length, SCRIPT_END.length) - 1;

export interface LiveOgPage {
  /** 頁面前 HEAD_CHARS 字元 */
  head: string;
  /** playerResponse 所在的 <script> 區段；頻道頁是空字串；結構不符時是整頁 */
  player: string;
  videoId: string | null;
  /** 是否讀完整頁（提早取消為 false） */
  complete: boolean;
  /** 結構不符、退回整頁比對（讀完整頁）：呼叫端用來限制這一輪的成本 */
  fullPage: boolean;
}

/** 前段沒有影片、而且有 canonical（頻道網址）＝可以確定是頻道頁 */
const isChannelPage = (head: string, videoId: string | null) => !videoId && /<link\s+rel=["']canonical["']/i.test(head);

/**
 * 已有完整 HTML 時切出同樣的區段；規則與 readLiveOgPage 相同。
 * channelId 有給時，頻道頁的頁首要含這個 ID 才算（不然整頁比對：YouTube 若把 canonical 改成 @handle，ID 只在後段）。
 */
export function pageFromText(html: string, complete = true, channelId?: string): LiveOgPage {
  const head = html.slice(0, HEAD_CHARS);
  const headId = extractVideoId(head);
  if (isChannelPage(head, headId) && (!channelId || head.includes(channelId))) return { head, player: '', videoId: null, complete, fullPage: false };
  // 前段沒有 canonical 時（結構和預期不同）videoId 改在整頁找
  const videoId = headId ?? extractVideoId(html);
  const at = html.indexOf(PLAYER_MARK);
  const end = at >= 0 ? html.indexOf(SCRIPT_END, at) : -1;
  const player = at >= 0 ? html.slice(at, end >= 0 ? end : undefined) : '';
  if (videoId && at >= 0 && player.includes(PLAYER_CHECK)) return { head, player, videoId, complete, fullPage: false };
  return { head, player: looseSection(html), videoId, complete, fullPage: true };
}

/**
 * 結構不符時的區段：沿用改版前的寬鬆找法（任何 ytInitialPlayerResponse 到 </script>），找不到才用整頁。
 * 直接用整頁的話，推薦影片的待機標記會讓直播被判成待機（週表會漏記開播）。
 */
function looseSection(html: string): string {
  const start = html.indexOf('ytInitialPlayerResponse');
  if (start < 0) return html;
  const end = html.indexOf(SCRIPT_END, start);
  return html.slice(start, end < 0 ? undefined : end);
}

/** 從分段字串取 [from, to)：只接起涵蓋的那幾段 */
function sliceParts(parts: string[], starts: number[], from: number, to: number): string {
  let k = starts.length - 1;
  while (k > 0 && starts[k] > from) k -= 1;
  let last = k;
  while (last < starts.length - 1 && starts[last + 1] < to) last += 1;
  return parts.slice(k, last + 1).join('').slice(from - starts[k], to - starts[k]);
}

/** 串流讀取 /live 頁（逾時由呼叫端的 AbortSignal 控制）；channelId 見 pageFromText */
export async function readLiveOgPage(response: Response, channelId?: string): Promise<LiveOgPage> {
  const body = response.body;
  if (!body) return pageFromText(await response.text(), true, channelId);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  const starts: number[] = [];
  let length = 0;
  let head: string | null = null;
  let videoId: string | null = null;
  let channelPage = false;
  let playerAt = -1;
  let playerEnd = -1;
  let playerBad = false; // 找到的區段不是真正的定義 → 讀完整頁、整頁比對
  let carry = '';
  let complete = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      const piece = done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (piece) {
        const windowStart = length - carry.length;
        starts.push(length);
        parts.push(piece);
        length += piece.length;
        // 只在「上一段尾巴＋這一段」裡找標記，避免對越來越長的字串反覆 indexOf
        const win = carry + piece;
        if (playerAt < 0) {
          const i = win.indexOf(PLAYER_MARK);
          if (i >= 0) playerAt = windowStart + i;
        }
        if (playerAt >= 0 && playerEnd < 0) {
          const j = win.indexOf(SCRIPT_END, Math.max(0, playerAt - windowStart));
          if (j >= 0) {
            playerEnd = windowStart + j;
            if (!sliceParts(parts, starts, playerAt, playerEnd).includes(PLAYER_CHECK)) playerBad = true;
          }
        }
        carry = win.slice(-CARRY);
      }
      if (head === null && (length >= HEAD_CHARS || done)) {
        head = parts.join('').slice(0, HEAD_CHARS);
        videoId = extractVideoId(head);
        channelPage = isChannelPage(head, videoId) && (!channelId || head.includes(channelId));
      }
      if (done) {
        complete = true;
        break;
      }
      if (head === null || playerBad) continue;
      // 頻道頁：後面用不到；watch 頁：讀到 playerResponse 區段結尾就夠了
      if (channelPage || (videoId && playerEnd >= 0)) break;
    }
  } finally {
    if (!complete) reader.cancel().catch(() => {});
  }
  if (channelPage) return { head: head!, player: '', videoId: null, complete, fullPage: false };
  if (!videoId || playerAt < 0 || playerBad) {
    const page = pageFromText(parts.join(''), complete, channelId);
    return head === null ? page : { ...page, head };
  }
  return { head: head!, player: sliceParts(parts, starts, playerAt, playerEnd >= 0 ? playerEnd : length), videoId, complete, fullPage: false };
}

/** 讀到的頁面 → videoId、是否待機、預定時間、標題（HEAD 縮圖確認直播由 detectLiveOg 做） */
export function parseLiveOgPage(page: LiveOgPage): { videoId: string | null; isUpcoming: boolean; scheduledStart: string | null; title: string | null } {
  const { videoId, player } = page;
  if (!videoId) return { videoId: null, isUpcoming: false, scheduledStart: null, title: null };
  // 排程也會有 _live.jpg 縮圖：這支影片的 playerResponse 標記為 UPCOMING 就不當直播（推薦影片等其他區段的標記不算）
  const isUpcoming = player.includes('"status":"UPCOMING"') || player.includes('"isUpcoming":true') || /"scheduledStartTime"\s*:\s*"\d+"/.test(player);
  const epoch = player.match(/"scheduledStartTime"\s*:\s*"(\d+)"/)?.[1];
  const scheduledStart = isUpcoming && epoch ? new Date(Number(epoch) * 1000).toISOString() : null;
  // 標題在頁首（結構不符退回整頁時 player 才是整頁）。切片不複製會留住來源字串（strings.ts）
  return { videoId, isUpcoming, scheduledStart, title: detachString(extractTitle(page.head) ?? extractTitle(player)) };
}

/** 整頁 HTML 版（測試、沒有串流的情境）；規則與串流版相同 */
export function parseLiveOgHtml(html: string): { videoId: string | null; isUpcoming: boolean; scheduledStart: string | null; title: string | null } {
  return parseLiveOgPage(pageFromText(html));
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
  if (!UC_RE.test(channelId)) return failed('bad_id');
  const fetchFn = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // 抓頁面並串流讀取；回傳頁面，或失敗結果（狀態碼、被導到別的網域）
    const load = async (): Promise<LiveOgPage | LiveOgResult> => {
      const res = await fetchFn(`https://www.youtube.com/channel/${channelId}/live?ucbcb=1&hl=en&gl=US`, {
        method: 'GET',
        headers: SOCIAL_BOT_HEADERS,
        redirect: 'follow',
        signal: controller.signal,
      });
      // 失敗或被導到同意頁（consent.youtube.com）等別的網域：不可信，也不必讀內容
      if (!res.ok || (res.url && !/^https:\/\/(?:www\.|m\.)?youtube\.com\//.test(res.url))) {
        res.body?.cancel().catch(() => {});
        return failed(res.ok ? 'foreign_url' : `http_${res.status}`);
      }
      // 讀取也在逾時內：只等到標頭的話，內容傳到一半卡住會讓整輪等到牆鐘上限
      return readLiveOgPage(res, channelId);
    };
    let loaded: LiveOgPage | LiveOgResult;
    try {
      try {
        loaded = await load();
      } catch (e) {
        // 串流讀取會提早取消下載；Deno 重用到這種連線時偶爾回「error sending request」（2026-10-01 本地實測 og 150 個約 4%）。
        // 連線層的錯誤重試一次（新連線），逾時與其他錯誤不重試
        if (!(e instanceof TypeError) || !/error sending request/i.test(e.message) || controller.signal.aborted) throw e;
        loaded = await load();
      }
    } finally {
      clearTimeout(timer);
    }
    if (!('head' in loaded)) return loaded;
    const page = loaded;
    // 頁面要提到自己的頻道 ID（頻道頁的 canonical／externalId 在頁首，直播頁在 playerResponse 的 videoDetails）；
    // 限流頁、sorry 頁回 200 但沒有，不能當成「沒有直播」
    const fullPage = page.fullPage || undefined;
    // 退回整頁時 player 可能只是寬鬆區段：頻道 ID 再看整頁沒有意義（已經讀完），只看頁首＋區段即可
    if (!page.head.includes(channelId) && !page.player.includes(channelId)) return { ...failed('no_channel_id'), fullPage };
    const parsed = parseLiveOgPage(page);
    if (!parsed.videoId) return { ...OFFLINE, fullPage };
    if (parsed.isUpcoming) {
      return { ok: true, isLive: false, isUpcoming: true, videoId: parsed.videoId, title: parsed.title, scheduledStart: parsed.scheduledStart, fullPage };
    }
    // _live.jpg 只有正在直播時才存在：200＝直播中、404＝沒在直播；其他狀態或例外不可判斷
    let img: Response;
    try {
      img = await fetchWithTimeout(
        fetchFn,
        `https://i.ytimg.com/vi/${parsed.videoId}/hqdefault_live.jpg`,
        { method: 'HEAD', headers: { 'User-Agent': BROWSER_UA } },
        timeoutMs,
      );
    } catch (e) {
      return { ...failed(`thumb_error_${errorName(e)}`), fullPage };
    }
    if (img.status === 200) return { ok: true, isLive: true, isUpcoming: false, videoId: parsed.videoId, title: parsed.title, scheduledStart: null, fullPage };
    if (img.status === 404) return { ...OFFLINE, fullPage };
    return { ...failed(`thumb_${img.status}`), fullPage };
  } catch (e) {
    // AbortError＝逾時；TypeError 多半是連線中斷
    return failed(`error_${errorName(e)}`);
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
