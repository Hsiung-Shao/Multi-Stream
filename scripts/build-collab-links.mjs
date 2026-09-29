// 企業勢子團名稱修正＋合作藝人（2026-09-30 使用者要求：「團體旗下的藝人團名稱要正確且完整」、
// 「合作藝人直接併進團體裡，但是標記為合作」）→ supabase/migrations/20260930100100_vtuber_collab_links.sql
//
// 用法：node scripts/build-collab-links.mjs --resolved <resolved.json> --groups <vtuber_groups.json> --db <vtubers.json> --out <sql> [--report <json>]
//   resolved：scripts/data/tw-agency-collabs-2026-09.json 經 resolve-roster-channels.mjs 解析後的結果
//            （每家 { agency, subgroups[], members[]＝合作藝人 }；members 帶 _db_id／_twitch_id／_avatar）
//   groups／db：本地匯出的 vtuber_groups（id,name,parent_id,kind）與 vtubers（id,name,group_id）
//
// 規則：
//   - 子團：rename 以「公司＋舊名」定位改名（id 不變）；新名已被別的團體用掉 → 不改、列報告
//           add 建立（即使成員暫時沒頻道，團名要完整）；新名撞到別家的團 → 加公司名前綴
//           not_subgroup 只在沒有任何人（所屬、前所屬、合作）指向它時刪除，否則列報告
//   - 子團成員：依官方名單把人從公司層／本家其他子團移到正確子團（已解散的團不搬）；只動目前在本家（含子團）的人，
//               或完全沒有團體、沒有前所屬、名字全資料庫唯一的人；
//               同一人列在多個子團時取第一個 unit（沒有 unit 取第一個），列報告
//   - 只有期別的團名（一期生）加公司名前綴：各家都有，團名全域唯一
//   - 合作：只收 verdict=confirmed 且狀態明確（active／ended）；目前已是本家正式成員的不加（交人工確認）；掛頂層公司；既有藝人以 id 加關係（名字完全不像的不加、列報告）；
//           資料庫沒有、查得到頻道 → 新增藝人（不設 group_id）＋頻道表＋關係；查不到頻道只列報告；
//           ended 但沒有結束日 → 不加（無法標示「曾合作」的時間），列報告
//   - 可重跑：第二次套用零變動（改名、建團、搬人、關係都有「已是目標狀態就跳過」的條件）
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { q, qn, topId, treeSql, matchCond, looksLikeSamePerson, commentSafe } from './build-agency-rosters.mjs';

export const CONTRIBUTED_BY = 'research:2026-09-30';
export const VERIFIED_AT = '2026-09-30';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateOrNull = (d) => (typeof d === 'string' && DATE_RE.test(d) ? d : null);

/** 只有期別的團名（一期生、Oblivion期生）各家都有：團名全域唯一，一律加公司名 */
const GENERATION_ONLY = /^\S*期生?$/u;
export function subgroupName(agency, official) {
    return GENERATION_ONLY.test(official) && !official.includes(agency) ? `${agency} ${official}` : official;
}

/** 子團在 SQL 裡的定位：屬於這家公司、叫這個名字 */
const subgroupSql = (agency, name) => `(select id from public.vtuber_groups where name = ${q(name)} and parent_id = ${topId(agency)})`;

export function planCollabs(research, groups = [], dbRows = []) {
    const tops = new Map(groups.filter((g) => !g.parent_id).map((g) => [g.name, g]));
    const byName = new Map(groups.map((g) => [g.name, g]));
    const report = {
        missingAgency: [],
        renamed: [],
        renameConflict: [],
        renameMissing: [],
        added: [],
        addRenamed: [],
        deleted: [],
        multiSubgroup: [],
        memberMissing: [],
        memberByNameOnly: [],
        collabNoSource: [],
        collabStatusUnknown: [],
        collabAlreadyMember: [],
        collabIsMember: [],
        collabNoChannel: [],
        collabEndedNoDate: [],
        collabNameMismatch: [],
        collabNameTaken: [],
        collabAmbiguous: [],
        multiAgencyCollab: [],
    };
    const renames = [];
    const adds = [];
    const deletes = [];
    const moves = [];
    const links = [];
    const inserts = [];
    const taken = new Set(groups.map((g) => g.name));
    const collabAgencies = new Map();

    for (const a of research) {
        const top = tops.get(a.agency);
        if (!top) {
            report.missingAgency.push(a.agency);
            continue;
        }
        const childOf = (name) => {
            const g = byName.get(name);
            return g && g.parent_id === top.id ? g : null;
        };
        // 1. 子團名稱
        const finalName = new Map(); // research 的 official_name → 實際寫入的名稱
        for (const sg of a.subgroups ?? []) {
            const official = subgroupName(a.agency, (sg.official_name ?? '').trim());
            if (!official) continue;
            if (sg.verdict === 'not_subgroup') {
                if (sg.db_name && childOf(sg.db_name)) {
                    deletes.push({ agency: a.agency, name: sg.db_name });
                    report.deleted.push(`${a.agency}/${sg.db_name}`);
                }
                continue;
            }
            if (sg.verdict === 'rename' && sg.db_name && sg.db_name !== official) {
                if (!childOf(sg.db_name)) {
                    report.renameMissing.push(`${a.agency}/${sg.db_name}`);
                    finalName.set(official, childOf(official) ? official : null);
                    continue;
                }
                if (taken.has(official)) {
                    report.renameConflict.push(`${a.agency}/${sg.db_name} → ${official}（名稱已被使用）`);
                    finalName.set(official, sg.db_name);
                    continue;
                }
                renames.push({ agency: a.agency, from: sg.db_name, to: official });
                report.renamed.push(`${a.agency}/${sg.db_name} → ${official}`);
                taken.delete(sg.db_name);
                taken.add(official);
                finalName.set(official, official);
                continue;
            }
            const existing = childOf(sg.db_name ?? '') ?? childOf(official);
            if (existing) {
                finalName.set(official, existing.name);
                continue;
            }
            // add（或 ok 但資料庫沒有）：名稱撞到別家的團 → 加公司名前綴
            let name = official;
            if (taken.has(name)) {
                name = `${a.agency} ${official}`;
                report.addRenamed.push(`${official} → ${name}`);
            }
            if (taken.has(name)) {
                report.renameConflict.push(`${a.agency}/${official}（加前綴後仍撞名）`);
                continue;
            }
            taken.add(name);
            adds.push({ agency: a.agency, name });
            report.added.push(`${a.agency}/${name}`);
            finalName.set(official, name);
        }

        // 2. 子團成員：同一人只能一個 group_id → 第一個 unit 優先
        const inTree = new Set(groups.filter((g) => g.id === top.id || g.parent_id === top.id).map((g) => g.id));
        // 本家（含子團）的人；再加上「沒有任何團體、也沒有前所屬、名字全資料庫唯一」的人（例：Mojoy 已畢業成員當初沒掛團）
        const nameCount = new Map();
        for (const v of dbRows) nameCount.set(v.name, (nameCount.get(v.name) ?? 0) + 1);
        const dbInTree = new Map(
            dbRows.filter((v) => inTree.has(v.group_id) || (!v.group_id && !v.former_group_id && nameCount.get(v.name) === 1)).map((v) => [v.name, v]),
        );
        const assigned = new Map();
        const ordered = [...(a.subgroups ?? [])].sort((x, y) => Number(x.kind !== 'unit') - Number(y.kind !== 'unit'));
        for (const sg of ordered) {
            // 已解散的團（例：Limnos 的 NKshoujo 合併後成員改為公司直屬）保留團名，但不往裡面搬人
            if (sg.verdict === 'not_subgroup' || sg.status === 'disbanded') continue;
            const target = finalName.get(subgroupName(a.agency, (sg.official_name ?? '').trim()));
            if (!target) continue;
            for (const name of sg.members ?? []) {
                if (assigned.has(name)) {
                    if (assigned.get(name) !== target) report.multiSubgroup.push(`${a.agency}/${name}：${assigned.get(name)}（另列 ${target}）`);
                    continue;
                }
                assigned.set(name, target);
                if (!dbInTree.has(name)) {
                    report.memberMissing.push(`${a.agency}/${target}/${name}`);
                    continue;
                }
                const row = dbInTree.get(name);
                // 不在本家、只靠「名字全資料庫唯一」認出來的人：上正式站前要人工核對
                if (!inTree.has(row.group_id)) report.memberByNameOnly.push(`${a.agency}/${target}/${name}`);
                moves.push({ agency: a.agency, target, id: row.id, name });
            }
        }

        // 3. 合作藝人
        for (const m of a.members ?? a.collaborators ?? []) {
            const label = `${a.agency}/${m.name}`;
            if (m.verdict === 'is_member') {
                report.collabIsMember.push(label);
                continue;
            }
            if (m.verdict !== 'confirmed') {
                report.collabNoSource.push(label);
                continue;
            }
            // 狀態沒填（官方名單已不見、又沒有終止公告）：無法判斷是否仍在合作
            if (m.status !== 'active' && m.status !== 'ended') {
                report.collabStatusUnknown.push(label);
                continue;
            }
            // 資料庫記為本家正式成員、官方卻列為合作：不動主所屬，也不重複加合作，交人工確認
            const dbRow = m._db_id ? dbRows.find((v) => v.id === m._db_id) : null;
            if (dbRow && groups.some((g) => g.id === dbRow.group_id && (g.id === top.id || g.parent_id === top.id))) {
                report.collabAlreadyMember.push(label);
                continue;
            }
            const until = dateOrNull(m.until);
            if (m.status === 'ended' && !until) {
                report.collabEndedNoDate.push(label);
                continue;
            }
            const link = { agency: a.agency, m, since: dateOrNull(m.since), until, source: (m.sources ?? [])[0] ?? null };
            if (m._db_id) {
                if (!m._match_name && m._db_name && !looksLikeSamePerson(m._db_name, [m.name, ...(m.aliases ?? [])])) {
                    report.collabNameMismatch.push(`${label}（資料庫同頻道的是「${m._db_name}」）`);
                    continue;
                }
                links.push(link);
            } else if (matchCond(m)) {
                // 新增前先在匯出資料確認：同名的人已存在（SQL 會跳過新增，關係也就掛不上）、或頻道對到不同人 → 列報告不做
                const hits = new Set(
                    dbRows
                        .filter((v) => (m.youtube_channel_id && v.youtube_channel_id === m.youtube_channel_id) || (m.twitch_login && v.twitch_channel_id?.toLowerCase() === m.twitch_login.toLowerCase()))
                        .map((v) => v.id),
                );
                if (hits.size > 1) {
                    report.collabAmbiguous.push(`${label}（YouTube 與 Twitch 對到不同人）`);
                    continue;
                }
                if (!hits.size && dbRows.some((v) => v.name === m.name)) {
                    report.collabNameTaken.push(label);
                    continue;
                }
                inserts.push(link);
            } else {
                report.collabNoChannel.push(label);
                continue;
            }
            const key = m._db_id ?? matchCond(m);
            collabAgencies.set(key, [...(collabAgencies.get(key) ?? []), a.agency]);
        }
    }
    for (const [key, list] of collabAgencies) {
        if (list.length > 1) {
            const who = [...links, ...inserts].find((l) => (l.m._db_id ?? matchCond(l.m)) === key)?.m.name ?? key;
            report.multiAgencyCollab.push(`${who}：${list.join('、')}`);
        }
    }
    return { renames, adds, deletes, moves, links, inserts, report };
}

const linkValues = (l, who) =>
    `select ${who}, ${topId(l.agency)}, 'collaborator', ${qn(l.since)}::date, ${qn(l.until)}::date, ${qn(l.source)}, '${VERIFIED_AT}'::date`;
const linkUpsert =
    'on conflict (vtuber_id, group_id, role) do update set since = excluded.since, until = excluded.until, source_url = excluded.source_url' +
    ' where (vtuber_group_links.since, vtuber_group_links.until, vtuber_group_links.source_url) is distinct from (excluded.since, excluded.until, excluded.source_url)';

export function buildCollabSql(plan, header) {
    const out = [header.trimEnd(), ''];
    out.push('-- ===== 0. 套用前備份（回滾用；上次的備份還在就停，避免回滾還原到錯的快照）=====');
    out.push("do $$ begin if to_regclass('backup.collab_meta_20260930') is not null then raise exception '已有 backup.collab_meta_20260930：確認後 drop 第 0 段的 backup 表再重新套用'; end if; end $$;");
    out.push('create schema if not exists backup;');
    out.push('revoke all on schema backup from public, anon, authenticated;');
    out.push('create table backup.vtubers_collab_20260930 as select id, group_id from public.vtubers;');
    out.push('create table backup.vtuber_groups_collab_20260930 as select * from public.vtuber_groups;');
    out.push('create table backup.vtuber_channels_ids_collab_20260930 as select id from public.vtuber_channels;');
    out.push('create table backup.collab_meta_20260930 as select now() as applied_at;');
    // 回滾只還原本檔搬過的人、只刪本檔補建的團（套用後其他流程的改動不受影響）
    const ids = plan.moves.map((m) => q(m.id)).join(', ');
    const names = plan.adds.map((a) => q(a.name)).join(', ');
    out.push(`create table backup.collab_moves_20260930 as select unnest(array[${ids}]::uuid[]) as id;`);
    out.push(`create table backup.collab_added_groups_20260930 as select unnest(array[${names}]::text[]) as name;`);
    out.push('');

    out.push('-- ===== 1. 子團改名（公司＋舊名定位，id 不變；新名已被用掉的不改）=====');
    for (const r of plan.renames) {
        out.push(`update public.vtuber_groups set name = ${q(r.to)}, verified_at = '${VERIFIED_AT}' where name = ${q(r.from)} and parent_id = ${topId(r.agency)} and not exists (select 1 from public.vtuber_groups x where x.name = ${q(r.to)});`);
    }
    out.push('');
    out.push('-- ===== 2. 補建官方子團（成員暫時沒頻道也建，團名要完整）=====');
    for (const s of plan.adds) {
        out.push(`insert into public.vtuber_groups (name, nationality, kind, parent_id, verified_at) select ${q(s.name)}, 'TW', 'agency', ${topId(s.agency)}, '${VERIFIED_AT}' where ${topId(s.agency)} is not null on conflict (name) do nothing;`);
    }
    out.push('');
    out.push('-- ===== 3. 刪除誤列的子團（只刪沒有任何人指向的）=====');
    for (const d of plan.deletes) {
        const id = subgroupSql(d.agency, d.name);
        out.push(
            `delete from public.vtuber_groups g where g.id = ${id} and not exists (select 1 from public.vtubers v where v.group_id = g.id or v.former_group_id = g.id) and not exists (select 1 from public.vtuber_group_links l where l.group_id = g.id) and not exists (select 1 from public.vtuber_groups c where c.parent_id = g.id);`,
        );
    }
    out.push('');
    out.push('-- ===== 4. 子團成員對齊（只動目前在本家或其子團、或完全沒有團體的人）=====');
    for (const mv of plan.moves) {
        out.push(`-- ${commentSafe(mv.name)} → ${commentSafe(mv.target)}`);
        out.push(
            `update public.vtubers v set group_id = g.id from public.vtuber_groups g where g.id = ${subgroupSql(mv.agency, mv.target)} and v.id = ${q(mv.id)} and (v.group_id in ${treeSql(mv.agency)} or (v.group_id is null and v.former_group_id is null)) and v.group_id is distinct from g.id;`,
        );
    }
    out.push('');

    out.push('-- ===== 5. 合作：既有藝人加關係（掛頂層公司）=====');
    for (const l of plan.links) {
        out.push(`-- ${commentSafe(l.m.name)}（${commentSafe(l.agency)}）`);
        out.push(
            `insert into public.vtuber_group_links (vtuber_id, group_id, role, since, until, source_url, verified_at) ${linkValues(l, `v.id`)} from public.vtubers v where v.id = ${q(l.m._db_id)} and ${topId(l.agency)} is not null ${linkUpsert};`,
        );
    }
    out.push('');
    out.push(`-- ===== 6. 合作：新增藝人（不設 group_id；contributed_by='${CONTRIBUTED_BY}'；頻道或名字已存在就跳過）＋頻道表＋關係 =====`);
    for (const l of plan.inserts) {
        const m = l.m;
        out.push(`-- ${commentSafe(m.name)}（${commentSafe(l.agency)}）`);
        out.push(
            `insert into public.vtubers (name, nationality, activity, youtube_channel_id, twitch_channel_id, img_url, contributed_by) select ${q(m.name)}, 'TW', 'active', ${qn(m.youtube_channel_id)}, ${qn(m.twitch_login)}, ${qn(m._avatar)}, ${q(CONTRIBUTED_BY)} where not exists (select 1 from public.vtubers x where ${matchCond(m, 'x')} or x.name = ${q(m.name)});`,
        );
        if (m.youtube_channel_id) {
            out.push(
                `insert into public.vtuber_channels (vtuber_id, platform, external_id, handle) select v.id, 'youtube', ${q(m.youtube_channel_id)}, ${q(m.youtube_channel_id)} from public.vtubers v where ${matchCond(m, 'v')} and not exists (select 1 from public.vtuber_channels c where c.platform = 'youtube' and c.external_id = ${q(m.youtube_channel_id)} and c.status = 'active') limit 1;`,
            );
        }
        if (m.twitch_login && m._twitch_id) {
            out.push(
                `insert into public.vtuber_channels (vtuber_id, platform, external_id, handle) select v.id, 'twitch', ${q(m._twitch_id)}, ${q(m.twitch_login.toLowerCase())} from public.vtubers v where ${matchCond(m, 'v')} and not exists (select 1 from public.vtuber_channels c where c.platform = 'twitch' and c.status = 'active' and (c.external_id = ${q(m._twitch_id)} or lower(c.handle) = ${q(m.twitch_login.toLowerCase())})) limit 1;`,
            );
        }
        out.push(
            `insert into public.vtuber_group_links (vtuber_id, group_id, role, since, until, source_url, verified_at) ${linkValues(l, 'v.id')} from public.vtubers v where ${matchCond(m, 'v')} and ${topId(l.agency)} is not null limit 1 ${linkUpsert};`,
        );
    }
    out.push('');
    out.push('-- ===== 6b. 檢查：新增的合作藝人都有掛上關係（同名或頻道被別人用掉時 SQL 會跳過，這裡發出警告）=====');
    for (const l of plan.inserts) {
        out.push(
            `do $$ begin if not exists (select 1 from public.vtuber_group_links l join public.vtubers v on v.id = l.vtuber_id where ${matchCond(l.m, 'v')} and l.group_id = ${topId(l.agency)}) then raise warning '合作藝人 % 沒有掛上 %（同名或頻道已被使用）', ${q(l.m.name)}, ${q(l.agency)}; end if; end $$;`,
        );
    }
    out.push('');
    out.push('-- ===== 7. 成員數校正（刪團、搬人後；之後由 trigger 維護）=====');
    out.push('update public.vtuber_groups g set member_count = coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0)');
    out.push('where g.member_count is distinct from coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0);');
    out.push('');
    return out.join('\n');
}

/** migration 檔頭：依賴、套用前提與回滾（測試會檢查回滾 SQL） */
export const COLLAB_HEADER = `-- 企業勢子團名稱修正＋合作藝人。由 scripts/build-collab-links.mjs 產生，不要手改。
-- 來源：scripts/data/tw-agency-collabs-2026-09.json（2026-09-30 逐家查證，子團名與合作藝人皆附官方出處）
-- 依賴：20260929120100（企業勢名冊）、20260930100000（vtuber_group_links）
-- **須單一交易套用**（apply_migration 或 psql -1）：回滾靠 created_at＝交易開始時間辨識本檔新增的列。
-- 各段敘述都是「已是目標狀態就跳過」；整份重新套用前先依下方回滾、drop 第 0 段的 6 張 backup 表（第 0 段偵測到舊備份會直接中止）。
-- 正式站套用前先確認第 4、5 段的 v.id 都存在（id 取自本地匯出的正式站資料）。
-- 回滾（依第 0 段備份）：
--   delete from public.vtuber_group_links l where l.created_at = (select applied_at from backup.collab_meta_20260930);
--   delete from public.vtubers where contributed_by = '${CONTRIBUTED_BY}';
--   delete from public.vtuber_channels c where c.created_at = (select applied_at from backup.collab_meta_20260930) and not exists (select 1 from backup.vtuber_channels_ids_collab_20260930 b where b.id = c.id);
--   insert into public.vtuber_groups select b.* from backup.vtuber_groups_collab_20260930 b where not exists (select 1 from public.vtuber_groups g where g.id = b.id);
--   update public.vtubers v set group_id = b.group_id from backup.vtubers_collab_20260930 b where b.id = v.id and v.id in (select id from backup.collab_moves_20260930) and v.group_id is distinct from b.group_id;
--   delete from public.vtuber_groups g where g.name in (select name from backup.collab_added_groups_20260930) and not exists (select 1 from backup.vtuber_groups_collab_20260930 b where b.id = g.id);
--   update public.vtuber_groups g set name = b.name, verified_at = b.verified_at from backup.vtuber_groups_collab_20260930 b where b.id = g.id and (g.name, g.verified_at) is distinct from (b.name, b.verified_at);
--   （member_count 由 trigger 隨 group_id 還原自動回到原值）`;

function main() {
    const arg = (n) => {
        const i = process.argv.indexOf(n);
        return i > 0 ? process.argv[i + 1] : null;
    };
    const file = JSON.parse(readFileSync(resolve(arg('--resolved')), 'utf8'));
    const research = Array.isArray(file) ? file : file.agencies;
    const groups = JSON.parse(readFileSync(resolve(arg('--groups')), 'utf8'));
    const db = arg('--db') ? JSON.parse(readFileSync(resolve(arg('--db')), 'utf8')) : [];
    const plan = planCollabs(research, groups, db);
    const r = plan.report;
    console.log(
        JSON.stringify(
            { renames: plan.renames.length, adds: plan.adds.length, deletes: plan.deletes.length, moves: plan.moves.length, links: plan.links.length, inserts: plan.inserts.length, ...r },
            null,
            1,
        ),
    );
    const outPath = arg('--out');
    if (outPath) writeFileSync(resolve(outPath), buildCollabSql(plan, COLLAB_HEADER), 'utf8');
    const rep = arg('--report');
    if (rep) writeFileSync(resolve(rep), JSON.stringify(r, null, 2) + '\n', 'utf8');
    if (r.missingAgency.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('build-collab-links.mjs')) main();
