// 合併研究代理的「子團官方名稱＋合作藝人」查證結果，套上人工排除，輸出 scripts/data/tw-agency-collabs-2026-09.json。
//
// 用法：node scripts/merge-agency-collabs.mjs <batch1.json> <batch2.json> …
// 輸出格式配合 resolve-roster-channels.mjs（每家的 members＝合作藝人），之後：
//   node scripts/resolve-roster-channels.mjs --roster scripts/data/tw-agency-collabs-2026-09.json --db <vtubers.json> --out <resolved.json>
//   node scripts/build-collab-links.mjs --resolved <resolved.json> --groups <vtuber_groups.json> --db <vtubers.json> --out supabase/migrations/20260930100100_vtuber_collab_links.sql
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const OVERRIDES = {
    // 研究結果的名字是帳號寫法：新增藝人時改用頻道上的顯示名稱（2026-09-30 查 YouTube／Twitch）
    display_name: {
        哈瓜Jongie: '哈瓜 Jongie',
        Ren0809k: 'Ren',
        'よしか⁂': 'YOSHIKA⁂',
        'UMA_kagami 卡嘎咪': '卡嘎咪',
    },
    // 官方列為合作、但不是 VTuber（真人實況主、賽評）：本站名冊只收 VTuber
    not_vtuber: {
        古德文創: ['漏打', 'SobadRush', '長毛', 'Zonda'],
    },
};

export function applyOverrides(agencies) {
    for (const a of agencies) {
        const excluded = new Set(OVERRIDES.not_vtuber[a.agency] ?? []);
        const collabs = a.collaborators ?? [];
        a.excluded = collabs.filter((m) => excluded.has(m.name)).map((m) => ({ name: m.name, reason: 'not_vtuber' }));
        a.members = collabs
            .filter((m) => !excluded.has(m.name))
            .map((m) => (OVERRIDES.display_name[m.name] ? { ...m, name: OVERRIDES.display_name[m.name], aliases: [...new Set([...(m.aliases ?? []), m.name])] } : m));
        delete a.collaborators;
    }
    return agencies;
}

function main() {
    const files = process.argv.slice(2);
    if (!files.length) throw new Error('請給 batch JSON 路徑');
    const agencies = applyOverrides(files.flatMap((f) => JSON.parse(readFileSync(resolve(f), 'utf8'))));
    const out = {
        _說明:
            '台灣 VTuber 企業勢的子團官方名稱與合作藝人。2026-09-30 由研究代理逐家查證（官網、官方公告、官方 YouTube 為準；wiki 只作線索），每筆附出處。members＝合作藝人（resolve-roster-channels.mjs 的輸入格式）；excluded＝人工排除（見 _overrides）。',
        verified_at: '2026-09-30',
        _overrides: OVERRIDES,
        agencies,
    };
    const path = resolve(ROOT, 'scripts/data/tw-agency-collabs-2026-09.json');
    writeFileSync(path, JSON.stringify(out, null, 2) + '\n', 'utf8');
    const n = (k) => agencies.reduce((s, a) => s + (a[k]?.length ?? 0), 0);
    console.log(`agencies ${agencies.length}, subgroups ${n('subgroups')}, collaborators ${n('members')}, excluded ${n('excluded')} → ${path}`);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('merge-agency-collabs.mjs')) main();
