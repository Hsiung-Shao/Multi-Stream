// 合併 hololive（日本 COVER）各分部的查證結果，套上人工判斷，輸出 scripts/data/hololive-roster-2026-09.json。
// 2026-09-30 使用者：「幫我尋找 holelive（hololive）的成員名稱也加入進去」；全分部、含畢業、名字只用官方名。
//
// 用法：node scripts/merge-hololive.mjs <jp.json> <devis_en.json> <id.json> <asobi.json>
// 之後：
//   node scripts/resolve-roster-channels.mjs --roster scripts/data/hololive-roster-2026-09.json --db <vtubers.json> --out <resolved.json>
//   node scripts/build-agency-rosters.mjs --resolved <resolved.json> --groups <groups.json> --db <vtubers.json> --tag hololive_20260930 \
//     --contributed-by research:hololive-2026-09 --verified-at 2026-09-30 --title 'hololive production 成員名冊（含畢業）' \
//     --source 'scripts/data/hololive-roster-2026-09.json（2026-09-30 逐分部查證）' --deps '20260930130000（hololive production 頂層團體）、20260929120000' \
//     --out supabase/migrations/20260930130100_hololive_roster.sql
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const AGENCY = 'hololive production';

export const OVERRIDES = {
    // 日本分部子團用官網原文（成員名也是官網日文名）
    subgroup_rename: {
        'hololive 0期生': 'ホロライブ0期生',
        'hololive 1期生': 'ホロライブ1期生',
        'hololive 2期生': 'ホロライブ2期生',
        'hololive 3期生': 'ホロライブ3期生',
        'hololive 4期生': 'ホロライブ4期生',
        'hololive 5期生': 'ホロライブ5期生',
        'hololive GAMERS': 'ホロライブゲーマーズ',
    },
    // 官方說法是「配信活動終了」但仍屬旗下（官網仍列出）：依「照官網標示」維持現役，不標已畢業
    keep_active: ['Watson Amelia', '沙花叉クロヱ'],
    // 兩人共用一個頻道：資料庫一個頻道只能對應一位，合成官方組合名一筆
    merge_shared_channel: { UCt9H_RpQzhxzlyBxFqrdHqA: 'FUWAMOCO' },
    // 不在這次範圍：holostars（男性團體）
    exclude_official: ['UCWsfcksUUpoEvhia0_ut0bA', 'UCJxZpzx4wHzEYD-eCiZPikg'],
};

export function mergeHololive(batches) {
    const members = [];
    const subgroups = new Set();
    const seenChannel = new Map();
    const rename = (n) => (n ? OVERRIDES.subgroup_rename[n] ?? n : n);
    for (const b of batches) {
        for (const sg of b.subgroups ?? []) subgroups.add(rename(sg));
        for (const raw of b.members ?? []) {
            if (raw.is_official_channel && OVERRIDES.exclude_official.includes(raw.youtube_channel_id)) continue;
            const m = { ...raw, subgroup: rename(raw.subgroup) };
            if (OVERRIDES.keep_active.includes(m.name) && m.status === 'graduated') {
                m.status = 'active';
                m.graduation_date = null;
                m.sources = [...(m.sources ?? []), 'override:keep_active（配信活動終了但仍屬旗下）'];
            }
            const merged = OVERRIDES.merge_shared_channel[m.youtube_channel_id];
            if (merged) {
                const prev = seenChannel.get(m.youtube_channel_id);
                if (prev) {
                    prev.aliases = [...new Set([...(prev.aliases ?? []), m.name, ...(m.aliases ?? [])])];
                    continue;
                }
                m.aliases = [...new Set([m.name, ...(m.aliases ?? [])])];
                m.name = merged;
            }
            // 同一個官方頻道在多批出現（例：hololive ホロライブ）只留一筆
            if (m.youtube_channel_id && seenChannel.has(m.youtube_channel_id)) continue;
            if (m.youtube_channel_id) seenChannel.set(m.youtube_channel_id, m);
            members.push(m);
        }
    }
    return { agency: AGENCY, agency_nationality: 'JP', subgroups: [...subgroups], members };
}

function main() {
    const files = process.argv.slice(2);
    if (files.length < 1) throw new Error('請給各分部的 JSON 路徑');
    const agency = mergeHololive(files.map((f) => JSON.parse(readFileSync(resolve(f), 'utf8'))));
    const out = {
        _說明: 'hololive production（日本 COVER）全分部成員名冊（含畢業）。2026-09-30 由研究代理逐分部查證（官網成員頁、COVER 官方公告），每位成員附出處；名字只用官方名；人工判斷見 _overrides。',
        verified_at: '2026-09-30',
        _overrides: OVERRIDES,
        agencies: [agency],
    };
    const path = resolve(ROOT, 'scripts/data/hololive-roster-2026-09.json');
    writeFileSync(path, JSON.stringify(out, null, 2) + '\n', 'utf8');
    const n = (s) => agency.members.filter((m) => !m.is_official_channel && m.status === s).length;
    console.log(`subgroups ${agency.subgroups.length}, active ${n('active')}, graduated ${n('graduated')}, official ${agency.members.filter((m) => m.is_official_channel).length} → ${path}`);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('merge-hololive.mjs')) main();
