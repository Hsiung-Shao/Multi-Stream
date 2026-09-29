// 企業勢名冊產生器：子團（只建有成員的、撞名加前綴）、既有成員更新（Twitch 也找得到、不動別家的人）、
// 新成員（同名跳過）、合作藝人、官方頻道、left_continues、status-unverified、date-approx、reclassify、以名字認人、重複
import { describe, it, expect } from 'vitest';
// @ts-expect-error scripts 目錄的 ESM JS 無型別宣告
import { planRosters, buildRosterSql, toActivity, matchCond, looksLikeSamePerson, CONTRIBUTED_BY } from '../../scripts/build-agency-rosters.mjs';
// @ts-expect-error 同上
import { indexDb, matchDb, normalizeHandle } from '../../scripts/resolve-roster-channels.mjs';
// @ts-expect-error 同上
import { normalizeSubgroup } from '../../scripts/merge-agency-rosters.mjs';

const NL = String.fromCharCode(10);
const member = (o: Record<string, unknown>) => ({
    name: 'x', aliases: [], status: 'active', debut_date: null, graduation_date: null, subgroup: null, generation: null,
    youtube_channel_id: null, youtube_handle: null, twitch_login: null, collaborator: false, is_official_channel: false, sources: ['u'], ...o,
});
const groups = [
    { id: 'g1', name: '子午計畫', parent_id: null, kind: 'agency' },
    { id: 'g1a', name: 'NEO(n)', parent_id: 'g1', kind: 'agency' },
    { id: 'o1', name: '某社團', parent_id: null, kind: 'circle' },
    { id: 'g2', name: '預見娛樂', parent_id: null, kind: 'agency' },
    { id: 'g3', name: '雲際線工作室', parent_id: null, kind: 'agency' },
    { id: 'g4', name: '恋Vaichu', parent_id: null, kind: 'agency' },
    { id: 'x1', name: 'SUPER', parent_id: null, kind: 'unverified' },
];
type Item = { m: { name: string }; target: string };
const names = (list: Item[]) => list.map((x) => x.m.name);
const lineOf = (sql: string, needle: string, prefix = 'update public.vtubers v set') => sql.split(NL).find((l) => l.startsWith(prefix) && l.includes(needle))!;

const resolved = [
    {
        agency: '子午計畫',
        subgroups: ['沉珀 Aetris', '空的子團'],
        members: [
            member({ name: '煌Kirali', subgroup: 'NEO(n)', youtube_channel_id: 'UCkirali0000000000000000', _db_id: 'v1', _db_group_id: 'g1', twitch_login: 'kirali', _twitch_id: '111' }),
            member({ name: '汐Seki', status: 'graduated', graduation_date: '2024-03-30', youtube_channel_id: 'UCseki00000000000000000a', _db_id: 'v2', _db_group_id: 'g1' }),
            member({ name: '莓 Ichii', debut_date: '2026-09-18', subgroup: '沉珀 Aetris', youtube_channel_id: 'UCichii0000000000000000a', _avatar: 'https://yt3.ggpht.com/a' }),
            member({ name: '只有 Twitch 的新人', twitch_login: 'NewOne', _twitch_id: '222' }),
            member({ name: 'Twitch 認到的舊人', youtube_channel_id: 'UCnew000000000000000000a', twitch_login: 'oldtw', _db_id: 'v5', _db_group_id: null }),
            member({ name: '掛在社團的人', status: 'graduated', youtube_channel_id: 'UCcircle0000000000000000', _db_id: 'v6', _db_group_id: 'o1' }),
            member({ name: '同名的人', youtube_channel_id: 'UCdupname000000000000000' }),
            member({ name: '只有名字的舊人', status: 'graduated', youtube_channel_id: 'UCnameonly00000000000000', _db_id: 'v7', _match_name: true }),
            member({ name: '日期大概', debut_date: '2022-10-01', youtube_channel_id: 'UCapprox0000000000000000', _db_id: 'v8', _db_group_id: 'g1', sources: ['u', 'date-approx'] }),
            member({ name: '玖玖巴', collaborator: true, youtube_channel_id: 'UCjojoba00000000000000aa', _db_id: 'v3' }),
            member({ name: '子午計畫官方', is_official_channel: true, youtube_channel_id: 'UCofficial00000000000000', _db_id: 'v4' }),
            member({ name: '新的官方', is_official_channel: true, youtube_channel_id: 'UCofficial11111111111111' }),
            member({ name: '沒頻道的人', subgroup: '只有沒頻道成員的子團' }),
            member({ name: '新人接手的頻道', youtube_channel_id: 'UCreused0000000000000000', _db_id: 'v9', _db_name: '已畢業的前輩', _db_group_id: 'g1' }),
        ],
    },
    {
        agency: '預見娛樂',
        subgroups: ['SUPER'],
        members: [
            member({ name: 'Kirali 的 Twitch 在別家', twitch_login: 'KIRALI', _db_id: 'v1' }),
            member({ name: '一期生', subgroup: 'SUPER', youtube_channel_id: 'UCsuper00000000000000000' }),
        ],
    },
];

describe('planRosters', () => {
    const plan = planRosters(resolved, groups, [{ name: '同名的人' }]);

    it('頻道對上但名字完全不像：不動，列 nameMismatch', () => {
        expect(plan.report.nameMismatch).toEqual(['子午計畫/新人接手的頻道（資料庫同頻道的是「已畢業的前輩」）']);
        expect(names(plan.updates)).not.toContain('新人接手的頻道');
        expect(looksLikeSamePerson('艾琳妮雅·裴利', ['艾琳妮雅'])).toBe(true);
        expect(looksLikeSamePerson('実Hitomi', ['實 Hitomi'])).toBe(true);
        expect(looksLikeSamePerson('北溟', ['姬宮乃愛'])).toBe(false);
    });

    it('子團只為有成員的建；撞到別家的團名加公司前綴；沒有的公司列 missingAgency', () => {
        expect(plan.subgroups.map((x: { name: string }) => x.name)).not.toContain('只有沒頻道成員的子團');
        expect(plan.subgroups).toEqual([
            { name: 'NEO(n)', agency: '子午計畫' },
            { name: '沉珀 Aetris', agency: '子午計畫' },
            { name: '預見娛樂 SUPER', agency: '預見娛樂' },
        ]);
        expect(plan.report.subgroupRenamed).toEqual(['SUPER → 預見娛樂 SUPER']);
        expect(planRosters([{ agency: '不存在', members: [] }], groups).report.missingAgency).toEqual(['不存在']);
    });

    it('掛在別家的人不動並列報告；同名的新人跳過；YouTube 或 Twitch 任一重複都算同一人', () => {
        expect(plan.report.otherGroup).toEqual(['子午計畫/掛在社團的人（名冊寫 graduated，資料庫目前在別的團體）']);
        expect(plan.report.nameTaken).toEqual(['子午計畫/同名的人']);
        expect(plan.report.duplicates).toHaveLength(1);
        expect(names(plan.inserts)).toEqual(['莓 Ichii', '只有 Twitch 的新人', '一期生']);
        expect(names(plan.updates)).toEqual(['煌Kirali', '汐Seki', 'Twitch 認到的舊人', '只有名字的舊人', '日期大概']);
    });

    it('合作藝人解除；官方頻道只標記既有的、不新增；沒頻道列報告', () => {
        expect(names(plan.collaborators)).toEqual(['玖玖巴']);
        expect(names(plan.officials)).toEqual(['子午計畫官方']);
        expect(plan.report.noChannel).toEqual(['子午計畫/沒頻道的人（active）']);
    });
});

describe('buildRosterSql', () => {
    const sql: string = buildRosterSql(planRosters(resolved, groups, [{ name: '同名的人' }]), '-- h');

    it('先備份；子團 on conflict do nothing（不搶別家）；空子團不建', () => {
        expect(sql.indexOf('backup.vtubers_rosters_20260929')).toBeLessThan(sql.indexOf('insert into public.vtuber_groups'));
        expect(sql).toContain("select '沉珀 Aetris', 'TW', 'agency', (select id from public.vtuber_groups where name = '子午計畫' and parent_id is null)");
        expect(sql).toContain('on conflict (name) do nothing;');
        expect(sql).not.toContain("'空的子團'");
    });

    it('既有成員：以資料庫 id 定位（Twitch 比到的人也更新得到）；只改沒團體或在本家的；成員要掛的團體必須屬於本家', () => {
        const l = lineOf(sql, "v.id = 'v5'");
        expect(l).toContain("youtube_channel_id = coalesce(v.youtube_channel_id, case when exists (select 1 from public.vtubers x where x.youtube_channel_id = 'UCnew000000000000000000a' and x.id <> v.id) then null else 'UCnew000000000000000000a' end)");
        expect(l).toContain("and (v.group_id is null or v.group_id in (select id from public.vtuber_groups where id = (select id from public.vtuber_groups where name = '子午計畫' and parent_id is null)");
        expect(l).toContain("g.name = '子午計畫' and g.id in (select id");
    });

    it('畢業：狀態與精確日期寫入；date-approx 的日期不寫', () => {
        const seki = lineOf(sql, "v.id = 'v2'");
        expect(seki).toContain("activity = 'graduate'");
        expect(seki).toContain("graduated_at = '2024-03-30'::date");
        expect(lineOf(sql, "v.id = 'v8'")).toContain('debut_date = coalesce(v.debut_date, null)');
    });

    it('以名字認人：以 id 定位並補上頻道；頻道表也以 id 補', () => {
        const l = lineOf(sql, "v.id = 'v7'");
        expect(l).toContain("then null else 'UCnameonly00000000000000' end)");
        expect(sql).toContain("select v.id, 'youtube', 'UCnameonly00000000000000', 'UCnameonly00000000000000' from public.vtubers v where v.id = 'v7'");
    });

    it('新成員：頻道或名字已存在就跳過；只有 Twitch 的也補頻道表；帶 contributed_by', () => {
        expect(sql).toContain(`'莓 Ichii', 'TW', 'active', '2026-09-18'::date`);
        expect(sql).toContain(`'${CONTRIBUTED_BY}'`);
        expect(sql).toContain("not exists (select 1 from public.vtubers x where lower(x.twitch_channel_id) = 'newone' or x.name = '只有 Twitch 的新人')");
        expect(sql).toContain("'twitch', '222', 'newone'");
    });

    it('官方頻道標 is_official；新的官方頻道不新增', () => {
        expect(sql).toContain("update public.vtubers v set is_official = true, group_id = coalesce(v.group_id, (select id from public.vtuber_groups where name = '子午計畫' and parent_id is null)) where v.id = 'v4'");
        expect(sql).not.toContain('UCofficial11111111111111');
    });

    it('status-unverified：只掛團，不改狀態與畢業日', () => {
        const p = planRosters([{ agency: '預見娛樂', subgroups: [], members: [member({ name: '啵妮', status: 'graduated', graduation_date: '2025-01-01', youtube_channel_id: 'UCboni000000000000000000', _db_id: 'b', sources: ['u', 'status-unverified'] })] }], groups);
        const l = lineOf(buildRosterSql(p, '--'), "v.id = 'b'");
        expect(l).toContain('activity = v.activity');
        expect(l).toContain('graduated_at = v.graduated_at');
    });

    it('left_continues：只清本家所屬、前所屬記頂層公司、原本引退的不改回現役；新成員也掛前所屬', () => {
        const p = planRosters([{ agency: '雲際線工作室', subgroups: [], members: [
            member({ name: '周默', status: 'graduated', graduation_date: '2025-05-29', left_continues: true, youtube_channel_id: 'UCzhoumo0000000000000000', _db_id: 'z', _db_group_id: 'o1' }),
            member({ name: '小金碧碧', status: 'graduated', graduation_date: '2026-01-05', left_continues: true, youtube_channel_id: 'UCbibi000000000000000000' }),
        ] }], groups);
        const out = buildRosterSql(p, '--');
        const l = lineOf(out, "v.id = 'z'");
        expect(l).toContain("group_id = case when v.group_id in (select id from public.vtuber_groups where id = (select id from public.vtuber_groups where name = '雲際線工作室' and parent_id is null)");
        expect(l).toContain("former_group_id = case when v.former_group_id is null or v.former_group_id in (select id");
        // 不依賴子團是否存在（不 join vtuber_groups g）
        expect(l).not.toContain('from public.vtuber_groups g');
        expect(l).toContain("activity = case when v.activity = 'graduate' then v.activity else 'active' end");
        expect(l).toContain("graduated_at = '2025-05-29'::date");
        expect(out).toContain("'小金碧碧', 'TW', 'active'");
    });

    it('reclassify：改分類、不建子團、成員掛在團體本身', () => {
        const p = planRosters([{ agency: '恋Vaichu', subgroups: ['澪岐小隊'], reclassify: { kind: 'circle', note: '自稱社團勢' }, members: [
            member({ name: 'ORI', subgroup: '澪岐小隊', youtube_channel_id: 'UCori0000000000000000000' }),
        ] }], groups);
        expect(p.subgroups).toEqual([]);
        expect(p.inserts[0].target).toBe('恋Vaichu');
        expect(buildRosterSql(p, '--')).toContain("update public.vtuber_groups set kind = 'circle', note = '自稱社團勢'");
    });

    it('合作藝人只從這家或其子團解除', () => {
        expect(sql).toContain("update public.vtubers v set group_id = null where v.id = 'v3' and v.group_id in (select id from public.vtuber_groups where id = (select id");
    });
});

describe('回滾', () => {
    it('只刪這次新增的頻道（以套用時間定位），不誤刪之後其他流程加的', () => {
        const p = planRosters([], []);
        const out = buildRosterSql(p, '--');
        expect(out).toContain('create table if not exists backup.rosters_meta_20260929 as select now() as applied_at;');
    });
});

describe('小工具', () => {
    it('toActivity／matchCond', () => {
        expect([toActivity('graduated'), toActivity('preparing'), toActivity('active'), toActivity(undefined)]).toEqual(['graduate', 'preparing', 'active', 'active']);
        expect(matchCond({ youtube_channel_id: 'UC1', twitch_login: 'AbC' })).toBe("(v.youtube_channel_id = 'UC1' or lower(v.twitch_channel_id) = 'abc')");
        expect(matchCond({})).toBeNull();
    });
    it('normalizeHandle：網址、含中文的 handle、無效值', () => {
        expect(normalizeHandle('https://www.youtube.com/@Kirali_Ch')).toBe('@Kirali_Ch');
        expect(normalizeHandle('@MeridianProject子午計畫')).toBe('@MeridianProject子午計畫');
        expect(normalizeHandle(null)).toBeNull();
    });
    it('matchDb：YouTube 優先、再 Twitch（不分大小寫）', () => {
        const db = indexDb([{ id: 'a', name: 'A', youtube_channel_id: 'UC1', twitch_channel_id: null }, { id: 'b', name: 'B', youtube_channel_id: null, twitch_channel_id: 'TwOne' }]);
        expect(matchDb({ youtube_channel_id: 'UC1' }, db)?.id).toBe('a');
        expect(matchDb({ twitch_login: 'twone' }, db)?.id).toBe('b');
        expect(matchDb({ youtube_channel_id: 'UCx', twitch_login: 'nope' }, db)).toBeNull();
    });
    it('normalizeSubgroup：括號註記、期別前綴、別名、只有期別時加公司名、個人不算子團', () => {
        expect(normalizeSubgroup('TSA Studio', '一期生 SUPER')).toBe('SUPER');
        expect(normalizeSubgroup('Limnos', 'NKshoujo（前身）')).toBe('NKshoujo');
        expect(normalizeSubgroup('ReLive Project', '1期生')).toBe('ReLive Project 1期生');
        expect(normalizeSubgroup('春魚創意', '瑟拉斯蒂歐Celestial')).toBe('瑟拉斯蒂歐');
        expect(normalizeSubgroup('預見娛樂', '懶貓子')).toBeNull();
        expect(normalizeSubgroup('X', null)).toBeNull();
    });
});
