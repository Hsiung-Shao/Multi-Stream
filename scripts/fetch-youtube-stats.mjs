/**
 * 從 YouTube Data API v3 取得頻道訂閱數
 *
 * 使用方式：
 *   node scripts/fetch-youtube-stats.mjs <handle_or_channel_id>
 *
 * 環境變數（從 .dev.vars 讀取或直接設定）：
 *   YOUTUBE_API_KEY
 *
 * 範例：
 *   node scripts/fetch-youtube-stats.mjs @KSPKSP
 *   node scripts/fetch-youtube-stats.mjs UCxxxxx
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// 從 .dev.vars 讀取環境變數
function loadDevVars() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.dev.vars'), 'utf-8');
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
    // .dev.vars not found, rely on env vars
  }
}

loadDevVars();

const API_KEY = process.env.YOUTUBE_API_KEY;
let input = process.argv[2] || '@KSPKSP';

if (!API_KEY) {
  console.error('請設定 YOUTUBE_API_KEY');
  console.error('可加到 .dev.vars 或透過環境變數傳入');
  process.exit(1);
}

// 處理各種輸入格式
// https://www.youtube.com/@KSPKSP → @KSPKSP
// @KSPKSP → @KSPKSP
// UCxxxxx → UCxxxxx
if (input.includes('youtube.com/')) {
  const match = input.match(/youtube\.com\/(@[^/?]+|channel\/([^/?]+))/);
  if (match) {
    input = match[2] || match[1];
  }
}

// 從 .dev.vars 讀取允許的 referer（Google Cloud API Key 限制用）
const REFERER = process.env.YOUTUBE_API_REFERER || 'https://multi-stream.pages.dev/';

async function ytFetch(url) {
  const res = await fetch(url, {
    headers: { 'Referer': REFERER }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`YouTube API 請求失敗: ${res.status} - ${err}`);
  }
  return res.json();
}

async function getChannelByHandle(handle) {
  const forHandle = handle.startsWith('@') ? handle.slice(1) : handle;
  const url = `https://www.googleapis.com/youtube/v3/channels?forHandle=${encodeURIComponent(forHandle)}&part=snippet,statistics&key=${API_KEY}`;
  const data = await ytFetch(url);
  return data.items?.[0] || null;
}

async function getChannelById(channelId) {
  const url = `https://www.googleapis.com/youtube/v3/channels?id=${encodeURIComponent(channelId)}&part=snippet,statistics&key=${API_KEY}`;
  const data = await ytFetch(url);
  return data.items?.[0] || null;
}

async function main() {
  console.log(`\n  Fetching YouTube channel stats for: ${input}\n`);

  let channel;
  if (input.startsWith('@')) {
    channel = await getChannelByHandle(input);
  } else if (input.startsWith('UC')) {
    channel = await getChannelById(input);
  } else {
    // 嘗試當作 handle
    channel = await getChannelByHandle(input);
  }

  if (!channel) {
    console.error(`  頻道 "${input}" 未找到。`);
    process.exit(1);
  }

  const { snippet, statistics } = channel;

  console.log('  ─────────────────────────────');
  console.log(`  Channel Title:    ${snippet.title}`);
  console.log(`  Channel ID:       ${channel.id}`);
  console.log(`  Handle:           ${snippet.customUrl || 'N/A'}`);
  console.log(`  Subscribers:      ${Number(statistics.subscriberCount).toLocaleString()}`);
  console.log(`  Total Views:      ${Number(statistics.viewCount).toLocaleString()}`);
  console.log(`  Total Videos:     ${Number(statistics.videoCount).toLocaleString()}`);
  console.log(`  Hidden Subs:      ${statistics.hiddenSubscriberCount}`);
  console.log(`  Thumbnail:        ${snippet.thumbnails?.default?.url || 'N/A'}`);
  console.log('  ─────────────────────────────');

  console.log('\n  SQL Update:');
  console.log(`  UPDATE vtubers SET`);
  console.log(`    youtube_subscriber_count = ${statistics.subscriberCount}`);
  console.log(`  WHERE name = 'KSP';`);
  console.log();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
