/**
 * 從 Twitch API 取得 VTuber 的頭像和追隨數
 *
 * 使用方式：
 *   node scripts/fetch-twitch-profile.mjs <twitch_login>
 *
 * 環境變數（從 .dev.vars 讀取或直接設定）：
 *   TWITCH_CLIENT_ID
 *   TWITCH_CLIENT_SECRET
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

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const login = process.argv[2] || 'kspksp';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('請設定 TWITCH_CLIENT_ID 和 TWITCH_CLIENT_SECRET');
  console.error('可加到 .dev.vars 或透過環境變數傳入');
  process.exit(1);
}

async function getToken() {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function getUser(token, login) {
  const res = await fetch(`https://api.twitch.tv/helix/users?login=${login}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Client-Id': CLIENT_ID,
    },
  });
  if (!res.ok) throw new Error(`Users request failed: ${res.status}`);
  const data = await res.json();
  return data.data?.[0] || null;
}

async function getFollowerCount(token, broadcasterId) {
  const res = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&first=1`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Client-Id': CLIENT_ID,
    },
  });
  if (!res.ok) throw new Error(`Followers request failed: ${res.status}`);
  const data = await res.json();
  return data.total || 0;
}

async function main() {
  console.log(`\n  Fetching Twitch profile for: ${login}\n`);

  const token = await getToken();
  console.log('  Token acquired.');

  const user = await getUser(token, login);
  if (!user) {
    console.error(`  User "${login}" not found.`);
    process.exit(1);
  }

  const followerCount = await getFollowerCount(token, user.id);

  console.log('  ─────────────────────────────');
  console.log(`  Login:          ${user.login}`);
  console.log(`  Display Name:   ${user.display_name}`);
  console.log(`  User ID:        ${user.id}`);
  console.log(`  Profile Image:  ${user.profile_image_url}`);
  console.log(`  Followers:      ${followerCount.toLocaleString()}`);
  console.log(`  Created At:     ${user.created_at}`);
  console.log('  ─────────────────────────────');

  console.log('\n  SQL Update:');
  console.log(`  UPDATE vtubers SET`);
  console.log(`    img_url = '${user.profile_image_url}',`);
  console.log(`    twitch_follower_count = ${followerCount}`);
  console.log(`  WHERE twitch_channel_id = '${user.login}';\n`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
