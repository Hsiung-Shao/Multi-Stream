// YouTube 頻道 RSS（feeds/videos.xml?channel_id=UC…）：0 配額、免金鑰，回最新 15 支影片。
//
// 解析用 indexOf 逐段切，而不是 DOMParser 或整份 regex：
//   - Deno 與 Node 都沒有內建的 XML DOM
//   - Edge Function 有 CPU 時間上限（本地 soft 1s / hard 2s，正式 2s），一次要解析上百份 20～30KB 的 feed，
//     每一毫秒都算；只取 yt:videoId / title / published / updated 四個欄位

import { detachString } from './strings.ts';

export interface RssEntry {
  videoId: string;
  title: string;
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface RssFetchResult {
  ok: boolean;
  status: number;
  entries: RssEntry[];
  error: string | null;
  ms: number;
}

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function decodeXml(s: string): string {
  if (s.startsWith('<![CDATA[') && s.endsWith(']]>')) s = s.slice(9, -3);
  if (s.indexOf('&') === -1) return s;
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/** 在 block 內取 <name>…</name> 的內容（不處理屬性以外的變體；feed 格式固定） */
function tag(block: string, name: string): string | null {
  const open = `<${name}>`;
  const i = block.indexOf(open);
  if (i === -1) return null;
  const j = block.indexOf(`</${name}>`, i + open.length);
  if (j === -1) return null;
  return decodeXml(block.slice(i + open.length, j).trim());
}

/** 解析 feed XML；不是 feed、沒有 entry 都回空陣列，不丟錯。 */
export function parseYouTubeRss(xml: string): RssEntry[] {
  if (!xml) return [];
  const out: RssEntry[] = [];
  let pos = 0;
  for (;;) {
    const start = xml.indexOf('<entry>', pos);
    if (start === -1) break;
    const end = xml.indexOf('</entry>', start);
    if (end === -1) break;
    const block = xml.slice(start + 7, end);
    pos = end + 8;
    const videoId = tag(block, 'yt:videoId');
    if (!videoId || !VIDEO_ID_RE.test(videoId)) continue;
    // 13 字元以上的切片會把整份 feed 留在記憶體（strings.ts），留下來的欄位都複製成獨立字串
    out.push({
      videoId,
      title: detachString((tag(block, 'title') ?? '').slice(0, 300)),
      publishedAt: detachString(tag(block, 'published')),
      updatedAt: detachString(tag(block, 'updated')),
    });
  }
  return out;
}

export interface RssFetchOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** 抓一個頻道的 feed。網路錯誤、逾時、非 200 都回 ok=false，讓呼叫端累計失敗率。 */
export async function fetchChannelRss(channelId: string, opts: RssFetchOptions = {}): Promise<RssFetchResult> {
  const fetchFn = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
      headers: { 'Accept': 'application/atom+xml, application/xml, text/xml' },
      signal: controller.signal,
    });
    if (!res.ok) {
      // 把 body 讀掉，讓連線可以回收
      await res.text().catch(() => '');
      return { ok: false, status: res.status, entries: [], error: `http ${res.status}`, ms: Date.now() - t0 };
    }
    const xml = await res.text();
    return { ok: true, status: res.status, entries: parseYouTubeRss(xml), error: null, ms: Date.now() - t0 };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? 'timeout' : e.message) : String(e);
    return { ok: false, status: 0, entries: [], error: msg.slice(0, 200), ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}
