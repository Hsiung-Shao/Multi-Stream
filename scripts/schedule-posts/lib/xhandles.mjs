// X 帳號補齊（使用者 2026-10-08 裁定：寫進 vtubers.x_url、只補空的；顯示名稱對不上的不寫，列清單人工看）。
//
// 來源：YouTube 頻道「關於」頁 /channel/<UC>/about 的 ytInitialData，每個 channelExternalLinkViewModel 是本人填的外部連結
// （{title.content:'Twitter', link.content:'twitter.com/Rumi__0813'}）。頻道首頁混著影片說明裡的別人連結，不能用。
// 驗證：fxtwitter 個人資料 https://api.fxtwitter.com/<handle> 的顯示名稱／簡介要能對上 VTuber 名稱
// （少數人填的是公司或合作帳號，例：茸茸鼠 → liquoricedrop）。

import { POSTS_HEADERS, extractInitialData } from './posts.mjs';

/** X 的保留路徑（不是使用者帳號） */
const RESERVED = new Set(['i', 'intent', 'home', 'share', 'search', 'hashtag', 'explore', 'settings', 'messages', 'notifications', 'compose', 'login', 'signup', 'tos', 'privacy']);
const HANDLE_RE = /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i;

/** /about 頁的外部連結 [{title, link}]（頁面順序）；沒有 ytInitialData 回 null */
export function parseAboutLinks(html) {
  const data = extractInitialData(html);
  if (!data) return null;
  const out = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (o.channelExternalLinkViewModel) {
      const v = o.channelExternalLinkViewModel;
      out.push({ title: v.title?.content ?? '', link: v.link?.content ?? '' });
      return;
    }
    for (const k in o) walk(o[k]);
  })(data);
  return out;
}

/** 連結 → X 帳號（去重、保留順序、排除保留路徑） */
export function extractXHandles(links) {
  const out = [];
  for (const l of links ?? []) {
    const m = String(l.link ?? '').trim().match(HANDLE_RE);
    if (!m || RESERVED.has(m[1].toLowerCase())) continue;
    if (!out.some((h) => h.toLowerCase() === m[1].toLowerCase())) out.push(m[1]);
  }
  return out;
}

export async function fetchAboutPage(channelId, { fetch: fetchFn = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  try {
    const res = await fetchFn(`https://www.youtube.com/channel/${channelId}/about?hl=zh-TW`, { headers: POSTS_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const html = await res.text();
    if (!html.includes(channelId)) return { ok: false, reason: 'no_channel_id' };
    return { ok: true, html };
  } catch (e) {
    return { ok: false, reason: e?.name === 'TimeoutError' ? 'timeout' : `error_${e?.name ?? 'unknown'}` };
  }
}

/** fxtwitter 個人資料：{ ok, user:{screen_name,name,description} } 或 { ok:false, reason }（404＝帳號不存在／停用） */
export async function fetchXProfile(handle, { fetch: fetchFn = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  try {
    const res = await fetchFn(`https://api.fxtwitter.com/${encodeURIComponent(handle)}`, { headers: { 'User-Agent': POSTS_HEADERS['User-Agent'] }, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 404) return { ok: false, reason: 'not_found' };
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const j = await res.json();
    if (!j?.user?.screen_name) return { ok: false, reason: 'no_user' };
    return { ok: true, user: { screen_name: j.user.screen_name, name: j.user.name ?? '', description: j.user.description ?? '' } };
  } catch (e) {
    return { ok: false, reason: e?.name === 'TimeoutError' ? 'timeout' : `error_${e?.name ?? 'unknown'}` };
  }
}

/**
 * 日文新字體／簡體 → 繁體的常見異體（名字裡常見的字；2026-10-08 正式站待人工清單裡出現過的優先）。
 * 只用在比對，不改顯示。
 */
const VARIANTS = {
  // 日文新字體
  猫: '貓', 姫: '姬', 桜: '櫻', 霊: '靈', 黒: '黑', 竜: '龍', 気: '氣', 恋: '戀', 楽: '樂', 鉄: '鐵', 蔵: '藏', 稲: '稻',
  瀬: '瀨', 沢: '澤', 浜: '濱', 広: '廣', 国: '國', 学: '學', 声: '聲', 宝: '寶', 円: '圓', 万: '萬', 与: '與', 来: '來',
  戦: '戰', 単: '單', 双: '雙', 薬: '藥', 灯: '燈',
  // 簡體
  龙: '龍', 樱: '櫻', 灵: '靈', 梦: '夢', 乐: '樂', 叶: '葉', 风: '風', 云: '雲', 鱼: '魚', 鸟: '鳥', 兰: '蘭', 莲: '蓮',
};
const foldVariants = (s) => s.replace(/[㐀-鿿]/g, (c) => VARIANTS[c] ?? c);

/** 比對用的正規化：NFKC、小寫、異體字折疊、去掉空白與符號（保留各國文字與數字） */
export function normalizeName(s) {
  return foldVariants(String(s ?? '').normalize('NFKC').toLowerCase()).replace(/[^\p{L}\p{N}]+/gu, '');
}

const CJK_RE = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}ー]/u;

/** a 與 b 是否共有連續 2 字以上、且至少含 1 個漢字的片段（「鬣崎ミナミ」對「鬣崎米娜米」共有「鬣崎」） */
export function sharesCjkRun(a, b) {
  for (let i = 0; i < a.length - 1; i++) {
    if (!CJK_RE.test(a[i]) || !CJK_RE.test(a[i + 1])) continue;
    const seg = a.slice(i, i + 2);
    if (/\p{sc=Han}/u.test(seg) && b.includes(seg)) return true;
  }
  return false;
}

/** 帳號比對用：小寫、去掉 _ - .（YouTube handle 與 X 帳號常只差底線） */
const normalizeHandle = (s) => String(s ?? '').toLowerCase().replace(/^@/, '').replace(/[_.-]/g, '');

/**
 * X 帳號是不是這位 VTuber 本人：
 *   - X 帳號與 YouTube handle（站內 slug 取自它）相同（去掉 _ - . 後至少 4 字），或
 *   - 名稱（正規化後）與 X 顯示名稱互相包含（較短的一邊至少 2 字），或
 *   - X 簡介提到 VTuber 名稱（至少 2 字）
 * 名稱很短（1 字）時只接受完全相同。日文漢字與中文異體（姫／姬）比不出來，靠帳號相同補上。
 */
export function nameMatches(vtuberName, xName, xDescription = '', { xHandle = '', ytHandle = '' } = {}) {
  const h = normalizeHandle(xHandle);
  if (h.length >= 4 && h === normalizeHandle(ytHandle)) return true;
  const a = normalizeName(vtuberName);
  const b = normalizeName(xName);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = shorter === a ? b : a;
  if (shorter.length >= 2 && longer.includes(shorter)) return true;
  const d = normalizeName(xDescription);
  if (a.length >= 2 && d.includes(a)) return true;
  // 逐段比對：「仙杜波拉 Cinderpola」對「仙杜波拉 Pola」——漢字／假名段至少 2 字、英數段至少 4 字且不是通用字
  if (nameTokens(vtuberName).some((t) => b.includes(foldVariants(t)) || (/^[a-z0-9]+$/.test(t) && t === h))) return true;
  // 共有連續 2 字以上的漢字片段（日文名對中文名：鬣崎ミナミ／鬣崎米娜米、風子ひかり／Fuko 風子）
  return sharesCjkRun(a, b);
}

/** 名稱裡太常見、不能拿來認人的英數段 */
const GENERIC_TOKENS = new Set(['vtuber', 'vtubers', 'channel', 'official', 'gaming', 'games', 'live', 'stream', 'studio', 'project', 'music']);

/** 名稱切成可比對的段：漢字／假名／韓文連續段（≥2 字）、英數連續段（≥4 字、非通用字），都正規化成小寫 */
export function nameTokens(name) {
  const s = String(name ?? '').normalize('NFKC').toLowerCase();
  const out = [];
  for (const m of s.matchAll(/[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}ー]+|[a-z0-9]+/gu)) {
    const t = m[0];
    const cjk = !/^[a-z0-9]+$/.test(t);
    if (cjk ? t.length >= 2 : t.length >= 4 && !GENERIC_TOKENS.has(t)) out.push(t);
  }
  return out;
}

/**
 * 依查詢結果決定：write（寫入第一個對得上的帳號）／review（列清單人工看）／none（關於頁沒有 X）。
 * checked：依關於頁順序查過的 [{ handle, profile }]（呼叫端對上一個就可以停）。
 */
export function decideHandle(vtuberName, handles, checked, ytHandle = '') {
  if (!handles.length) return { action: 'none', reason: 'no_x_link' };
  const hit = checked.find((c) => c.profile?.ok && nameMatches(vtuberName, c.profile.user.name, c.profile.user.description, { xHandle: c.profile.user.screen_name, ytHandle }));
  if (hit) return { action: 'write', handle: hit.handle, reason: handles.length > 1 ? 'matched_of_many' : 'ok' };
  const first = checked[0];
  if (!first?.profile?.ok) return { action: 'review', handle: handles[0], reason: `profile_${first?.profile?.reason ?? 'unknown'}` };
  return { action: 'review', handle: handles[0], reason: 'name_mismatch', xName: first.profile.user.name };
}

/** 寫進 vtubers.x_url 的形式（符合 CHECK vtubers_x_url_format） */
export const xUrlOf = (handle) => `https://x.com/${handle}`;

/** CSV 欄位：加引號；= + - @ 開頭（外部來的 X 顯示名稱）前面加 '，避免 Excel 當公式執行 */
export const csvCell = (s) => {
  const v = String(s ?? '');
  return `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
};
