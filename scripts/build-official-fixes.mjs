// 依官網標示調整資料庫 → supabase/migrations/20260930110000_vtuber_official_fixes.sql
// 2026-09-30 使用者：「古德文創那就全部標記為合作藝人」「依據官網所標示的調整當前資料庫的資料進行更新」
//
// 用法：node scripts/build-official-fixes.mjs --data scripts/data/tw-official-fixes-2026-09.json --out <sql>
//
// 規則：
//   - collab_convert：正式所屬改成合作（主所屬只在「目前就是這家或其子團」時清空；合作關係掛頂層公司）
//   - departures：官網或本人官方帳號明確標示離開 → activity=graduate；只有官方精確日期才寫 graduated_at
//   - new_members：官網有、資料庫沒有，且查得到頻道 → 新增並掛官方子團（頻道或名字已存在就跳過）
//   - 既有成員以資料庫 id 定位，並附「目前狀態」條件，重跑零變動、不蓋掉之後其他流程的修改
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { q, qn, topId, treeSql, commentSafe } from './build-agency-rosters.mjs';

export const CONTRIBUTED_BY = 'official:2026-09-30';
export const VERIFIED_AT = '2026-09-30';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 資料檔檢查：id 格式、新成員要有頻道、日期格式；有問題直接丟錯（不產生半套 SQL） */
export function validate(data) {
    const errors = [];
    for (const c of data.collab_convert ?? []) if (!UUID_RE.test(c.id ?? '')) errors.push(`collab_convert ${c.name}: id 格式錯誤`);
    for (const d of data.departures ?? []) {
        if (!UUID_RE.test(d.id ?? '')) errors.push(`departures ${d.name}: id 格式錯誤`);
        if (d.left_date != null && !DATE_RE.test(d.left_date)) errors.push(`departures ${d.name}: 日期格式錯誤`);
    }
    for (const m of data.new_members ?? []) {
        if (!m.youtube_channel_id && !m.twitch_login) errors.push(`new_members ${m.name}: 沒有頻道不能新增`);
        if (!m.agency) errors.push(`new_members ${m.name}: 缺所屬公司`);
    }
    if (errors.length) throw new Error(errors.join('；'));
    return data;
}

const memberMatch = (m, alias) => {
    const c = [];
    if (m.youtube_channel_id) c.push(`${alias}.youtube_channel_id = ${q(m.youtube_channel_id)}`);
    if (m.twitch_login) c.push(`lower(${alias}.twitch_channel_id) = ${q(m.twitch_login.toLowerCase())}`);
    return c.length === 1 ? c[0] : `(${c.join(' or ')})`;
};

export function buildOfficialSql(data, header) {
    validate(data);
    // 每位既有成員本檔預期寫入的新值：回滾只還原「目前仍是新值」的欄位，之後被別人改過的不動
    const expect = [
        ...(data.collab_convert ?? []).map((c) => `(${q(c.id)}::uuid, true, null::text, null::date)`),
        ...(data.departures ?? []).map((d) => `(${q(d.id)}::uuid, false, 'graduate', ${qn(d.left_date)}::date)`),
    ];
    const out = [header.trimEnd(), ''];
    out.push('-- ===== 0. 套用前備份（回滾用；上次的備份還在就停）=====');
    out.push("do $$ begin if to_regclass('backup.official_meta_20260930') is not null then raise exception '已有 backup.official_meta_20260930：確認後 drop 第 0 段的 backup 表再重新套用'; end if; end $$;");
    out.push('create schema if not exists backup;');
    out.push('revoke all on schema backup from public, anon, authenticated;');
    out.push(
        `create table backup.vtubers_official_20260930 as select v.id, v.group_id, v.activity, v.graduated_at, e.clears_group, e.new_activity, e.new_graduated_at from public.vtubers v join (values ${expect.length ? expect.join(', ') : '(null::uuid, false, null::text, null::date)'}) as e(id, clears_group, new_activity, new_graduated_at) on e.id = v.id;`,
    );
    out.push('create table backup.vtuber_channels_ids_official_20260930 as select id from public.vtuber_channels;');
    out.push('create table backup.official_meta_20260930 as select now() as applied_at;');
    out.push('');

    out.push('-- ===== 1. 正式所屬改成合作（主所屬只在目前就是這家時清空；合作掛頂層公司）=====');
    for (const c of data.collab_convert ?? []) {
        out.push(`-- ${commentSafe(c.name)}（${commentSafe(c.agency)}）`);
        // 主所屬已在別家：合作照加、主所屬不動，但提醒人工確認（資料可能與官網不符）
        out.push(
            `do $$ begin if exists (select 1 from public.vtubers v where v.id = ${q(c.id)} and v.group_id is not null and v.group_id not in ${treeSql(c.agency)}) then raise warning '% 目前掛在別的團體，主所屬沒有清空', ${q(c.name)}; end if; end $$;`,
        );
        out.push(
            `insert into public.vtuber_group_links (vtuber_id, group_id, role, source_url, verified_at) select v.id, ${topId(c.agency)}, 'collaborator', ${qn(c.source)}, '${VERIFIED_AT}'::date from public.vtubers v where v.id = ${q(c.id)} and ${topId(c.agency)} is not null on conflict (vtuber_id, group_id, role) do nothing;`,
        );
        out.push(`update public.vtubers v set group_id = null where v.id = ${q(c.id)} and v.group_id in ${treeSql(c.agency)};`);
    }
    out.push('');

    out.push('-- ===== 2. 官網標示離開 → 已畢業（只有官方精確日期才寫 graduated_at）=====');
    for (const d of data.departures ?? []) {
        out.push(`-- ${commentSafe(d.name)}（${commentSafe(d.agency)}：${commentSafe(d.official_label)}）`);
        const sets = [`activity = 'graduate'`];
        if (d.left_date) sets.push(`graduated_at = coalesce(v.graduated_at, ${q(d.left_date)}::date)`);
        out.push(`update public.vtubers v set ${sets.join(', ')} where v.id = ${q(d.id)} and v.activity <> 'graduate';`);
    }
    out.push('');

    out.push(`-- ===== 3. 官網有、資料庫沒有的成員（contributed_by='${CONTRIBUTED_BY}'；頻道或名字已存在就跳過）=====`);
    for (const m of data.new_members ?? []) {
        const group = m.subgroup
            ? `(select id from public.vtuber_groups where name = ${q(m.subgroup)} and parent_id = ${topId(m.agency)})`
            : topId(m.agency);
        out.push(`-- ${commentSafe(m.name)}（${commentSafe(m.agency)}${m.subgroup ? `／${commentSafe(m.subgroup)}` : ''}）`);
        // 地區取所屬公司的地區（社群歸屬；公司都是查證過的企業勢）
        out.push(
            `insert into public.vtubers (name, nationality, activity, youtube_channel_id, twitch_channel_id, img_url, group_id, contributed_by) select ${q(m.name)}, (select nationality from public.vtuber_groups where id = ${topId(m.agency)}), ${q(m.status === 'preparing' ? 'preparing' : 'active')}, ${qn(m.youtube_channel_id)}, ${qn(m.twitch_login)}, ${qn(m.avatar)}, ${group}, ${q(CONTRIBUTED_BY)} where ${group} is not null and not exists (select 1 from public.vtubers x where ${memberMatch(m, 'x')} or x.name = ${q(m.name)});`,
        );
        if (m.youtube_channel_id) {
            out.push(
                `insert into public.vtuber_channels (vtuber_id, platform, external_id, handle) select v.id, 'youtube', ${q(m.youtube_channel_id)}, ${q(m.youtube_channel_id)} from public.vtubers v where v.youtube_channel_id = ${q(m.youtube_channel_id)} and not exists (select 1 from public.vtuber_channels c where c.platform = 'youtube' and c.external_id = ${q(m.youtube_channel_id)} and c.status = 'active') limit 1;`,
            );
        }
        out.push(
            `do $$ begin if not exists (select 1 from public.vtubers v where ${memberMatch(m, 'v')}) then raise warning '新成員 % 沒有加入（同名已存在或所屬團體不存在）', ${q(m.name)}; end if; end $$;`,
        );
    }
    out.push('');
    out.push('-- ===== 4. 成員數校正（之後由 trigger 維護）=====');
    out.push('update public.vtuber_groups g set member_count = coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0)');
    out.push('where g.member_count is distinct from coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0);');
    out.push('');
    return out.join('\n');
}

/** migration 檔頭：依賴、套用前提與回滾（測試會檢查回滾 SQL） */
export const OFFICIAL_HEADER = `-- 依官網標示調整資料庫（古德文創全部改合作、官網標示離開、官網新成員）。由 scripts/build-official-fixes.mjs 產生，不要手改。
-- 來源：scripts/data/tw-official-fixes-2026-09.json（每筆附官方出處）
-- 依賴：20260930100100（合作關係與子團名稱）
-- **須單一交易套用**（apply_migration 或 psql -1），而且**不可和其他 migration 放在同一個交易**：回滾靠 created_at＝交易開始時間辨識本檔新增的列。
-- 各段敘述都是「已是目標狀態就跳過」；整份重新套用前先依下方回滾、drop 第 0 段的 3 張 backup 表。
-- 正式站套用前先確認第 1、2 段的 v.id 都存在（id 取自本地匯出的正式站資料）。
-- 回滾（依第 0 段備份；只還原目前仍是本檔新值的欄位，之後被別人改過的不動）：
--   delete from public.vtuber_group_links l where l.created_at = (select applied_at from backup.official_meta_20260930);
--   delete from public.vtubers where contributed_by = '${CONTRIBUTED_BY}';  -- 會連帶刪除這些人之後累積的頻道、場次、合作關係（on delete cascade）
--   delete from public.vtuber_channels c where c.created_at = (select applied_at from backup.official_meta_20260930) and not exists (select 1 from backup.vtuber_channels_ids_official_20260930 b where b.id = c.id);
--   update public.vtubers v set group_id = case when b.clears_group and v.group_id is null then b.group_id else v.group_id end, activity = case when b.new_activity is not null and v.activity = b.new_activity then b.activity else v.activity end, graduated_at = case when b.new_graduated_at is not null and v.graduated_at = b.new_graduated_at then b.graduated_at else v.graduated_at end from backup.vtubers_official_20260930 b where b.id = v.id;
--   update public.vtuber_groups g set member_count = coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0) where g.member_count is distinct from coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0);`;

function main() {
    const arg = (n) => {
        const i = process.argv.indexOf(n);
        return i > 0 ? process.argv[i + 1] : null;
    };
    const data = JSON.parse(readFileSync(resolve(arg('--data')), 'utf8'));
    const sql = buildOfficialSql(data, OFFICIAL_HEADER);
    writeFileSync(resolve(arg('--out')), sql, 'utf8');
    console.log(JSON.stringify({ collab_convert: data.collab_convert.length, departures: data.departures.length, new_members: data.new_members.length }));
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('build-official-fixes.mjs')) main();
