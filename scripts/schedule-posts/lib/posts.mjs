// YouTube 頻道「貼文」分頁（/channel/<UC…>/posts；不是 /community，那條拿不到貼文）：
// 用瀏覽器 UA＋同意 cookie 直接抓 HTML，從 ytInitialData 取 backstagePostRenderer。零 API 配額。
// 2026-10-05 實測：postId、contentText.runs、publishedTimeText（相對時間「6 天前」）、
// backstageAttachment 裡的 backstageImageRenderer（單圖）／postMultiImageRenderer（多圖）。

export const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const UC_RE = /^UC[a-zA-Z0-9_-]{22}$/;
/** 貼文 ID（實測 36 字，Ugkx 開頭）；資料庫 CHECK 是 10～64 字 */
export const POST_ID_RE = /^[A-Za-z0-9_-]{10,64}$/;

export const POSTS_HEADERS = {
  'User-Agent': BROWSER_UA,
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
  Accept: 'text/html,application/xhtml+xml',
  // SOCS=CAI：略過 EU 同意頁（consent.youtube.com）；沒有它會被導走
  Cookie: 'SOCS=CAI; CONSENT=YES+cb.20210328-17-p0.en+FX+917;',
};

/** 關鍵字：貼文文字提到週表才送模型（控制成本；只有圖片沒文字的週表會漏，接受） */
export const SCHEDULE_KEYWORD_RE = /週表|周表|行程|時間表|本週|本周|今週|今周|下週|下周|配信予定|スケジュール|預定|预定|schedule|sched\b|weekly/i;

/** 抓貼文頁；回 { ok:true, html } 或 { ok:false, reason } */
export async function fetchPostsPage(channelId, { fetch: fetchFn = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  if (!UC_RE.test(channelId)) return { ok: false, reason: 'bad_id' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(`https://www.youtube.com/channel/${channelId}/posts?hl=zh-TW`, {
      headers: POSTS_HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) {
      res.body?.cancel?.().catch(() => {});
      return { ok: false, reason: `http_${res.status}` };
    }
    if (res.url && !/^https:\/\/(?:www\.|m\.)?youtube\.com\//.test(res.url)) return { ok: false, reason: 'foreign_url' };
    const html = await res.text();
    if (!html.includes(channelId)) return { ok: false, reason: 'no_channel_id' }; // 限流／sorry 頁回 200 但沒有頻道 ID
    return { ok: true, html };
  } catch (e) {
    return { ok: false, reason: e?.name === 'AbortError' ? 'timeout' : `error_${e?.name ?? 'unknown'}` };
  } finally {
    clearTimeout(timer);
  }
}

/** 取 `var ytInitialData = {…};` 那段並 JSON.parse；找不到回 null */
export function extractInitialData(html) {
  const start = html.indexOf('var ytInitialData = ');
  if (start < 0) return null;
  const from = start + 'var ytInitialData = '.length;
  const end = html.indexOf(';</script>', from);
  if (end < 0) return null;
  try {
    return JSON.parse(html.slice(from, end));
  } catch {
    return null;
  }
}

/** 圖片網址去掉尺寸後綴（=s640-…）；要大圖時加 =s1600 */
export function imageBaseUrl(url) {
  return url.replace(/=s\d+[^/]*$/, '').replace(/=w\d+-h\d+[^/]*$/, '');
}
export const imageFullUrl = (url) => `${imageBaseUrl(url)}=s1600`;

function collectImages(attachment) {
  const out = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (o.backstageImageRenderer?.image?.thumbnails?.length) {
      const t = o.backstageImageRenderer.image.thumbnails;
      out.push(imageBaseUrl(t[t.length - 1].url));
      return;
    }
    for (const k in o) walk(o[k]);
  })(attachment);
  return [...new Set(out)];
}

/**
 * 解析貼文頁 → [{ postId, text, publishedText, images }]（頁面順序＝新到舊）。
 * 文字只保留前 1,000 字（送模型與存摘要都用不到更多）。
 */
export function parsePostsHtml(html) {
  const data = extractInitialData(html);
  if (!data) return [];
  const posts = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (o.backstagePostRenderer) {
      const p = o.backstagePostRenderer;
      // postId 會拼進 PostgREST 篩選與 external_id：只收 YouTube 實際的字元集
      if (typeof p.postId === 'string' && POST_ID_RE.test(p.postId)) {
        posts.push({
          postId: p.postId,
          text: (p.contentText?.runs ?? []).map((r) => r.text ?? '').join('').slice(0, 1000),
          publishedText: p.publishedTimeText?.runs?.[0]?.text ?? p.publishedTimeText?.simpleText ?? null,
          images: collectImages(p.backstageAttachment),
        });
      }
      return;
    }
    for (const k in o) walk(o[k]);
  })(data);
  // 同一篇可能出現兩次（釘選＋列表）：保留第一次
  const seen = new Set();
  return posts.filter((p) => (seen.has(p.postId) ? false : (seen.add(p.postId), true)));
}

const UNIT_MS = { second: 1e3, minute: 60e3, hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3, year: 365 * 86400e3 };
const ZH_UNIT = { 秒: 'second', 分鐘: 'minute', 分: 'minute', 小時: 'hour', 時: 'hour', 天: 'day', 日: 'day', 週: 'week', 周: 'week', 個月: 'month', 月: 'month', 年: 'year' };

/**
 * 相對時間 →（約略）絕對時間 ms；看不懂回 null。
 * 支援「6 天前」「2 週前」「1 個月前」「剛剛」「已編輯」以及英文 "6 days ago (edited)"。
 */
export function relativeToDate(text, now) {
  if (!text) return null;
  const t = String(text).replace(/[（(]?(已編輯|edited)[)）]?/gi, '').trim();
  if (/^(剛剛|just now)$/i.test(t)) return now;
  let m = t.match(/^(\d+)\s*(個月|分鐘|小時|秒|分|時|天|日|週|周|月|年)前$/);
  if (m) return now - Number(m[1]) * UNIT_MS[ZH_UNIT[m[2]]];
  m = t.match(/^(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago$/i);
  if (m) return now - Number(m[1]) * UNIT_MS[m[2].toLowerCase()];
  return null;
}

/** 要送模型的貼文：有圖、發文不超過 maxAgeDays、文字含週表關鍵字 */
export function isScheduleCandidate(post, now, { maxAgeDays }) {
  if (!post.images?.length) return false;
  const at = relativeToDate(post.publishedText, now);
  if (at === null || now - at > maxAgeDays * 86400e3) return false;
  return SCHEDULE_KEYWORD_RE.test(post.text ?? '');
}
