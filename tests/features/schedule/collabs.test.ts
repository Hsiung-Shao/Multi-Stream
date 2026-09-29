// 合作藝人（vtuber_group_links role=collaborator）：snapshot 的 collabs、所屬篩選、名冊合作區、個人頁；表還沒上線時退回
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSnapshot, resolveCollabs, resolveGroups, taipeiDate as edgeTaipeiDate, type SnapshotSourceRow } from '../../../supabase/functions/_shared/snapshot.ts';
import { channelMatchesQuery, filterStreams, listGroups, matchesAgency } from '../../../src/features/schedule/filters';
import { buildRoster, fetchAgencyRoster } from '../../../src/features/schedule/rosterSource';
import { fetchPerson, resetPersonSourceCache } from '../../../src/features/schedule/personSource';
import { isCollabActive, resetRestConfigCache, taipeiDate } from '../../../src/features/schedule/restClient';
import { DEFAULT_FILTERS, GROUP_ANY_AGENCY, GROUP_NO_AGENCY } from '../../../src/features/schedule/types';
import { makeSnapshot } from './fixtures';

const T0 = Date.parse('2026-09-30T04:00:00Z');
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });
const env = { envUrl: 'http://db', envAnonKey: 'anon' };

const groupRows = [
    { id: 'c', name: '春魚創意', kind: 'agency', parent_id: null },
    { id: 's', name: '瑟拉斯蒂歐Celestial', kind: 'agency', parent_id: 'c' },
    { id: 'q', name: 'SquareLive', kind: 'agency', parent_id: null },
    { id: 'k', name: '某社團', kind: 'circle', parent_id: null },
];

describe('snapshot collabs', () => {
    const groups = resolveGroups(groupRows);

    it('resolveCollabs：取頂層公司、多家去重排序、社團不算', () => {
        const m = resolveCollabs(
            [
                { vtuber_id: 'v1', group_id: 'q' },
                { vtuber_id: 'v1', group_id: 'c' },
                { vtuber_id: 'v1', group_id: 's' },
                { vtuber_id: 'v2', group_id: 'k' },
            ],
            groups,
        );
        expect(m.get('v1')).toEqual(['SquareLive', '春魚創意']);
        expect(m.has('v2')).toBe(false);
    });

    it('buildSnapshot：channels 帶 collabs，排除正式所屬公司；沒有合作不輸出欄位', () => {
        const srow = (vtuber_id: string): SnapshotSourceRow => ({
            id: vtuber_id, vtuber_id, channel_id: 'c', platform: 'youtube', external_id: `Vid${vtuber_id}`, source: 'yt_waiting_room',
            status: 'scheduled', scheduled_start: new Date(T0 + 3600_000).toISOString(), scheduled_end: null, actual_start: null, actual_end: null,
            title: null, category: null, thumbnail_url: null, viewer_count: null, is_schedule_frame: false, fetched_at: new Date(T0).toISOString(), merged_with: null,
        });
        const vt = (id: string, group_id: string | null) => ({ id, name: id, img_url: null, nationality: 'TW', group_id, youtube_channel_id: null, twitch_channel_id: null });
        const snap = buildSnapshot(
            [srow('v1'), srow('v2'), srow('v3')],
            [vt('v1', null), vt('v2', 's'), vt('v3', null)],
            groups,
            T0,
            null,
            new Map([
                ['v1', ['SquareLive', '春魚創意']],
                ['v2', ['春魚創意']], // 正式所屬就是春魚：不重複列為合作
            ]),
        );
        expect(snap.channels.v1.collabs).toEqual(['SquareLive', '春魚創意']);
        expect(snap.channels.v1.agency).toBeUndefined();
        expect(snap.channels.v2.agency).toBe('春魚創意');
        expect('collabs' in snap.channels.v2).toBe(false);
        expect('collabs' in snap.channels.v3).toBe(false);
    });
});

describe('日期', () => {
    it('台北日期：UTC 16:00 起就是隔天；前後端同規則', () => {
        const t = Date.parse('2026-09-30T16:30:00Z'); // 台北 10/1 00:30
        expect(taipeiDate(t)).toBe('2026-10-01');
        expect(edgeTaipeiDate(t)).toBe('2026-10-01');
        expect(taipeiDate(Date.parse('2026-09-30T15:59:00Z'))).toBe('2026-09-30');
    });
    it('isCollabActive：開始當天起、結束當天以前', () => {
        expect(isCollabActive(null, null, '2026-09-30')).toBe(true);
        expect(isCollabActive('2026-10-01', null, '2026-09-30')).toBe(false);
        expect(isCollabActive('2026-09-30', '2026-09-30', '2026-09-30')).toBe(true);
        expect(isCollabActive(null, '2026-09-29', '2026-09-30')).toBe(false);
    });
});

describe('所屬篩選與搜尋', () => {
    it('listGroups：合作也算進人數；只有合作藝人的公司也出現在選單', () => {
        const snap = makeSnapshot();
        snap.channels.v2 = { ...snap.channels.v2, collabs: ['子午計畫', '只有合作的公司'] };
        expect(listGroups(snap)).toEqual(['子午計畫', '只有合作的公司']);
    });

    const collab = { name: '兔姬', nationality: 'TW', collabs: ['SquareLive', '春魚創意'] };

    it('選特定公司會帶出合作藝人；「所有企業勢／非企業勢」只看正式所屬', () => {
        expect(matchesAgency(collab, '春魚創意')).toBe(true);
        expect(matchesAgency(collab, 'SquareLive')).toBe(true);
        expect(matchesAgency(collab, '子午計畫')).toBe(false);
        expect(matchesAgency(collab, GROUP_ANY_AGENCY)).toBe(false);
        expect(matchesAgency(collab, GROUP_NO_AGENCY)).toBe(true);
    });

    it('搜尋合作公司名找得到人', () => {
        expect(channelMatchesQuery(collab, '春魚')).toBe(true);
        expect(channelMatchesQuery(collab, '子午')).toBe(false);
    });

    it('filterStreams：選合作公司時場次出現', () => {
        const snap = makeSnapshot();
        snap.channels.v2 = { ...snap.channels.v2, collabs: ['子午計畫'] };
        const ids = filterStreams(snap, 'upcoming', { ...DEFAULT_FILTERS, group: '子午計畫' }, { youtube: new Set(), twitch: new Set() }).map((s) => s.vtuber_id);
        expect(ids).toContain('v1');
        expect(ids).toContain('v2');
    });
});

describe('名冊合作區', () => {
    const groups = [
        { id: 'c', name: '春魚創意', parent_id: null },
        { id: 's', name: '瑟拉斯蒂歐Celestial', parent_id: 'c' },
    ];
    const v = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, img_url: null, slug: id, activity: 'active', debut_date: null, group_id: null, ...extra });

    it('合作另列；仍合作在前、已結束標 past；正式成員與官方頻道不重複列', () => {
        const r = buildRoster(
            '春魚創意',
            groups,
            [v('m1', { group_id: 's' })],
            [
                { until: '2025-01-01', vtubers: v('舊合作') },
                { until: null, vtubers: v('兔姬') },
                { until: '2026-12-31', vtubers: v('即將結束') },
                { until: null, vtubers: v('m1', { group_id: 's' }) },
                { until: null, vtubers: v('春魚官方', { is_official: true }) },
                { until: null, vtubers: null },
                { since: '2026-12-01', until: null, vtubers: v('還沒開始') },
            ],
            '2026-09-30',
        );
        // 仍合作的在前（依名字），已結束的在後
        const active = ['兔姬', '即將結束'].sort((x, y) => x.localeCompare(y));
        expect(r.collaborators.map((m) => [m.name, m.collab])).toEqual([...active.map((n) => [n, 'active']), ['舊合作', 'past']]);
        expect(r.collabCount).toBe(2);
        expect(r.activeCount).toBe(1);
    });

    it('fetchAgencyRoster：查合作並嵌入藝人；表還沒上線（404）時沒有合作、名冊照常', async () => {
        const make = (linkRes: () => Response) =>
            vi.fn(async (url: string) => {
                const u = decodeURIComponent(url);
                if (u.includes('vtuber_groups?')) return json([{ ...groups[0], children: [groups[1]] }]);
                if (u.includes('vtuber_group_links')) {
                    expect(u).toContain('group_id=in.(c,s)');
                    expect(u).toContain('role=eq.collaborator');
                    expect(u).toContain('vtubers(');
                    return linkRes();
                }
                return json([v('m1', { group_id: 's' })]);
            });
        const ok = await fetchAgencyRoster('春魚創意', { ...env, fetchFn: make(() => json([{ until: null, vtubers: v('兔姬') }])) as unknown as typeof fetch });
        expect(ok?.collaborators.map((m) => m.name)).toEqual(['兔姬']);
        const missing = await fetchAgencyRoster('春魚創意', { ...env, fetchFn: make(() => json({ code: 'PGRST205' }, 404)) as unknown as typeof fetch });
        expect(missing?.collaborators).toEqual([]);
        expect(missing?.activeCount).toBe(1);
    });

    beforeEach(() => resetRestConfigCache());
});

describe('個人頁合作公司', () => {
    beforeEach(() => resetPersonSourceCache());
    const person = { id: 'v9', name: '兔姬', img_url: null, nationality: 'TW', youtube_channel_id: 'UC9', twitch_channel_id: null, slug: 'usagi', schedule_indexable: true, vtuber_groups: null };
    const make = (linkRes: () => Response) =>
        vi.fn(async (url: string) => {
            const u = decodeURIComponent(url);
            if (u.includes('/vtubers?')) return json([person]);
            if (u.includes('vtuber_group_links')) {
                expect(u).toContain('vtuber_id=eq.v9');
                return linkRes();
            }
            return json([]);
        });

    it('只列仍在合作的企業勢（until 未到也算），社團不列', async () => {
        const fetchFn = make(() =>
            json([
                { until: null, vtuber_groups: { name: '春魚創意', kind: 'agency', parent: null } },
                { until: '2099-01-01', vtuber_groups: { name: 'SquareLive', kind: 'agency', parent: null } },
                { until: '2020-01-01', vtuber_groups: { name: '已結束', kind: 'agency', parent: null } },
                { until: null, vtuber_groups: { name: '某社團', kind: 'circle', parent: null } },
            ]),
        );
        const p = await fetchPerson('usagi', { ...env, fetchFn: fetchFn as unknown as typeof fetch, now: T0 });
        expect(p?.channel.collabs).toEqual(['SquareLive', '春魚創意']);
    });

    it('表還沒上線（404）或合作查詢失敗（5xx）時沒有 collabs，頁面照常', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        for (const status of [404, 503]) {
            const p = await fetchPerson('usagi', { ...env, fetchFn: make(() => json({}, status)) as unknown as typeof fetch, now: T0 });
            expect(p?.channel.name).toBe('兔姬');
            expect(p?.channel.collabs).toBeUndefined();
        }
        // 404＝表還沒上線，屬預期，不記錄；5xx 才記
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});
