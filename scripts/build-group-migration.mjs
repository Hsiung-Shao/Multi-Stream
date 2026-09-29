// 由第三方快照（成員）＋ 人工查證分類產生「台灣團體標籤」資料 migration。
//
// 用法：node scripts/build-group-migration.mjs [--source <groups.json>] [--out supabase/migrations/<ts>_vtuber_groups_tw_data.sql]
//   成員：docs/TaiwanVTuberTrackingDataJson-master/api/v2/all/groups.json（2026-03 快照）
//   分類：scripts/data/tw-groups-2026-09.json（2026-09-29 查證，見 Obsidian 決策紀錄）
//
// 規則（2026-09-29 使用者裁定）：
//   - 所有台灣團體都建立；查證過的帶 kind／出處，其餘 kind=unverified
//   - 成員一律用 YouTube 頻道 ID／Twitch login 比對，不用名字（04-28 用名字比對幾乎全部落空）
//   - 公司底下的子團：只在逐人對應查得到時才建子團，成員掛子團，其餘掛原團體；子團 parent_id 指向公司
//   - 合作藝人不掛團（已掛在該團的會解除）；exclude 的不是團體（例如節目），不建立
//   - 同一人出現在多個團體：企業勢 > 個人工作室 > 社團 > 未確認；同等級取成員多的團，並列在摘要
//   - 未查證的團體用 on conflict do nothing，不覆蓋之後人工查證的結果
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KIND_PRIORITY = { agency: 0, personal: 1, circle: 2, unverified: 3 };

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const qn = (s) => (s == null || s === '' ? 'null' : q(s));

/** 來源團體 → 台灣成員（只留 nationality=TW） */
export function twMembers(group) {
    return (group.members ?? []).filter((m) => m.nationality === 'TW');
}

/** 成員的識別鍵：YouTube 頻道 ID 與 Twitch login 各一個（同一人兩個都有時會被合併成同一人） */
function memberKeys(m) {
    const keys = [];
    if (m.YouTube?.id) keys.push(`yt:${m.YouTube.id}`);
    if (m.Twitch?.id) keys.push(`tw:${String(m.Twitch.id).toLowerCase()}`);
    return keys;
}

/** 極簡 union-find：同一人在 A 團只列 YouTube、在 B 團只列 Twitch 時，靠兩者同時出現的那筆連起來 */
function makeUnionFind() {
    const parent = new Map();
    const find = (x) => {
        if (!parent.has(x)) parent.set(x, x);
        let r = x;
        while (parent.get(r) !== r) r = parent.get(r);
        parent.set(x, r);
        return r;
    };
    const union = (a, b) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    };
    return { find, union };
}

/**
 * 純函式：算出每個團體要建立的列、每位成員要掛的團體、衝突與待辦。
 * sourceGroups：groups.json 的 groups；classification：tw-groups-2026-09.json
 */
export function planGroups(sourceGroups, classification) {
    const byName = new Map(classification.groups.map((g) => [g.name, g]));
    const excluded = new Set((classification.exclude ?? []).map((e) => e.name));
    const verifiedAt = classification.verified_at ?? null;

    /** name → { name, kind, parent, verified_at, source_url, note } */
    const groups = new Map();
    for (const c of classification.companies ?? []) {
        groups.set(c.name, { name: c.name, kind: 'agency', parent: null, verified_at: verifiedAt, source_url: c.source_url ?? null, note: c.note ?? null });
        for (const s of c.subgroups ?? []) {
            groups.set(s.name, { name: s.name, kind: 'agency', parent: c.name, verified_at: verifiedAt, source_url: s.source_url ?? null, note: s.note ?? null });
        }
    }
    // 子團成員用名字在「同公司的來源團體」內找：公司名＋成員名 → 子團名
    const subgroupMembers = new Map();
    const companyOfSource = new Map(); // 來源團體名 → 公司名
    for (const c of classification.companies ?? []) {
        for (const s of c.subgroups ?? []) for (const n of s.members ?? []) subgroupMembers.set(`${c.name}\u0000${n}`, s.name);
    }
    for (const g of classification.groups) if (g.parent) companyOfSource.set(g.name, g.parent);

    /** 候選 [{ group, kind, size, member, keys }]（先收齊，最後依同一人合併） */
    const rawCandidates = [];
    const uf = makeUnionFind();
    const collaborators = []; // { group, member?, name }
    const missingNames = [];

    for (const sg of sourceGroups) {
        if (excluded.has(sg.name)) continue;
        const members = twMembers(sg);
        if (!members.length) continue;
        const cls = byName.get(sg.name);
        const kind = cls?.kind ?? 'unverified';
        groups.set(sg.name, {
            name: sg.name,
            kind,
            parent: cls?.parent ?? null,
            verified_at: cls ? verifiedAt : null,
            source_url: cls?.source_url ?? null,
            note: cls?.note ?? null,
        });
        const collabNames = new Set(cls?.collaborators ?? []);
        const company = companyOfSource.get(sg.name);
        for (const m of members) {
            if (collabNames.has(m.name)) {
                collaborators.push({ group: sg.name, name: m.name, member: m });
                continue;
            }
            const keys = memberKeys(m);
            if (!keys.length) continue;
            for (let i = 1; i < keys.length; i++) uf.union(keys[0], keys[i]);
            const target = (company && subgroupMembers.get(`${company}\u0000${m.name}`)) || sg.name;
            const targetKind = groups.get(target)?.kind ?? kind;
            rawCandidates.push({ group: target, kind: targetKind, size: members.length, member: m, keys });
        }
        // 合作藝人不在來源這一團的（例如 KSP）：之後用「名字＋目前就在這一團」解除
        for (const n of collabNames) if (!members.some((m) => m.name === n)) collaborators.push({ group: sg.name, name: n, member: null });
    }

    /** 同一人（union-find 的根）→ 候選 */
    const candidates = new Map();
    for (const c of rawCandidates) {
        const root = uf.find(c.keys[0]);
        const list = candidates.get(root) ?? [];
        list.push(c);
        candidates.set(root, list);
    }

    // 分類檔寫了但來源沒有的團名（打錯字或來源改名）
    for (const g of classification.groups) if (!groups.has(g.name) && !excluded.has(g.name)) missingNames.push(g.name);
    // parent 必須是 companies 裡的公司（寫錯字時 SQL 會默默把 parent_id 設成 null）；只支援一層
    const companyNames = new Set((classification.companies ?? []).map((c) => c.name));
    for (const g of classification.groups) if (g.parent && !companyNames.has(g.parent)) missingNames.push(`${g.name}→${g.parent}`);
    // 子團成員名字在來源找不到
    for (const c of classification.companies ?? []) {
        for (const s of c.subgroups ?? []) {
            for (const n of s.members ?? []) {
                const found = [...candidates.values()].some((list) => list.some((x) => x.group === s.name && x.member.name === n));
                if (!found) missingNames.push(`${s.name}/${n}`);
            }
        }
    }

    const assignments = new Map(); // group → [{ youtube, twitch, name }]
    const conflicts = [];
    for (const list of candidates.values()) {
        const sorted = [...list].sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || b.size - a.size);
        const pick = sorted[0];
        const distinct = [...new Set(list.map((x) => x.group))];
        if (distinct.length > 1) conflicts.push({ name: pick.member.name, chosen: pick.group, others: distinct.filter((g) => g !== pick.group) });
        // 同一人的所有頻道都帶上（任一個對到資料庫就掛上）
        const youtube = list.map((x) => x.member.YouTube?.id).find(Boolean) ?? null;
        const twitch = list.map((x) => x.member.Twitch?.id).find(Boolean);
        const arr = assignments.get(pick.group) ?? [];
        arr.push({ youtube, twitch: twitch ? String(twitch).toLowerCase() : null, name: pick.member.name, kind: pick.kind });
        assignments.set(pick.group, arr);
    }

    return { groups: [...groups.values()], assignments, collaborators, conflicts, missingNames };
}

/** 狀態修正（只收有媒體或官方出處的） */
export const STATUS_FIXES = [
    { youtubeName: '史黛菈 埃蕾諾亞', group: 'Limnos', activity: 'graduate', reason: 'Limnos 公告 2026-07-07 畢業' },
    { youtubeName: '夏蘿', group: 'Limnos', activity: 'graduate', reason: 'Limnos 公告 2025-12-31 畢業' },
];

/** 產生 migration SQL */
export function buildSql(plan, sourceGroups, header) {
    const out = [header.trimEnd(), ''];
    const upsertable = plan.groups.filter((g) => g.kind !== 'unverified');
    const unverified = plan.groups.filter((g) => g.kind === 'unverified');

    out.push('-- ===== 0. 套用前備份（回滾用；backup schema 不經 PostgREST 對外）=====');
    out.push('create schema if not exists backup;');
    out.push('revoke all on schema backup from public, anon, authenticated;');
    out.push('create table if not exists backup.vtuber_groups_20260929 as select * from public.vtuber_groups;');
    out.push('create table if not exists backup.vtubers_group_20260929 as select id, group_id, activity from public.vtubers;');
    out.push('');
    out.push('-- ===== 1. 團體（查證過的覆蓋；未查證的已存在就不動）=====');
    for (const g of upsertable) {
        out.push(
            `insert into public.vtuber_groups (name, nationality, kind, verified_at, source_url, note) values (${q(g.name)}, 'TW', ${q(g.kind)}, ${qn(g.verified_at)}, ${qn(g.source_url)}, ${qn(g.note)})`
            + `\n    on conflict (name) do update set kind = excluded.kind, verified_at = excluded.verified_at, source_url = excluded.source_url, note = excluded.note, nationality = coalesce(public.vtuber_groups.nationality, excluded.nationality);`,
        );
    }
    if (unverified.length) {
        out.push('insert into public.vtuber_groups (name, nationality, kind) values');
        out.push(unverified.map((g) => `    (${q(g.name)}, 'TW', 'unverified')`).join(',\n'));
        out.push('    on conflict (name) do nothing;');
    }
    out.push('');
    out.push('-- ===== 2. 子團 → 所屬公司 =====');
    for (const g of plan.groups.filter((x) => x.parent)) {
        const parentId = `(select id from public.vtuber_groups where name = ${q(g.parent)})`;
        out.push(`update public.vtuber_groups set parent_id = ${parentId} where name = ${q(g.name)} and parent_id is distinct from ${parentId};`);
    }
    out.push('');
    out.push('-- ===== 3. 成員（YouTube 頻道 ID／Twitch login 比對；只改有變的列）=====');
    const names = [...plan.assignments.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    for (const name of names) {
        const list = plan.assignments.get(name);
        const yt = list.map((m) => m.youtube).filter(Boolean);
        const tw = list.map((m) => m.twitch).filter(Boolean);
        const conds = [];
        if (yt.length) conds.push(`v.youtube_channel_id in (${yt.map(q).join(', ')})`);
        if (tw.length) conds.push(`lower(v.twitch_channel_id) in (${tw.map(q).join(', ')})`);
        if (!conds.length) continue;
        // 未查證的團體不覆蓋人工結果：只動目前沒有團體、或目前所屬也是未查證團體的人
        const guard = list[0]?.kind === 'unverified'
            ? ` and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified'))`
            : '';
        out.push(`-- ${name}（${list.length}）`);
        out.push(`update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.name = ${q(name)} and (${conds.join(' or ')}) and v.group_id is distinct from g.id${guard};`);
    }
    out.push('');
    out.push('-- ===== 4. 合作藝人：不掛團（目前掛在該團的解除）=====');
    for (const c of plan.collaborators) {
        const where = c.member?.YouTube?.id
            ? `youtube_channel_id = ${q(c.member.YouTube.id)}`
            : `name = ${q(c.name)}`;
        out.push(`update public.vtubers set group_id = null where ${where} and group_id = (select id from public.vtuber_groups where name = ${q(c.group)});`);
    }
    out.push('');
    out.push('-- ===== 5. 狀態修正（有媒體或官方出處）=====');
    for (const f of STATUS_FIXES) {
        const g = sourceGroups.find((x) => x.name === f.group);
        const m = g && twMembers(g).find((x) => x.name === f.youtubeName);
        if (!m?.YouTube?.id) continue;
        out.push(`-- ${f.youtubeName}：${f.reason}`);
        out.push(`update public.vtubers set activity = ${q(f.activity)} where youtube_channel_id = ${q(m.YouTube.id)} and activity is distinct from ${q(f.activity)};`);
    }
    out.push('');
    out.push('-- ===== 6. 成員數校正（之後由 trigger vtubers_group_member_count 維護）=====');
    out.push('update public.vtuber_groups g set member_count = coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0)');
    out.push('where g.member_count is distinct from coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0);');
    out.push('');
    return out.join('\n');
}

function main() {
    const outArg = process.argv.indexOf('--out');
    const outPath = outArg > 0 ? resolve(process.argv[outArg + 1]) : null;
    // 來源資料夾沒有進 git（只在主工作區）；worktree 裡用 --source 指定
    const srcArg = process.argv.indexOf('--source');
    const sourcePath = srcArg > 0 ? resolve(process.argv[srcArg + 1]) : resolve(ROOT, 'docs/TaiwanVTuberTrackingDataJson-master/api/v2/all/groups.json');
    const source = JSON.parse(readFileSync(sourcePath, 'utf8')).groups;
    const cls = JSON.parse(readFileSync(resolve(ROOT, 'scripts/data/tw-groups-2026-09.json'), 'utf8'));
    const plan = planGroups(source, cls);
    const header = `-- 台灣 VTuber 團體標籤（資料）。由 scripts/build-group-migration.mjs 產生，不要手改。
-- 成員：docs/TaiwanVTuberTrackingDataJson-master/api/v2/all/groups.json（2026-03 快照）
-- 分類：scripts/data/tw-groups-2026-09.json（2026-09-29 查證）；待確認事項見 scripts/data/tw-groups-pending.md
-- 依賴 20260929110000_vtuber_groups_kind.sql（kind／parent_id 欄位與 member_count trigger）
-- 部署順序：本檔 → Edge Function（snapshot 讀 kind／parent_id）→ 前端；避開排程時段（單一交易約 700 列 update）
-- 回滾（依第 0 段的備份還原）：
--   update public.vtubers v set group_id = b.group_id, activity = b.activity from backup.vtubers_group_20260929 b
--     where b.id = v.id and (v.group_id is distinct from b.group_id or v.activity is distinct from b.activity);
--   delete from public.vtuber_groups g where not exists (select 1 from backup.vtuber_groups_20260929 b where b.id = g.id);
--   update public.vtuber_groups g set kind = b.kind, parent_id = b.parent_id, verified_at = b.verified_at, source_url = b.source_url, note = b.note, member_count = b.member_count
--     from backup.vtuber_groups_20260929 b where b.id = g.id;
--   確認無誤後：drop table backup.vtuber_groups_20260929, backup.vtubers_group_20260929;`;
    const sql = buildSql(plan, source, header);
    const members = [...plan.assignments.values()].reduce((s, l) => s + l.length, 0);
    const kinds = plan.groups.reduce((acc, g) => ((acc[g.kind] = (acc[g.kind] ?? 0) + 1), acc), {});
    console.log('團體', plan.groups.length, kinds);
    console.log('掛團成員', members, '合作藝人', plan.collaborators.length, '重複所屬', plan.conflicts.length);
    for (const c of plan.conflicts) console.log(`  重複：${c.name} → ${c.chosen}（另見 ${c.others.join('、')}）`);
    if (plan.missingNames.length) console.log('分類檔有、來源沒有：', plan.missingNames.join('、'));
    if (outPath) {
        writeFileSync(outPath, sql, 'utf8');
        console.log('已寫入', outPath);
    }
    if (plan.missingNames.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
