/**
 * 快速搜尋網路上提到 multistreaming.org / MultiStream Hub 的內容
 *
 * 使用方式：
 *   node scripts/search-mentions.mjs [days]
 *
 * 參數：
 *   days  搜尋過去幾天的內容（預設 30）
 *
 * 環境變數（從 .dev.vars 讀取）：
 *   YOUTUBE_API_KEY      用於 YouTube Data API v3
 *   YOUTUBE_API_REFERER  API key 的 HTTP Referer 限制
 *
 * 輸出：
 *   - YouTube 影片清單（API 直接搜尋，包含影片標題、頻道、發布日、URL）
 *   - YouTube 留言提及（searchTerms）
 *   - 其他平台搜尋連結（Google / PTT / 巴哈 / Dcard / Reddit / X / Facebook）
 *   - 結果同時寫入 scripts/.cache/search-mentions-<date>.json 方便事後檢視
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadDevVars() {
  try {
    const content = readFileSync(resolve(ROOT, '.dev.vars'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  } catch {
    // .dev.vars 不存在則使用 process.env
  }
}

loadDevVars();

const API_KEY = process.env.YOUTUBE_API_KEY;
const REFERER = process.env.YOUTUBE_API_REFERER || 'https://multistreaming.org/';

if (!API_KEY) {
  console.error('❌ 請在 .dev.vars 設定 YOUTUBE_API_KEY');
  process.exit(1);
}

const DAYS = Number(process.argv[2]) || 30;
const publishedAfter = new Date(Date.now() - DAYS * 86400_000).toISOString();

// 搜尋關鍵字（涵蓋網域、品牌名、可能的中文描述）
const QUERIES = [
  'multistreaming.org',
  'MultiStream Hub',
  'multistream hub 同時觀看',
  '多平台 直播 觀看 工具',
  'twitch youtube 同時觀看',
];

async function ytFetch(url) {
  const res = await fetch(url, { headers: { Referer: REFERER } });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status}: ${err.slice(0, 300)}`);
  }
  return res.json();
}

async function searchVideos(q) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', q);
  url.searchParams.set('type', 'video');
  url.searchParams.set('order', 'date');
  url.searchParams.set('maxResults', '25');
  url.searchParams.set('publishedAfter', publishedAfter);
  url.searchParams.set('key', API_KEY);
  return ytFetch(url);
}

async function searchComments(q) {
  // commentThreads 不支援全網搜尋，只能對特定 video / channel
  // 改用 search.list 的 type=video + 額外配對 description 是更可靠的做法
  // 這裡保留函式骨架供未來擴充
  return null;
}

console.log(`\n🔍 搜尋過去 ${DAYS} 天提到 multistreaming.org / MultiStream Hub 的內容`);
console.log(`   時間區間: ${publishedAfter} ~ now\n`);

const seenVideos = new Map();
const errors = [];

for (const q of QUERIES) {
  process.stdout.write(`  [YouTube] "${q}" ... `);
  try {
    const data = await searchVideos(q);
    const items = data.items || [];
    let added = 0;
    for (const item of items) {
      const vid = item.id?.videoId;
      if (!vid || seenVideos.has(vid)) continue;
      const sn = item.snippet;
      // 二次過濾：標題或描述要實際包含網域或品牌名
      const text = `${sn.title} ${sn.description}`.toLowerCase();
      const hit =
        text.includes('multistreaming.org') ||
        text.includes('multistream hub') ||
        text.includes('multistream-hub');
      seenVideos.set(vid, {
        videoId: vid,
        title: sn.title,
        channel: sn.channelTitle,
        channelId: sn.channelId,
        publishedAt: sn.publishedAt,
        description: sn.description,
        url: `https://youtu.be/${vid}`,
        matchedQuery: q,
        strongMatch: hit, // 是否明確提到品牌
      });
      added++;
    }
    console.log(`${added} 筆新結果（總 ${seenVideos.size}）`);
  } catch (e) {
    console.log(`❌ ${e.message.slice(0, 200)}`);
    errors.push({ query: q, error: e.message });
  }
}

// 排序：強匹配優先，然後依時間
const videos = [...seenVideos.values()].sort((a, b) => {
  if (a.strongMatch !== b.strongMatch) return a.strongMatch ? -1 : 1;
  return b.publishedAt.localeCompare(a.publishedAt);
});

const strong = videos.filter(v => v.strongMatch);
const weak = videos.filter(v => !v.strongMatch);

console.log(`\n📺 YouTube 結果\n`);

if (strong.length === 0) {
  console.log(`  ⚠️  過去 ${DAYS} 天 YouTube 沒有任何影片在標題/描述明確提到 multistreaming.org`);
  console.log(`     （可能來源是：影片內口頭提到、留言區、或描述以縮網址形式呈現）`);
} else {
  console.log(`  ✅ 找到 ${strong.length} 個明確提到的影片：\n`);
  for (const v of strong) {
    console.log(`     📺 ${v.title}`);
    console.log(`        by ${v.channel}  |  ${v.publishedAt.slice(0, 10)}`);
    console.log(`        ${v.url}`);
    if (v.description) {
      const d = v.description.replace(/\n/g, ' ').slice(0, 200);
      console.log(`        ${d}${v.description.length > 200 ? '...' : ''}`);
    }
    console.log();
  }
}

if (weak.length > 0) {
  console.log(`  💡 另有 ${weak.length} 個關鍵字相關但未明確提到品牌的影片（可能誤判，前 5 筆）：\n`);
  for (const v of weak.slice(0, 5)) {
    console.log(`     - ${v.title} | ${v.channel} | ${v.publishedAt.slice(0, 10)}`);
    console.log(`       ${v.url}`);
  }
}

// === 其他平台搜尋連結（無 API，列出供手動點擊）===
console.log(`\n\n🔗 其他平台搜尋連結（請手動打開檢查）：\n`);

const sites = [
  ['Google 全網',     'https://www.google.com/search?q=%22multistreaming.org%22&tbs=qdr:m&hl=zh-TW'],
  ['Google 中文',      'https://www.google.com/search?q=%22MultiStream+Hub%22+OR+%22multistreaming.org%22&hl=zh-TW&tbs=qdr:m'],
  ['Bing',             'https://www.bing.com/search?q=%22multistreaming.org%22&filters=ex1%3a%22ez5_19400_19430%22'],
  ['DuckDuckGo',       'https://duckduckgo.com/?q=%22multistreaming.org%22&df=m'],
  ['PTT (透過 Google)', 'https://www.google.com/search?q=site%3Aptt.cc+multistreaming.org'],
  ['巴哈姆特',         'https://www.google.com/search?q=site%3Agamer.com.tw+multistreaming.org'],
  ['Dcard',            'https://www.google.com/search?q=site%3Adcard.tw+multistreaming.org'],
  ['Reddit',           'https://www.google.com/search?q=site%3Areddit.com+multistreaming.org'],
  ['X / Twitter',      'https://x.com/search?q=multistreaming.org&src=typed_query&f=live'],
  ['Facebook',         'https://www.facebook.com/search/posts?q=multistreaming.org'],
  ['Threads',          'https://www.threads.net/search?q=multistreaming.org&serp_type=default'],
];

for (const [name, url] of sites) {
  console.log(`  ${name.padEnd(20)} ${url}`);
}

// === 寫入快取 ===
const cacheDir = resolve(__dirname, '.cache');
if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outFile = resolve(cacheDir, `search-mentions-${stamp}.json`);
writeFileSync(outFile, JSON.stringify({
  generatedAt: new Date().toISOString(),
  daysSearched: DAYS,
  publishedAfter,
  queries: QUERIES,
  youtube: {
    total: videos.length,
    strongMatchCount: strong.length,
    weakMatchCount: weak.length,
    items: videos,
  },
  externalSearchLinks: Object.fromEntries(sites),
  errors,
}, null, 2), 'utf-8');

console.log(`\n💾 完整結果已存到: scripts/.cache/search-mentions-${stamp}.json`);
console.log(`\n✅ 完成。\n`);
