// 台灣團體標籤產生器：頻道 ID 比對、子團掛公司、合作藝人不掛、節目不建、重複所屬的取捨、未查證不覆蓋
import { describe, it, expect } from 'vitest';
// @ts-expect-error scripts 目錄的 ESM JS 無型別宣告
import { planGroups, buildSql } from '../../scripts/build-group-migration.mjs';

const m = (name: string, yt: string | null, extra: Record<string, unknown> = {}) => ({
    name, nationality: 'TW', activity: 'active', ...(yt ? { YouTube: { id: yt } } : {}), ...extra,
});

const source = [
    { name: 'SquareLive', members: [m('冰霧', 'UCice'), m('露恰露恰', 'UCruca'), m('兔姬', 'UCusagi')] },
    { name: '子午計畫', members: [m('煌Kirali', 'UCkirali'), m('玖玖巴', 'UCjojoba'), m('外國人', 'UCjp', { nationality: 'JP' })] },
    { name: '某社團', members: [m('煌Kirali', 'UCkirali'), m('只有Twitch', null, { Twitch: { id: 'OnlyTwitch' } })] },
    { name: '你啊罵火鍋', members: [m('節目主持', 'UCpod')] },
    { name: '沒查過的團', members: [m('路人', 'UCnobody')] },
];

const classification = {
    verified_at: '2026-09-29',
    companies: [{ name: '春魚創意', note: '公司', subgroups: [{ name: '瑟拉斯蒂歐', members: ['冰霧'] }] }],
    groups: [
        { name: 'SquareLive', kind: 'agency', parent: '春魚創意', collaborators: ['兔姬'] },
        { name: '子午計畫', kind: 'agency', collaborators: ['玖玖巴', 'KSP'] },
        { name: '某社團', kind: 'circle' },
    ],
    exclude: [{ name: '你啊罵火鍋', reason: '節目' }],
};

describe('planGroups', () => {
    const plan = planGroups(source, classification);
    const members = (g: string) => (plan.assignments.get(g) ?? []).map((x: { name: string }) => x.name);

    it('子團成員掛子團、其餘掛原團體；子團與原團體的 parent 都是公司', () => {
        expect(members('瑟拉斯蒂歐')).toEqual(['冰霧']);
        expect(members('SquareLive')).toEqual(['露恰露恰']);
        const byName = new Map(plan.groups.map((g: { name: string }) => [g.name, g]));
        expect(byName.get('瑟拉斯蒂歐')).toMatchObject({ kind: 'agency', parent: '春魚創意' });
        expect(byName.get('SquareLive')).toMatchObject({ kind: 'agency', parent: '春魚創意' });
        expect(byName.get('春魚創意')).toMatchObject({ kind: 'agency', parent: null });
    });

    it('合作藝人不掛團；不在來源這一團的合作藝人（KSP）改用名字解除', () => {
        expect(members('SquareLive')).not.toContain('兔姬');
        expect(members('子午計畫')).not.toContain('玖玖巴');
        expect(plan.collaborators.map((c: { name: string; member: unknown }) => [c.name, !!c.member])).toEqual([
            ['兔姬', true], ['玖玖巴', true], ['KSP', false],
        ]);
    });

    it('節目不建立；非台灣成員不掛；未分類的團體是 unverified', () => {
        expect(plan.groups.some((g: { name: string }) => g.name === '你啊罵火鍋')).toBe(false);
        expect(members('子午計畫')).not.toContain('外國人');
        expect(plan.groups.find((g: { name: string }) => g.name === '沒查過的團')).toMatchObject({ kind: 'unverified', verified_at: null });
    });

    it('同一人在兩團：企業勢優先，並列在衝突清單', () => {
        expect(members('子午計畫')).toContain('煌Kirali');
        expect(members('某社團')).not.toContain('煌Kirali');
        expect(plan.conflicts).toEqual([{ name: '煌Kirali', chosen: '子午計畫', others: ['某社團'] }]);
    });

    it('分類檔寫錯團名或上層公司名會列在 missingNames', () => {
        const bad = planGroups(source, { ...classification, groups: [...classification.groups, { name: '打錯的團', kind: 'agency' }, { name: '某社團', kind: 'agency', parent: '不存在的公司' }] });
        expect(bad.missingNames).toContain('打錯的團');
        expect(bad.missingNames).toContain('某社團→不存在的公司');
    });

    it('同一人在 A 團只列 YouTube、B 團只列 Twitch，靠同時有兩者的那筆合併成同一人再比優先序', () => {
        const src = [
            { name: '企業團', members: [m('甲', 'UCa', { Twitch: { id: 'Alpha' } })] },
            { name: '小團', members: [m('甲', null, { Twitch: { id: 'alpha' } })] },
        ];
        const p = planGroups(src, { groups: [{ name: '企業團', kind: 'agency' }], companies: [] });
        expect(p.assignments.get('企業團')).toEqual([{ youtube: 'UCa', twitch: 'alpha', name: '甲', kind: 'agency' }]);
        expect(p.assignments.has('小團')).toBe(false);
        expect(p.conflicts).toEqual([{ name: '甲', chosen: '企業團', others: ['小團'] }]);
    });
});

describe('buildSql', () => {
    const sql: string = buildSql(planGroups(source, classification), source, '-- header');

    it('成員用頻道 ID／Twitch login 比對，不用名字', () => {
        expect(sql).toContain("v.youtube_channel_id in ('UCice')");
        expect(sql).toContain("lower(v.twitch_channel_id) in ('onlytwitch')");
        expect(sql).not.toMatch(/set group_id = g\.id[^;]*name in/);
    });

    it('套用前先備份到不對外的 backup schema', () => {
        expect(sql).toContain('create schema if not exists backup;');
        expect(sql).toContain('create table if not exists backup.vtubers_group_20260929 as select id, group_id, activity from public.vtubers;');
        expect(sql.indexOf('backup.vtuber_groups_20260929')).toBeLessThan(sql.indexOf('insert into public.vtuber_groups'));
    });

    it('掛到未查證團體時不覆蓋已有的人工所屬；查證過的團體照常覆蓋', () => {
        const unverifiedLine = sql.split('\n').find((l) => l.includes("g.name = '沒查過的團'"));
        expect(unverifiedLine).toContain("v.group_id is null or v.group_id in (select id from public.vtuber_groups where kind = 'unverified')");
        const agencyLine = sql.split('\n').find((l) => l.includes("g.name = '子午計畫'") && l.includes('set group_id'));
        expect(agencyLine).not.toContain('v.group_id is null or');
    });

    it('查證過的團體 upsert 覆蓋；未查證的已存在就不動', () => {
        expect(sql).toMatch(/values \('子午計畫', 'TW', 'agency'[^;]*on conflict \(name\) do update/);
        expect(sql).toMatch(/\('沒查過的團', 'TW', 'unverified'\)\s+on conflict \(name\) do nothing/);
    });

    it('parent 與成員更新都只改有變的列（可重跑）', () => {
        expect(sql).toContain('and parent_id is distinct from');
        expect(sql).toContain('and v.group_id is distinct from g.id');
    });

    it('字串中的單引號會跳脫', () => {
        const s2: string = buildSql(planGroups([{ name: "O'Neil團", members: [m('甲', 'UCa')] }], { groups: [], companies: [] }), [], '--');
        expect(s2).toContain("'O''Neil團'");
    });
});
