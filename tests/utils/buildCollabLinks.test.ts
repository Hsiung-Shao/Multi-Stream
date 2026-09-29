// 子團名稱修正＋合作藝人產生器：改名（撞名不改）、補建（撞名加前綴）、誤列刪除只刪沒人指向的、成員對齊（已解散不搬、多團取 unit）、
// 合作（confirmed 才收、名字不像不加、新人要有頻道、ended 無日期不加、多家合作）、備份防呆與回滾 SQL
import { describe, it, expect } from 'vitest';
// @ts-expect-error scripts 目錄的 ESM JS 無型別宣告
import { planCollabs, buildCollabSql, COLLAB_HEADER, CONTRIBUTED_BY } from '../../scripts/build-collab-links.mjs';

const NL = String.fromCharCode(10);
const groups = [
    { id: 'm', name: '子午計畫', parent_id: null, kind: 'agency' },
    { id: 'm1', name: 'NEO', parent_id: 'm', kind: 'agency' },
    { id: 'm2', name: '沉珀 Aetris', parent_id: 'm', kind: 'agency' },
    { id: 'c', name: '春魚創意', parent_id: null, kind: 'agency' },
    { id: 'c1', name: 'SquareLive', parent_id: 'c', kind: 'agency' },
    { id: 'c2', name: '瑟拉斯蒂歐', parent_id: 'c', kind: 'agency' },
    { id: 'l', name: 'Limnos', parent_id: null, kind: 'agency' },
    { id: 'l1', name: 'NKshoujo', parent_id: 'l', kind: 'agency' },
    { id: 'x', name: 'SUPER', parent_id: null, kind: 'unverified' },
];
const db = [
    { id: 'v-kirali', name: '煌Kirali', group_id: 'm' },
    { id: 'v-rei', name: '澪', group_id: 'm1' },
    { id: 'v-other', name: '別家的人', group_id: 'x' },
    { id: 'v-nk', name: 'NK成員', group_id: 'l' },
];
const sg = (o: Record<string, unknown>) => ({ official_name: '', aliases: [], db_name: null, verdict: 'ok', kind: 'unit', status: 'active', members: [], sources: ['u'], ...o });
const collab = (o: Record<string, unknown>) => ({ name: 'x', aliases: [], status: 'active', since: null, until: null, youtube_channel_id: null, twitch_login: null, verdict: 'confirmed', sources: ['https://official'], ...o });

const research = [
    {
        agency: '子午計畫',
        subgroups: [
            sg({ official_name: '霓 NEO(n)', db_name: 'NEO', verdict: 'rename', members: ['澪', '煌Kirali', '不在資料庫'] }),
            sg({ official_name: '沉珀 Aetris', db_name: '沉珀 Aetris', members: ['煌Kirali'] }),
            sg({ official_name: 'SUPER', verdict: 'add', kind: 'generation', members: ['別家的人'] }),
        ],
        members: [
            collab({ name: 'KSP', youtube_channel_id: 'UCksp', _db_id: 'v-ksp', _db_name: 'KSP' }),
            collab({ name: '玖玖巴 JOJOBA', youtube_channel_id: 'UCjojo', _db_id: 'v-jojo', _db_name: '玖玖巴' }),
            collab({ name: '頻道被別人用', youtube_channel_id: 'UCtaken', _db_id: 'v-t', _db_name: '完全不同' }),
            collab({ name: '新合作', twitch_login: 'NewCollab', _twitch_id: '99', _avatar: 'https://a' }),
            collab({ name: '沒頻道' }),
            collab({ name: '沒出處', verdict: 'no_official_source', youtube_channel_id: 'UCnosrc' }),
            collab({ name: '其實是成員', verdict: 'is_member' }),
            collab({ name: '結束沒日期', status: 'ended', youtube_channel_id: 'UCend', _db_id: 'v-end', _db_name: '結束沒日期' }),
            collab({ name: '已結束', status: 'ended', until: '2025-06-30', youtube_channel_id: 'UCpast', _db_id: 'v-past', _db_name: '已結束' }),
            collab({ name: '狀態不明', status: null, youtube_channel_id: 'UCunk', _db_id: 'v-unk', _db_name: '狀態不明' }),
            collab({ name: '煌Kirali', youtube_channel_id: 'UCkirali', _db_id: 'v-kirali', _db_name: '煌Kirali' }),
        ],
    },
    {
        agency: '春魚創意',
        subgroups: [
            sg({ official_name: 'SquareLive', db_name: 'SquareLive', verdict: 'not_subgroup' }),
            sg({ official_name: '瑟拉斯蒂歐Celestial', db_name: '瑟拉斯蒂歐', verdict: 'rename' }),
            sg({ official_name: '沉珀 Aetris', verdict: 'rename', db_name: '不存在的舊名' }),
        ],
        members: [collab({ name: 'KSP', youtube_channel_id: 'UCksp', _db_id: 'v-ksp', _db_name: 'KSP' })],
    },
    { agency: 'Limnos', subgroups: [sg({ official_name: 'NKshoujo', db_name: 'NKshoujo', status: 'disbanded', members: ['NK成員'] })], members: [] },
    { agency: '不存在的公司', subgroups: [], members: [] },
];

describe('planCollabs：子團', () => {
    const plan = planCollabs(research, groups, db);

    it('改名：公司＋舊名定位；舊名不存在列報告', () => {
        expect(plan.renames).toEqual([
            { agency: '子午計畫', from: 'NEO', to: '霓 NEO(n)' },
            { agency: '春魚創意', from: '瑟拉斯蒂歐', to: '瑟拉斯蒂歐Celestial' },
        ]);
        expect(plan.report.renameMissing).toEqual(['春魚創意/不存在的舊名']);
    });

    it('補建：名稱撞到別的團體加公司前綴；誤列只列刪除候選', () => {
        expect(plan.adds).toEqual([{ agency: '子午計畫', name: '子午計畫 SUPER' }]);
        expect(plan.report.addRenamed).toEqual(['SUPER → 子午計畫 SUPER']);
        expect(plan.deletes).toEqual([{ agency: '春魚創意', name: 'SquareLive' }]);
        expect(plan.report.missingAgency).toEqual(['不存在的公司']);
    });

    it('成員對齊：unit 優先、同一人多團列報告、資料庫沒有的列報告、別家的人不搬、已解散的團不搬', () => {
        expect(plan.moves.map((m: { name: string; target: string }) => `${m.name}→${m.target}`)).toEqual(['澪→霓 NEO(n)', '煌Kirali→霓 NEO(n)']);
        expect(plan.report.multiSubgroup).toEqual(['子午計畫/煌Kirali：霓 NEO(n)（另列 沉珀 Aetris）']);
        expect(plan.report.memberMissing).toEqual(['子午計畫/霓 NEO(n)/不在資料庫', '子午計畫/子午計畫 SUPER/別家的人']);
        expect(plan.moves.some((m: { name: string }) => m.name === 'NK成員')).toBe(false);
    });

    it('沒有團體的人：名字全資料庫唯一、沒有前所屬才認', () => {
        const rows = [
            ...db,
            { id: 'v-free', name: '無團體', group_id: null },
            { id: 'v-dup1', name: '同名', group_id: null },
            { id: 'v-dup2', name: '同名', group_id: 'x' },
            { id: 'v-left', name: '轉個人勢', group_id: null, former_group_id: 'm' },
        ];
        const p = planCollabs([{ agency: '子午計畫', subgroups: [sg({ official_name: '沉珀 Aetris', db_name: '沉珀 Aetris', members: ['無團體', '同名', '轉個人勢'] })], members: [] }], groups, rows);
        expect(p.moves.map((m: { id: string }) => m.id)).toEqual(['v-free']);
        expect(p.report.memberByNameOnly).toEqual(['子午計畫/沉珀 Aetris/無團體']);
        expect(p.report.memberMissing).toEqual(['子午計畫/沉珀 Aetris/同名', '子午計畫/沉珀 Aetris/轉個人勢']);
    });

    it('只有期別的團名加公司名前綴', () => {
        const p = planCollabs([{ agency: '子午計畫', subgroups: [sg({ official_name: '一期生', verdict: 'add', kind: 'generation' })], members: [] }], groups, db);
        expect(p.adds).toEqual([{ agency: '子午計畫', name: '子午計畫 一期生' }]);
    });

    it('改名撞到既有團名：不改、改用舊名繼續對齊', () => {
        const p = planCollabs([{ agency: '子午計畫', subgroups: [sg({ official_name: 'SUPER', db_name: 'NEO', verdict: 'rename', members: ['澪'] })], members: [] }], groups, db);
        expect(p.renames).toEqual([]);
        expect(p.report.renameConflict).toEqual(['子午計畫/NEO → SUPER（名稱已被使用）']);
        // 改名沒成功：成員對齊到舊名（澪 本來就在 NEO，SQL 有「已是目標就跳過」）
        expect(p.moves.map((m: { name: string; target: string }) => `${m.name}→${m.target}`)).toEqual(['澪→NEO']);
    });
});

describe('planCollabs：合作', () => {
    const plan = planCollabs(research, groups, db);

    it('confirmed 且名字像才加；新人要有頻道；其餘列報告', () => {
        expect(plan.links.map((l: { m: { name: string }; agency: string }) => `${l.agency}/${l.m.name}`)).toEqual([
            '子午計畫/KSP',
            '子午計畫/玖玖巴 JOJOBA',
            '子午計畫/已結束',
            '春魚創意/KSP',
        ]);
        expect(plan.inserts.map((l: { m: { name: string } }) => l.m.name)).toEqual(['新合作']);
        expect(plan.report.collabNameMismatch).toEqual(['子午計畫/頻道被別人用（資料庫同頻道的是「完全不同」）']);
        expect(plan.report.collabNoChannel).toEqual(['子午計畫/沒頻道']);
        expect(plan.report.collabNoSource).toEqual(['子午計畫/沒出處']);
        expect(plan.report.collabIsMember).toEqual(['子午計畫/其實是成員']);
        expect(plan.report.collabEndedNoDate).toEqual(['子午計畫/結束沒日期']);
        expect(plan.report.collabStatusUnknown).toEqual(['子午計畫/狀態不明']);
        // 資料庫記為本家正式成員、官方卻列合作：不加，交人工確認
        expect(plan.report.collabAlreadyMember).toEqual(['子午計畫/煌Kirali']);
        expect(plan.report.multiAgencyCollab).toEqual(['KSP：子午計畫、春魚創意']);
    });
});

describe('planCollabs：新增合作藝人前的檢查', () => {
    it('同名已存在、或 YouTube 與 Twitch 對到不同人：不新增、列報告', () => {
        const rows = [...db, { id: 'a', name: '已有同名', group_id: null }, { id: 'y', name: 'Y', youtube_channel_id: 'UCy', group_id: null }, { id: 't', name: 'T', twitch_channel_id: 'Tw', group_id: null }];
        const p = planCollabs(
            [{ agency: '子午計畫', subgroups: [], members: [collab({ name: '已有同名', youtube_channel_id: 'UCnew' }), collab({ name: '兩頭', youtube_channel_id: 'UCy', twitch_login: 'tw' })] }],
            groups,
            rows,
        );
        expect(p.inserts).toEqual([]);
        expect(p.report.collabNameTaken).toEqual(['子午計畫/已有同名']);
        expect(p.report.collabAmbiguous).toEqual(['子午計畫/兩頭（YouTube 與 Twitch 對到不同人）']);
    });
});

describe('buildCollabSql', () => {
    const sql: string = buildCollabSql(planCollabs(research, groups, db), COLLAB_HEADER);
    const line = (needle: string, prefix = '') => sql.split(NL).find((l) => l.startsWith(prefix) && l.includes(needle))!;

    it('第 0 段：舊備份還在就中止，且在建表之前', () => {
        expect(sql.indexOf("to_regclass('backup.collab_meta_20260930') is not null then raise exception")).toBeGreaterThan(-1);
        expect(sql.indexOf('to_regclass')).toBeLessThan(sql.indexOf('create table backup.'));
    });

    it('改名：公司內定位、新名已存在就不改', () => {
        const l = line("set name = '霓 NEO(n)'");
        expect(l).toContain("where name = 'NEO' and parent_id = (select id from public.vtuber_groups where name = '子午計畫' and parent_id is null)");
        expect(l).toContain("not exists (select 1 from public.vtuber_groups x where x.name = '霓 NEO(n)')");
    });

    it('刪團：只刪沒有所屬、前所屬、合作、子團指向的', () => {
        const l = line('delete from public.vtuber_groups g where g.id');
        expect(l).toContain("name = 'SquareLive'");
        expect(l).toContain('v.former_group_id = g.id');
        expect(l).toContain('public.vtuber_group_links l where l.group_id = g.id');
    });

    it('搬人：以 id 定位、只動本家的人、已在目標就跳過', () => {
        const l = line("v.id = 'v-rei'");
        expect(l).toContain("g.id = (select id from public.vtuber_groups where name = '霓 NEO(n)' and parent_id =");
        expect(l).toContain('and (v.group_id in (select id from public.vtuber_groups where id =');
        // 完全沒有團體、也沒有前所屬的人也可以掛回（例：Mojoy 已畢業成員當初沒掛團）
        expect(l).toContain('or (v.group_id is null and v.former_group_id is null))');
        expect(l).toContain('v.group_id is distinct from g.id');
    });

    it('合作關係：掛頂層公司、role=collaborator、重跑只在內容不同時更新；結束日寫入', () => {
        const l = line("v.id = 'v-ksp'", 'insert into public.vtuber_group_links');
        expect(l).toContain("'collaborator'");
        expect(l).toContain('on conflict (vtuber_id, group_id, role) do update');
        expect(l).toContain('is distinct from (excluded.since, excluded.until, excluded.source_url)');
        expect(line("v.id = 'v-past'", 'insert into public.vtuber_group_links')).toContain("'2025-06-30'::date");
    });

    it('新合作藝人：不設 group_id、帶 contributed_by、頻道表與關係以頻道定位', () => {
        const ins = line("'新合作', 'TW', 'active'", 'insert into public.vtubers');
        expect(ins).not.toContain('group_id');
        expect(ins).toContain(`'${CONTRIBUTED_BY}'`);
        expect(ins).toContain("lower(x.twitch_channel_id) = 'newcollab'");
        expect(sql).toContain("'twitch', '99', 'newcollab'");
        expect(line("lower(v.twitch_channel_id) = 'newcollab'", 'insert into public.vtuber_group_links')).toContain('limit 1 on conflict');
    });

    it('第 0 段記下本檔搬過的人與補建的團；新人沒掛上關係會發警告', () => {
        expect(sql).toContain("create table backup.collab_moves_20260930 as select unnest(array['v-rei', 'v-kirali']::uuid[]) as id;");
        expect(sql).toContain("create table backup.collab_added_groups_20260930 as select unnest(array['子午計畫 SUPER']::text[]) as name;");
        expect(line("raise warning '合作藝人 % 沒有掛上 %", 'do $$')).toContain("lower(v.twitch_channel_id) = 'newcollab'");
    });

    it('檔頭回滾：刪本次關係與新人、還原刪掉的團與所屬、刪新建的團、還原團名', () => {
        expect(COLLAB_HEADER).toContain('須單一交易套用');
        expect(COLLAB_HEADER).toContain('delete from public.vtuber_group_links l where l.created_at = (select applied_at from backup.collab_meta_20260930);');
        expect(COLLAB_HEADER).toContain(`delete from public.vtubers where contributed_by = '${CONTRIBUTED_BY}';`);
        expect(COLLAB_HEADER).toContain('insert into public.vtuber_groups select b.* from backup.vtuber_groups_collab_20260930 b where not exists');
        expect(COLLAB_HEADER).toContain('update public.vtuber_groups g set name = b.name');
        // 只還原本檔搬過的人、只刪本檔補建的團（套用後其他流程的改動不受影響）
        expect(COLLAB_HEADER).toContain('and v.id in (select id from backup.collab_moves_20260930)');
        expect(COLLAB_HEADER).toContain('where g.name in (select name from backup.collab_added_groups_20260930)');
    });
});
