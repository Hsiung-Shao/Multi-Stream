// 企業勢名冊：分區（子團在前、公司本身最後、空的不輸出）、現役／已畢業計數、graduated_at 未上線時退回
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRoster, fetchAgencyRoster, isOfficialChannel } from '../../../src/features/schedule/rosterSource';
import { resetRestConfigCache } from '../../../src/features/schedule/restClient';

const groups = [
    { id: 'c', name: '春魚創意', parent_id: null },
    { id: 's1', name: '極深空計畫', parent_id: 'c' },
    { id: 's2', name: '瑟拉斯蒂歐', parent_id: 'c' },
    { id: 'e', name: '空的子團', parent_id: 'c' },
];
const row = (id: string, group_id: string, activity = 'active', debut_date: string | null = null, extra: Record<string, unknown> = {}) => ({
    id, name: id, img_url: null, slug: id, activity, debut_date, group_id, ...extra,
});

describe('buildRoster', () => {
    it('子團依人數多到少、公司本身最後；空的子團不出現；區內依出道日', () => {
        const r = buildRoster('春魚創意', groups, [
            row('a', 's1', 'active', '2022-01-01'),
            row('b', 's1', 'active', '2021-01-01'),
            row('c1', 's2', 'active'),
            row('x', 'c', 'graduate', '2020-01-01', { graduated_at: '2023-06-30' }),
            row('y', 's2', 'preparing'),
            row('z', 's1', 'graduate'),
        ]);
        expect(r.sections.map((s) => s.name)).toEqual(['極深空計畫', '瑟拉斯蒂歐', '春魚創意']);
        expect(r.sections[0].members.map((m) => m.id)).toEqual(['b', 'a', 'z']);
        expect(r.activeCount).toBe(4);
        expect(r.graduatedCount).toBe(2);
        expect(r.sections[2].members[0]).toMatchObject({ graduated: '2023-06-30', group: '春魚創意' });
    });
});

describe('離開公司但繼續活動（former_group_id）', () => {
    it('在這家的名冊裡算已畢業，掛在原來的子團；現在的所屬不影響', () => {
        const r = buildRoster('春魚創意', groups, [
            row('now', 's1'),
            { ...row('left', null as unknown as string), former_group_id: 's2', graduated_at: '2025-05-29' },
            { ...row('other', 'zzz'), former_group_id: null },
        ]);
        expect(r.activeCount).toBe(1);
        expect(r.graduatedCount).toBe(1);
        const s2 = r.sections.find((s) => s.name === '瑟拉斯蒂歐')!;
        expect(s2.members[0]).toMatchObject({ id: 'left', activity: 'graduate', graduated: '2025-05-29' });
    });
});

describe('isOfficialChannel', () => {
    it('名字等於公司／團名、或帶官方字樣的是官方頻道，不列入名冊', () => {
        const names = ['子午計畫', 'Limnos'];
        expect(isOfficialChannel('子午計畫', names)).toBe(true);
        expect(isOfficialChannel('子午計畫(官方頻道)', names)).toBe(true);
        expect(isOfficialChannel('LIMNOS', names)).toBe(true);
        expect(isOfficialChannel('ReLive Official Channel', names)).toBe(true);
        // 名字不像官方、但資料庫標了 is_official
        expect(isOfficialChannel('MeridianProject子午計畫', names, true)).toBe(true);
        // 名字裡有 Official 但不是「Official Channel」：不誤殺真人
        expect(isOfficialChannel('Official髭男', names)).toBe(false);
        // 資料庫已有 is_official 欄位（false）：名字剛好等於團名的藝人不再被當成官方頻道；明寫「官方頻道」的仍排除
        expect(isOfficialChannel('子午計畫', names, false)).toBe(false);
        expect(isOfficialChannel('子午計畫(官方頻道)', names, false)).toBe(true);
        expect(isOfficialChannel('煌Kirali', names)).toBe(false);
        const r = buildRoster('子午計畫', [{ id: 'g', name: '子午計畫', parent_id: null }], [row('子午計畫', 'g'), row('煌Kirali', 'g')]);
        expect(r.sections[0].members.map((m) => m.name)).toEqual(['煌Kirali']);
        expect(r.activeCount).toBe(1);
    });
});

describe('fetchAgencyRoster', () => {
    beforeEach(() => resetRestConfigCache());
    const env = { envUrl: 'http://db', envAnonKey: 'anon' };
    const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });

    it('查公司 → 子團 → 成員；查無此公司回 null', async () => {
        const fetchFn = vi.fn(async (url: string) => {
            const u = decodeURIComponent(url);
            if (u.includes('vtuber_groups') && u.includes('name=eq.春魚創意')) {
                expect(u).toContain('children:vtuber_groups!parent_id(id,name,parent_id)');
                return json([{ ...groups[0], children: groups.slice(1) }]);
            }
            if (u.includes('/vtubers?')) {
                expect(u).toContain('or=(group_id.in.(c,s1,s2,e),former_group_id.in.(c,s1,s2,e))');
                expect(u).toContain('graduated_at');
                expect(u).toContain('former_group_id');
                return json([row('a', 's1')]);
            }
            return json([]);
        });
        const r = await fetchAgencyRoster('春魚創意', { ...env, fetchFn: fetchFn as unknown as typeof fetch });
        expect(r?.sections.map((s) => s.name)).toEqual(['極深空計畫']);
        const none = await fetchAgencyRoster('不存在', { ...env, fetchFn: (async () => json([])) as unknown as typeof fetch });
        expect(none).toBeNull();
    });

    it('graduated_at 還沒上線（400）時退回不帶這欄', async () => {
        const fetchFn = vi.fn(async (url: string) => {
            const u = decodeURIComponent(url);
            if (u.includes('vtuber_groups')) return json([{ ...groups[0], children: [] }]);
            if (u.includes('graduated_at')) return json({ code: '42703' }, 400);
            return json([row('a', 'c')]);
        });
        const r = await fetchAgencyRoster('春魚創意', { ...env, fetchFn: fetchFn as unknown as typeof fetch });
        expect(r?.activeCount).toBe(1);
    });
});
