// 由「企業勢逐家名冊」（已解析頻道）產生資料 migration。
//
// 用法：node scripts/build-agency-rosters.mjs --resolved <resolved.json> --groups <groups.json> --db <vtubers.json> --out <migration.sql> [--report <report.json>]
//   resolved：scripts/resolve-roster-channels.mjs 的輸出（成員多了 _twitch_id、_avatar、_db_id、_db_group_id、_db_activity、_unresolved）
//   groups：本地匯出的 vtuber_groups（id,name,parent_id,kind）；db：本地匯出的 vtubers（檢查同名）
//
// 規則（2026-09-29 使用者裁定＋code review 修正）：
//   - 逐家查證優先於第三方快照；本次沒查到的人不動
//   - 比對：YouTube 頻道 ID 或 Twitch login 任一符合（resolve 用 Twitch 比到的人，SQL 也要用 Twitch 找得到）；
//     頻道對不到但資料庫有同名且完全沒頻道的一列（_match_name）：以名字認人並補頻道
//   - 子團只為「有成員的」建立；名字撞到別家的團體 → 加公司名前綴，絕不搶走別家的團
//   - 既有成員：只在目前沒團體、或就在這家（含子團）時才改所屬／狀態；掛在別家的人列報告、不動
//   - 新成員：查得到頻道才新增；頻道或名字已存在就跳過並列報告（vtubers.name 有 UNIQUE）
//   - left_continues（離開公司但繼續活動）：只清這家的所屬、former_group_id＝頂層公司、原本不是 graduate 才維持 active
//   - status-unverified：只掛團，不改狀態與畢業日；date-approx：日期只是大概，不寫入
//   - 合作藝人：不掛團（掛在這家的解除）；官方頻道：標 is_official、掛公司、不新增
//   - 所有寫入只改有變的列，可重跑；套用前備份到 backup schema
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const CONTRIBUTED_BY = 'research:2026-09-29';
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const qn = (s) => (s == null || s === '' ? 'null' : q(s));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toActivity(status) {
    if (status === 'graduated') return 'graduate';
    if (status === 'preparing') return 'preparing';
    return 'active';
}

/** 研究代理在 sources 標了 status-unverified：狀態只是先填的，不拿來改既有資料 */
export const statusVerified = (m) => !(m.sources ?? []).includes('status-unverified');
/** 標了 date-approx：日期只知道年或月，不寫入（畫面會顯示成精確日期） */
const approx = (m) => (m.sources ?? []).includes('date-approx');
const exactDate = (m, d) => (!approx(m) && typeof d === 'string' && DATE_RE.test(d) ? d : null);

/** 成員在 SQL 裡的比對條件：YouTube 頻道 ID 或 Twitch login 任一符合 */
export function matchCond(m, alias = 'v') {
    const conds = [];
    if (m.youtube_channel_id) conds.push(`${alias}.youtube_channel_id = ${q(m.youtube_channel_id)}`);
    if (m.twitch_login) conds.push(`lower(${alias}.twitch_channel_id) = ${q(m.twitch_login.toLowerCase())}`);
    if (!conds.length) return null;
    return conds.length === 1 ? conds[0] : `(${conds.join(' or ')})`;
}

/** 這家公司（頂層）與其子團的 id 集合（SQL 子查詢） */
const topId = (agency) => `(select id from public.vtuber_groups where name = ${q(agency)} and parent_id is null)`;
const treeSql = (agency) => `(select id from public.vtuber_groups where id = ${topId(agency)} or parent_id = ${topId(agency)})`;

export function planRosters(resolved, existingGroups = [], dbRows = []) {
    const groupByName = new Map(existingGroups.map((g) => [g.name, g]));
    const dbNames = new Set(dbRows.map((r) => r.name));
    const subgroups = []; // { name, agency }
    const updates = []; // { m, target, agency }
    const inserts = []; // { m, target, agency }
    const collaborators = []; // { m, agency }
    const officials = []; // { m, agency }
    const reclassify = [];
    const report = { agencies: resolved.length, missingAgency: [], subgroupRenamed: [], otherGroup: [], nameTaken: [], noChannel: [], unresolved: [], duplicates: [] };
    const seen = new Map(); // 頻道鍵 → 公司（YouTube 與 Twitch 兩個鍵都登記）

    for (const a of resolved) {
        const top = groupByName.get(a.agency);
        if (!top || top.parent_id) {
            report.missingAgency.push(a.agency);
            continue;
        }
        if (a.reclassify) reclassify.push({ name: a.agency, kind: a.reclassify.kind, note: a.reclassify.note ?? null });
        const nonAgency = a.reclassify && a.reclassify.kind !== 'agency';
        const treeIds = new Set([top.id, ...existingGroups.filter((g) => g.parent_id === top.id).map((g) => g.id)]);

        // 子團：只為有成員的建立；撞到別家的團名 → 加公司名前綴
        const subName = new Map();
        for (const m of a.members ?? []) {
            if (!m.subgroup || nonAgency || m.collaborator || m.is_official_channel || m.subgroup === a.agency) continue;
            if (subName.has(m.subgroup)) continue;
            let name = m.subgroup;
            const g = groupByName.get(name);
            if (g && g.parent_id !== top.id) {
                name = `${a.agency} ${m.subgroup}`;
                report.subgroupRenamed.push(`${m.subgroup} → ${name}`);
                const g2 = groupByName.get(name);
                if (g2 && g2.parent_id !== top.id) {
                    report.subgroupRenamed.push(`${name} 仍撞名，成員改掛公司`);
                    subName.set(m.subgroup, null);
                    continue;
                }
            }
            subName.set(m.subgroup, name);
            subgroups.push({ name, agency: a.agency });
        }

        for (const m of a.members ?? []) {
            if (m._unresolved) report.unresolved.push(`${a.agency}/${m.name}：${m._unresolved}`);
            const target = (m.subgroup && subName.get(m.subgroup)) || a.agency;
            if (m.collaborator) {
                if (matchCond(m)) collaborators.push({ m, agency: a.agency });
                continue;
            }
            if (!matchCond(m)) {
                report.noChannel.push(`${a.agency}/${m.name}（${m.status ?? '?'}）`);
                continue;
            }
            const keys = [m.youtube_channel_id, m.twitch_login && `tw:${m.twitch_login.toLowerCase()}`].filter(Boolean);
            const dup = keys.find((k) => seen.has(k));
            if (dup) {
                report.duplicates.push(`${m.name}：${seen.get(dup)} 與 ${a.agency}（取先出現的）`);
                continue;
            }
            for (const k of keys) seen.set(k, a.agency);
            if (m.is_official_channel) {
                if (m._db_id) officials.push({ m, agency: a.agency });
                continue;
            }
            if (m._db_id) {
                // 目前掛在別家的人不動（例：已轉籍、或研究把轉個人勢寫成畢業），列報告給人確認
                if (!m.left_continues && m._db_group_id && !treeIds.has(m._db_group_id)) {
                    report.otherGroup.push(`${a.agency}/${m.name}（名冊寫 ${m.status}，資料庫目前在別的團體）`);
                    continue;
                }
                updates.push({ m, target, agency: a.agency });
            } else {
                if (dbNames.has(m.name)) {
                    report.nameTaken.push(`${a.agency}/${m.name}`);
                    continue;
                }
                inserts.push({ m, target, agency: a.agency });
            }
        }
    }
    return { subgroups, updates, inserts, collaborators, officials, reclassify, report };
}

export function buildRosterSql(plan, header) {
    const out = [header.trimEnd(), ''];
    out.push('-- ===== 0. 套用前備份（回滾用；backup schema 不經 PostgREST 對外）=====');
    out.push('create schema if not exists backup;');
    out.push('revoke all on schema backup from public, anon, authenticated;');
    out.push('create table if not exists backup.vtubers_rosters_20260929 as select id, group_id, former_group_id, is_official, activity, graduated_at, debut_date, youtube_channel_id, twitch_channel_id from public.vtubers;');
    out.push('create table if not exists backup.vtuber_groups_rosters_20260929 as select * from public.vtuber_groups;');
    out.push('create table if not exists backup.vtuber_channels_ids_20260929 as select id from public.vtuber_channels;');
    out.push('');

    out.push('-- ===== 1a. 重新分類（查證後不是企業勢）=====');
    for (const r of plan.reclassify ?? []) {
        out.push(`update public.vtuber_groups set kind = ${q(r.kind)}, note = ${qn(r.note)}, verified_at = '2026-09-29' where name = ${q(r.name)} and (kind is distinct from ${q(r.kind)} or note is distinct from ${qn(r.note)});`);
    }
    out.push('');
    out.push('-- ===== 1. 子團（parent＝所屬公司）：同名已存在就不動（不搶別家的團）=====');
    for (const s of plan.subgroups) {
        out.push(`insert into public.vtuber_groups (name, nationality, kind, parent_id, verified_at) select ${q(s.name)}, 'TW', 'agency', ${topId(s.agency)}, '2026-09-29' where ${topId(s.agency)} is not null on conflict (name) do nothing;`);
    }
    out.push('');

    out.push('-- ===== 2. 既有成員：所屬、狀態、畢業日、出道日（空的才補）、補另一個平台 =====');
    out.push('-- 目前沒團體、或就在這家（含子團）才改；成員要掛的團體必須屬於這家');
    for (const { m, target, agency } of plan.updates) {
        // 以名字認到的人（資料庫那列沒有任何頻道）：用名字＋「沒頻道」找，更新時一併補上頻道
        const cond = m._match_name ? `(v.name = ${q(m.name)} and v.youtube_channel_id is null and v.twitch_channel_id is null)` : matchCond(m);
        const verified = statusVerified(m);
        const left = m.left_continues === true;
        const act = left ? null : verified ? toActivity(m.status) : null;
        const grad = verified || left ? exactDate(m, m.graduation_date) : null;
        const debut = exactDate(m, m.debut_date);
        const tree = treeSql(agency);
        const sets = left
            ? [
                  `group_id = case when v.group_id in ${tree} then null else v.group_id end`,
                  `former_group_id = ${topId(agency)}`,
                  // 原本記引退的不改回 active（避免重新開始追蹤已引退的人）
                  `activity = case when v.activity = 'graduate' then v.activity else 'active' end`,
              ]
            : [`group_id = g.id`, act ? `activity = ${q(act)}` : `activity = v.activity`];
        sets.push(`graduated_at = ${grad ? `${q(grad)}::date` : 'v.graduated_at'}`);
        sets.push(`debut_date = coalesce(v.debut_date, ${debut ? `${q(debut)}::date` : 'null'})`);
        if (m.twitch_login) sets.push(`twitch_channel_id = coalesce(v.twitch_channel_id, ${q(m.twitch_login)})`);
        if (m.youtube_channel_id) sets.push(`youtube_channel_id = coalesce(v.youtube_channel_id, ${q(m.youtube_channel_id)})`);
        const changed = [
            left ? `v.group_id in ${tree} or v.former_group_id is distinct from ${topId(agency)} or v.activity not in ('active', 'graduate')` : `v.group_id is distinct from g.id`,
            act ? `v.activity is distinct from ${q(act)}` : null,
            grad ? `v.graduated_at is distinct from ${q(grad)}::date` : null,
            debut ? `v.debut_date is null` : null,
            m.twitch_login ? `v.twitch_channel_id is null` : null,
            m.youtube_channel_id ? `v.youtube_channel_id is null` : null,
        ].filter(Boolean);
        const scope = left ? '' : ` and (v.group_id is null or v.group_id in ${tree})`;
        out.push(`-- ${m.name}`);
        out.push(`update public.vtubers v set ${sets.join(', ')} from public.vtuber_groups g where g.name = ${q(target)} and g.id in ${tree} and ${cond}${scope} and (${changed.join(' or ')});`);
    }
    out.push('');

    out.push('-- ===== 2b. 官方頻道：標記 is_official、掛公司 =====');
    for (const { m, agency } of plan.officials ?? []) {
        out.push(`update public.vtubers v set is_official = true, group_id = coalesce(v.group_id, ${topId(agency)}) where ${matchCond(m)} and (v.group_id is null or v.group_id in ${treeSql(agency)}) and (v.is_official = false or v.group_id is null);`);
    }
    out.push('');

    out.push(`-- ===== 3. 新成員（contributed_by='${CONTRIBUTED_BY}'；slug 由 trigger 產生；頻道或名字已存在就跳過）=====`);
    for (const { m, target, agency } of plan.inserts) {
        const left = m.left_continues === true;
        const act = left ? 'active' : toActivity(m.status);
        const cols = `(name, nationality, activity, debut_date, graduated_at, youtube_channel_id, twitch_channel_id, img_url, group_id, former_group_id, contributed_by)`;
        const groupCols = left ? `null, ${topId(agency)}` : 'g.id, null';
        const vals = `select ${q(m.name)}, 'TW', ${q(act)}, ${qn(exactDate(m, m.debut_date))}::date, ${qn(exactDate(m, m.graduation_date))}::date, ${qn(m.youtube_channel_id)}, ${qn(m.twitch_login)}, ${qn(m._avatar)}, ${groupCols}, ${q(CONTRIBUTED_BY)} from public.vtuber_groups g where g.name = ${q(target)} and g.id in ${treeSql(agency)}`;
        const guard = `and not exists (select 1 from public.vtubers x where ${matchCond(m, 'x')} or x.name = ${q(m.name)})`;
        out.push(`-- ${m.name}（${target}）`);
        out.push(`insert into public.vtubers ${cols} ${vals} ${guard};`);
    }
    out.push('');

    out.push('-- ===== 4. 頻道表（週表名冊的來源）：本次涉及的成員缺哪個平台就補 =====');
    for (const { m } of [...plan.updates, ...plan.inserts]) {
        const who = matchCond(m, 'v');
        if (m.youtube_channel_id) {
            out.push(`insert into public.vtuber_channels (vtuber_id, platform, external_id, handle) select v.id, 'youtube', ${q(m.youtube_channel_id)}, ${q(m.youtube_channel_id)} from public.vtubers v where ${who} and not exists (select 1 from public.vtuber_channels c where c.platform = 'youtube' and c.external_id = ${q(m.youtube_channel_id)} and c.status = 'active') limit 1;`);
        }
        if (m.twitch_login && m._twitch_id) {
            out.push(`insert into public.vtuber_channels (vtuber_id, platform, external_id, handle) select v.id, 'twitch', ${q(m._twitch_id)}, ${q(m.twitch_login.toLowerCase())} from public.vtubers v where ${who} and not exists (select 1 from public.vtuber_channels c where c.platform = 'twitch' and c.status = 'active' and (c.external_id = ${q(m._twitch_id)} or lower(c.handle) = ${q(m.twitch_login.toLowerCase())})) limit 1;`);
        }
    }
    out.push('');

    out.push('-- ===== 5. 合作藝人：不掛團（目前掛在這家或其子團的解除）=====');
    for (const { m, agency } of plan.collaborators) {
        out.push(`update public.vtubers v set group_id = null where ${matchCond(m)} and v.group_id in ${treeSql(agency)};`);
    }
    out.push('');
    out.push('-- ===== 6. 成員數校正（之後由 trigger 維護）=====');
    out.push('update public.vtuber_groups g set member_count = coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0)');
    out.push('where g.member_count is distinct from coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0);');
    out.push('');
    return out.join('\n');
}

function main() {
    const arg = (n) => {
        const i = process.argv.indexOf(n);
        return i > 0 ? process.argv[i + 1] : null;
    };
    const resolved = JSON.parse(readFileSync(resolve(arg('--resolved')), 'utf8'));
    const groups = arg('--groups') ? JSON.parse(readFileSync(resolve(arg('--groups')), 'utf8')) : [];
    const db = arg('--db') ? JSON.parse(readFileSync(resolve(arg('--db')), 'utf8')) : [];
    const plan = planRosters(resolved, groups, db);
    const header = `-- 企業勢逐家名冊（含畢業）。由 scripts/build-agency-rosters.mjs 產生，不要手改。
-- 來源：scripts/data/tw-agency-rosters-2026-09.json（2026-09-29 逐家查證，每位成員附出處）
-- 依賴：20260929110000（kind／parent_id）、20260929120000（graduated_at／former_group_id／is_official）
-- 部署順序：本檔 → Edge Function → 前端；避開排程時段
-- 回滾（依第 0 段備份）：
--   delete from public.vtubers where contributed_by = '${CONTRIBUTED_BY}';
--   delete from public.vtuber_channels c where not exists (select 1 from backup.vtuber_channels_ids_20260929 b where b.id = c.id);
--   update public.vtubers v set group_id = b.group_id, former_group_id = b.former_group_id, is_official = b.is_official, activity = b.activity, graduated_at = b.graduated_at,
--     debut_date = b.debut_date, youtube_channel_id = b.youtube_channel_id, twitch_channel_id = b.twitch_channel_id from backup.vtubers_rosters_20260929 b where b.id = v.id;
--   delete from public.vtuber_groups g where not exists (select 1 from backup.vtuber_groups_rosters_20260929 b where b.id = g.id);
--   update public.vtuber_groups g set kind = b.kind, parent_id = b.parent_id, verified_at = b.verified_at, note = b.note, member_count = b.member_count
--     from backup.vtuber_groups_rosters_20260929 b where b.id = g.id;`;
    const sql = buildRosterSql(plan, header);
    const r = plan.report;
    console.log(JSON.stringify({
        agencies: r.agencies,
        subgroups: plan.subgroups.length,
        updates: plan.updates.length,
        inserts: plan.inserts.length,
        officials: plan.officials.length,
        collaborators: plan.collaborators.length,
        noChannel: r.noChannel.length,
        unresolved: r.unresolved.length,
        otherGroup: r.otherGroup,
        nameTaken: r.nameTaken,
        subgroupRenamed: r.subgroupRenamed,
        missingAgency: r.missingAgency,
        duplicates: r.duplicates,
    }, null, 1));
    const outPath = arg('--out');
    if (outPath) writeFileSync(resolve(outPath), sql, 'utf8');
    const rep = arg('--report');
    if (rep) writeFileSync(resolve(rep), JSON.stringify(r, null, 2) + '\n', 'utf8');
    if (r.missingAgency.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('build-agency-rosters.mjs')) main();
