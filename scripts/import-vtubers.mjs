// 一次性 / 可重跑：把 TaiwanVTuberTrackingDataJson 名單 upsert 進 public.vtubers 主表
//
// 用法：
//   node scripts/import-vtubers.mjs --dry-run   # 只印轉換結果與統計，不寫 DB
//   node scripts/import-vtubers.mjs             # 實際 upsert
//
// 設計：
//   - 來源：docs/TaiwanVTuberTrackingDataJson-master/api/v2/all/vtubers/all.json
//   - 只匯有 YouTube.id 的筆數，以 youtube_channel_id 為 upsert 衝突鍵
//     （需先建 partial unique index：vtubers_youtube_channel_id_key）
//   - 走 service_role PostgREST upsert（參考 functions/lib/youtube-channel-cache.js 的寫法），
//     不引入 @supabase/supabase-js，對齊專案慣例
//   - 固定欄位集合 + null：group_id / languages / last_live_at 不在 payload，故既有列保留不動

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCE = resolve(
    ROOT,
    'docs/TaiwanVTuberTrackingDataJson-master/api/v2/all/vtubers/all.json',
);
const BATCH_SIZE = 500;
const DRY_RUN = process.argv.includes('--dry-run');

const NATIONALITY_WHITELIST = new Set(['TW', 'HK', 'MY', 'JP', 'KR']);
const ACTIVITY_WHITELIST = new Set(['active', 'graduate', 'preparing']);
const CONTRIBUTED_BY = 'import:TaiwanVTuberTrackingData';

// --- 讀 .dev.vars（KEY=VALUE 逐行）---
function loadEnv() {
    const text = readFileSync(resolve(ROOT, '.dev.vars'), 'utf-8');
    const env = {};
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
}

// --- 轉換單筆 ---
function toRow(v, nowIso) {
    const yt = v.YouTube || {};
    const tw = v.Twitch || {};
    const pv = v.popularVideo || {};
    const nat = NATIONALITY_WHITELIST.has(v.nationality) ? v.nationality : 'OTHER';
    const act = ACTIVITY_WHITELIST.has(v.activity) ? v.activity : 'active';
    return {
        youtube_channel_id: yt.id,
        name: v.name,
        img_url: v.imgUrl ?? null,
        activity: act,
        nationality: nat,
        youtube_subscriber_count: yt.subscriber?.count ?? null,
        twitch_channel_id: tw.id ?? null,
        twitch_follower_count: tw.follower?.count ?? null,
        popular_video_type: pv.type ?? null,
        popular_video_id: pv.id ?? null,
        debut_date: v.debutDate ?? null,
        channel_id_verified: false,
        contributed_by: CONTRIBUTED_BY,
        updated_at: nowIso,
    };
}

async function upsertBatch(env, batch) {
    const url = `${env.SUPABASE_URL}/rest/v1/vtubers?on_conflict=youtube_channel_id`;
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
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 500)}`);
    }
}

async function main() {
    const env = loadEnv();
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY（.dev.vars）');
    }

    const raw = JSON.parse(readFileSync(SOURCE, 'utf-8'));
    const list = raw.VTubers || [];
    const nowIso = new Date().toISOString();

    const withChannel = list.filter((v) => v.YouTube && v.YouTube.id);
    const rows = withChannel.map((v) => toRow(v, nowIso));

    // 去重（保險：同 channel id 只留最後一筆，避免單批 ON CONFLICT 撞同鍵）
    const byChannel = new Map();
    for (const r of rows) byChannel.set(r.youtube_channel_id, r);
    const deduped = [...byChannel.values()];

    // 統計
    const natDist = {};
    const actDist = {};
    for (const r of deduped) {
        natDist[r.nationality] = (natDist[r.nationality] || 0) + 1;
        actDist[r.activity] = (actDist[r.activity] || 0) + 1;
    }

    console.log('來源檔            :', SOURCE);
    console.log('總筆數            :', list.length);
    console.log('有 channel id     :', withChannel.length);
    console.log('去重後待 upsert   :', deduped.length);
    console.log('nationality 分佈  :', natDist);
    console.log('activity 分佈     :', actDist);

    if (DRY_RUN) {
        console.log('\n[DRY-RUN] 前 5 筆轉換結果：');
        for (const r of deduped.slice(0, 5)) console.log(JSON.stringify(r, null, 0));
        console.log('\n[DRY-RUN] 未寫入 DB。');
        return;
    }

    let ok = 0;
    let failed = 0;
    for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
        const batch = deduped.slice(i, i + BATCH_SIZE);
        const n = Math.floor(i / BATCH_SIZE) + 1;
        try {
            await upsertBatch(env, batch);
            ok += batch.length;
            console.log(`批次 ${n}：upsert ${batch.length} 筆 OK（累計 ${ok}）`);
        } catch (e) {
            failed += batch.length;
            console.error(`批次 ${n} 失敗：`, e.message);
            throw e; // fail loud：停在第一個失敗批次
        }
    }
    console.log(`\n完成：成功 ${ok} 筆，失敗 ${failed} 筆。`);
}

main().catch((e) => {
    console.error('匯入中止：', e.message);
    process.exit(1);
});
