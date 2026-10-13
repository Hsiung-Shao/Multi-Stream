// X（Twitter）週表貼文：fxtwitter 時間軸 https://api.fxtwitter.com/2/profile/<handle>/statuses（2026-10-08 實測）。
// 回 { code, results[], cursor }；每則有 id、text、author.screen_name、created_at（絕對時間）、
// replying_to（回覆對象，自我串文是自己）、reposted_by（轉推）、media.photos[].url（pbs.twimg.com/...?name=orig）。
// 只收本人發的原創或自我串文；轉推、回覆別人的不收。
// 第三方免費服務：X 服務條款不允許未授權爬取，fxtwitter 隨時可能失效或限流——失效時只影響 X 來源。

import { POSTS_HEADERS, SCHEDULE_KEYWORD_RE } from './posts.mjs';

export const X_ID_RE = /^\d{5,25}$/;

export async function fetchXTimeline(handle, { fetch: fetchFn = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  try {
    const res = await fetchFn(`https://api.fxtwitter.com/2/profile/${encodeURIComponent(handle)}/statuses`, {
      headers: { 'User-Agent': POSTS_HEADERS['User-Agent'] },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 429) return { ok: false, reason: 'rate_limited' };
    if (res.status === 404) return { ok: false, reason: 'not_found' };
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    return { ok: true, json: await res.json() };
  } catch (e) {
    return { ok: false, reason: e?.name === 'TimeoutError' ? 'timeout' : `error_${e?.name ?? 'unknown'}` };
  }
}

/** 時間軸 JSON → 本人的貼文 [{ id, text, createdAt(ms), images[] }]（排除轉推與回覆別人） */
export function parseXTimeline(json, handle) {
  const me = String(handle).toLowerCase();
  const out = [];
  for (const t of json?.results ?? []) {
    if (!t || !X_ID_RE.test(String(t.id ?? ''))) continue;
    if (t.reposted_by) continue;
    if (String(t.author?.screen_name ?? '').toLowerCase() !== me) continue;
    if (t.replying_to && String(t.replying_to.screen_name ?? '').toLowerCase() !== me) continue;
    const createdAt = typeof t.created_timestamp === 'number' ? t.created_timestamp * 1000 : Date.parse(t.created_at ?? '');
    if (!Number.isFinite(createdAt)) continue;
    // ?name=orig 原圖常有數 MB、下載逾時（2026-10-08 實測）；large 最長邊 2048，讀週表足夠
    const images = (t.media?.photos ?? [])
      .map((p) => p?.url)
      .filter((u) => typeof u === 'string' && /^https:\/\/pbs\.twimg\.com\//.test(u))
      .map((u) => (/[?&]name=/.test(u) ? u.replace(/([?&]name=)[a-z0-9]+/i, '$1large') : `${u}${u.includes('?') ? '&' : '?'}name=large`));
    out.push({ id: String(t.id), text: String(t.text ?? '').slice(0, 1000), createdAt, images });
  }
  return out;
}

/** 有圖、maxAgeDays 內、文字含週表關鍵字 */
export function isXScheduleCandidate(post, now, { maxAgeDays }) {
  if (!post.images?.length) return false;
  if (now - post.createdAt > maxAgeDays * 86400e3 || post.createdAt > now + 3600e3) return false;
  return SCHEDULE_KEYWORD_RE.test(post.text ?? '');
}

/** 候選與 schedule_community_posts 用的貼文鍵（與 YouTube 的 Ugkx… 不會撞） */
export const xPostKey = (id) => `x:${id}`;
export const xPostUrl = (handle, id) => `https://x.com/${handle}/status/${id}`;

/** vtubers.x_url → handle（https://x.com/<h> 或 twitter.com/<h>） */
export function handleFromXUrl(url) {
  return String(url ?? '').match(/^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/i)?.[1] ?? null;
}
