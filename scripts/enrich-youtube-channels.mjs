// 一次性 / 可重跑：用 YouTube Data API v3 全表刷新 youtube_channels 的
// 頭像（yt3.ggpht.com）、訂閱數，順帶 觀看/影片數、標題、custom_url、描述、發布日。
//
// 用法：
//   node scripts/enrich-youtube-channels.mjs --dry-run            # 抓 API + 印統計，不寫 DB、不備份
//   node scripts/enrich-youtube-channels.mjs --dry-run --limit=100 # 只處理前 N 筆（快速驗證腳本）
//   node scripts/enrich-youtube-channels.mjs                      # 實跑（先備份現況再 upsert）
//
// 設計（對齊 scripts/import-vtubers.mjs 與 functions/lib/youtube-channel-cache.js）：
//   - 來源：youtube_channels 全表 channel_id（PostgREST 分頁抓）
//   - metadata：YouTube Data API channels.list part=snippet,statistics（每批 50 id、1 quota/call）
//   - 寫回：service_role PostgREST upsert on_conflict=channel_id, resolution=merge-duplicates
//   - 不抹資料：hiddenSubscriberCount 沿用舊訂閱數；API 未回傳的 id 略過；每筆欄位集一致
//   - 實跑前把現況(channel_id,thumbnail_url,subscriber_count,fetched_at)備份到 scripts/backups/

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

const YT_BATCH = 50;       // channels.list 的 id 上限
const UPSERT_BATCH = 500;  // PostgREST 單批 upsert
const SELECT_PAGE = 1000;  // PostgREST 分頁大小
const API_SLEEP_MS = 200;  // 批次間隔（避免 rate limit）
const DESC_MAX = 5000;
const TITLE_MAX = 200;
// YOUTUBE_API_KEY 是受 HTTP referer 限制的前端 key；node 無 referer 會被 403 擋，
// 故帶上該 key 允許的正式網域 referer（server-to-server 合法使用）
const REFERER = 'https://multistreaming.org';

// --- 讀 .dev.vars（KEY=VALUE 逐行）---
function loadEnv() {
    const text = readFileSync(resolve(ROOT, '.dev.vars'), 'utf-8');
    const env = {};
    for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq === -1) continue;
        env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
    return env;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

// 分頁抓全部 channel 現況（當「保留基準」：hidden/未回傳時沿用舊值）
async function fetchAllChannels(env) {
    const rows = [];
    for (let offset = 0; ; offset += SELECT_PAGE) {
        const url = `${env.SUPABASE_URL}/rest/v1/youtube_channels`
            + `?select=channel_id,subscriber_count,thumbnail_url,fetched_at`
            + `&order=channel_id.asc&limit=${SELECT_PAGE}&offset=${offset}`;
        const res = await fetch(url, {
            headers: {
                apikey: env.SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
        });
        if (!res.ok) throw new Error(`SELECT HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const page = await res.json();
        rows.push(...page);
        if (page.length < SELECT_PAGE) break;
    }
    return rows;
}

async function fetchMetaBatch(apiKey, ids) {
    const url = `https://www.googleapis.com/youtube/v3/channels`
        + `?part=snippet,statistics&maxResults=50&id=${ids.join(',')}&key=${apiKey}`;
    const res = await fetch(url, { headers: { Referer: REFERER } });
    if (!res.ok) throw new Error(`YouTube API HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return data.items || [];
}

// 每筆欄位集必須一致，否則 PostgREST bulk upsert 會把缺的 key 當 NULL 寫入
function toRow(item, base, nowIso) {
    const sn = item.snippet || {};
    const st = item.statistics || {};
    const th = sn.thumbnails || {};
    const thumb = th.high?.url || th.medium?.url || th.default?.url || base?.thumbnail_url || null;
    const title = (sn.title || '').trim().slice(0, TITLE_MAX) || item.id;

    // 訂閱數：隱藏或未回傳則沿用舊值，不抹成 null
    let subs;
    if (st.hiddenSubscriberCount) subs = base?.subscriber_count ?? null;
    else if (st.subscriberCount != null) subs = st.subscriberCount; // API 回字串，PostgREST 接受
    else subs = base?.subscriber_count ?? null;

    return {
        channel_id: item.id,
        channel_title: title,
        thumbnail_url: thumb,
        subscriber_count: subs,
        view_count: st.viewCount ?? null,
        video_count: st.videoCount ?? null,
        custom_url: sn.customUrl ?? null,
        description: (sn.description || '').slice(0, DESC_MAX) || null,
        published_at: sn.publishedAt ?? null,
        fetched_at: nowIso,
        updated_at: nowIso,
    };
}

async function upsertBatch(env, batch) {
    const url = `${env.SUPABASE_URL}/rest/v1/youtube_channels?on_conflict=channel_id`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`UPSERT HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// 實跑前備份現況（僅目標欄位），需回退時可還原
function backupBaseline(rows) {
    const dir = resolve(ROOT, 'scripts/backups');
    mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = resolve(dir, `youtube_channels_backup_${ts}.json`);
    const snapshot = rows.map((r) => ({
        channel_id: r.channel_id,
        thumbnail_url: r.thumbnail_url,
        subscriber_count: r.subscriber_count,
        fetched_at: r.fetched_at,
    }));
    writeFileSync(file, JSON.stringify(snapshot), 'utf-8');
    return file;
}

async function main() {
    const env = loadEnv();
    for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'YOUTUBE_API_KEY']) {
        if (!env[k]) throw new Error(`缺少 ${k}（.dev.vars）`);
    }

    console.log('抓取 youtube_channels 現況…');
    let all = await fetchAllChannels(env);
    console.log('現況總筆數        :', all.length);
    if (LIMIT !== Infinity) {
        all = all.slice(0, LIMIT);
        console.log('--limit 生效       : 只處理前', all.length, '筆');
    }

    const baseMap = new Map(all.map((r) => [r.channel_id, r]));
    const ids = all.map((r) => r.channel_id);
    const nowIso = new Date().toISOString();

    if (!DRY_RUN) {
        const file = backupBaseline(all);
        console.log('已備份現況到      :', file);
    }

    const batches = chunk(ids, YT_BATCH);
    console.log(`YouTube API 批次數 : ${batches.length}（每批 ${YT_BATCH} id，約 ${batches.length} quota）`);

    const rows = [];
    const missing = [];
    let done = 0;
    for (let i = 0; i < batches.length; i++) {
        const idsBatch = batches[i];
        const items = await fetchMetaBatch(env.YOUTUBE_API_KEY, idsBatch);
        const returned = new Set(items.map((it) => it.id));
        for (const id of idsBatch) if (!returned.has(id)) missing.push(id);
        for (const it of items) rows.push(toRow(it, baseMap.get(it.id), nowIso));
        done += idsBatch.length;
        if ((i + 1) % 10 === 0 || i === batches.length - 1) {
            console.log(`  抓取 ${done}/${ids.length}（已解析 ${rows.length}，未回傳 ${missing.length}）`);
        }
        if (i < batches.length - 1) await sleep(API_SLEEP_MS);
    }

    const ggpht = rows.filter((r) => r.thumbnail_url && r.thumbnail_url.includes('yt3.ggpht.com')).length;
    const withSubs = rows.filter((r) => r.subscriber_count != null).length;
    console.log('\n=== 解析結果 ===');
    console.log('可更新筆數        :', rows.length);
    console.log('yt3.ggpht 頭像    :', ggpht);
    console.log('有訂閱數          :', withSubs);
    console.log('API 未回傳（略過）:', missing.length);

    if (DRY_RUN) {
        console.log('\n[DRY-RUN] 前 5 筆轉換結果：');
        for (const r of rows.slice(0, 5)) {
            console.log(JSON.stringify({ ...r, description: r.description ? r.description.slice(0, 40) + '…' : null }));
        }
        if (missing.length) console.log('\n[DRY-RUN] 未回傳 id（前 20）：', missing.slice(0, 20));
        console.log('\n[DRY-RUN] 未寫入 DB。');
        return;
    }

    let ok = 0;
    const upBatches = chunk(rows, UPSERT_BATCH);
    for (let i = 0; i < upBatches.length; i++) {
        await upsertBatch(env, upBatches[i]);
        ok += upBatches[i].length;
        console.log(`upsert 批次 ${i + 1}/${upBatches.length}：${upBatches[i].length} 筆 OK（累計 ${ok}）`);
    }
    console.log(`\n完成：更新 ${ok} 筆；未回傳略過 ${missing.length} 筆。`);
    if (missing.length) console.log('未回傳 id（前 50）：', missing.slice(0, 50));
}

main().catch((e) => {
    console.error('中止：', e.message);
    process.exit(1);
});
