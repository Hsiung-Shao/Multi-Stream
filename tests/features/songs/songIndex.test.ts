// 歌曲索引（v1.3）：songId → 版本清單、VTuber 完整歌單排序、單曲頁版本分組
// 形狀假設（計畫未明列）：SongIndex = { songs: Map<id, 歌>, versions: Map<id, SongEntry[]> }；
// 歌單列 = { song, versions, latestAt, plays }；版本群組 = { key, vtuber, versions }，無 VTuber 的群組 key 為 null
import { describe, it, expect } from 'vitest';
import { buildSongIndex, songsOfVtuber, versionsOfSong, flattenVersions } from '../../../src/features/songs/lib/songIndex';
import { vtuberKey } from '../../../src/features/songs/lib/catalogView';
import type { SongVideo, SongSegment, SongVtuber } from '../../../src/features/songs/songsSource';

const ms = (iso: string) => Date.parse(iso);

const seg = (code: string, videoId: string, start: number, songId: number | null, plays = 0): SongSegment => ({
    code, videoId, start, end: start + 60, title: `歌${songId}`, artist: null, plays, songId, versionNote: null,
} as SongSegment);

const video = (videoId: string, streamedAt: string | null, vtuber: SongVtuber | null, segments: SongSegment[]): SongVideo => ({
    videoId, title: `歌回 ${videoId}`, streamedAt, vtuber, segments,
});

const dictOf = (rows: [number, string, string | null][]) => new Map(rows.map(([id, title, artist]) => [id, { id, title, artist }]));

const codes = (entries: { segment: SongSegment }[]) => entries.map((e) => e.segment.code);

const X: SongVtuber = { id: 'x1', name: 'X', img: null };
const Y: SongVtuber = { id: 'y1', name: 'Y', img: null };
const NAMED: SongVtuber = { id: '', name: '無ID', img: null };

describe('buildSongIndex（L4）', () => {
    const dict = dictOf([[1, 'Alpha', 'AA'], [2, 'Beta', null], [3, 'Gamma', null]]);
    // 故意亂序輸入：V3（無日期）、V1、V2
    const V3 = video('vvvvvvvvv03', null, Y, [seg('c0000301', 'vvvvvvvvv03', 0, 1)]);
    const V1 = video('vvvvvvvvv01', '2026-10-01T12:00:00Z', X, [
        seg('c0000102', 'vvvvvvvvv01', 300, 1),
        seg('c0000101', 'vvvvvvvvv01', 50, 1),
        seg('c0000103', 'vvvvvvvvv01', 0, 2),
        seg('c0000104', 'vvvvvvvvv01', 900, null),
    ]);
    const V2 = video('vvvvvvvvv02', '2026-10-10T12:00:00Z', X, [seg('c0000201', 'vvvvvvvvv02', 0, 1)]);
    const index = buildSongIndex([V3, V1, V2], dict);

    it('同一首歌的版本依開台時間新到舊，沒有時間的排最後', () => {
        const versions = index.versions.get(1)!;
        expect(codes(versions)).toEqual(['c0000201', 'c0000101', 'c0000102', 'c0000301']);
        expect(versions[0].video.videoId).toBe('vvvvvvvvv02');
    });

    it('同一場裡同一首出現多次時依 start 由小到大', () => {
        const sameVideo = codes(index.versions.get(1)!).filter((c) => c.startsWith('c00001'));
        expect(sameVideo).toEqual(['c0000101', 'c0000102']);
    });

    it('沒有任何版本的歌不放進 versions，songId 為 null 的片段不收', () => {
        expect(index.versions.has(3)).toBe(false);
        expect(codes(index.versions.get(2)!)).toEqual(['c0000103']);
        const all = [...index.versions.values()].flat().map((e) => e.segment.code);
        expect(all).not.toContain('c0000104');
    });

    it('字典歌曲原樣保留在 songs', () => {
        expect(index.songs.get(1)).toMatchObject({ id: 1, title: 'Alpha', artist: 'AA' });
        expect(index.songs.has(3)).toBe(true);
    });
});

describe('songsOfVtuber（L5）', () => {
    const dict = dictOf([[1, 'Alpha', null], [2, 'Beta', null], [3, 'Charlie', null], [4, 'Delta', null], [5, 'Echo', null], [6, 'Foxtrot', null], [7, 'Golf', null]]);
    const videos = [
        video('xxxxxxxxx01', '2026-10-01T00:00:00Z', X, [
            seg('x0000101', 'xxxxxxxxx01', 0, 1, 1),
            seg('x0000102', 'xxxxxxxxx01', 60, 2, 2),
            seg('x0000103', 'xxxxxxxxx01', 120, 3, 3),
            seg('x0000199', 'xxxxxxxxx01', 180, null, 50),
        ]),
        video('xxxxxxxxx02', '2026-10-10T00:00:00Z', X, [
            seg('x0000201', 'xxxxxxxxx02', 0, 1, 10),
            seg('x0000202', 'xxxxxxxxx02', 60, 5, 0),
        ]),
        video('xxxxxxxxx03', '2026-09-01T00:00:00Z', X, [
            seg('x0000301', 'xxxxxxxxx03', 0, 3, 4),
            seg('x0000302', 'xxxxxxxxx03', 60, 2, 5),
            seg('x0000303', 'xxxxxxxxx03', 120, 6, 0),
        ]),
        video('xxxxxxxxx04', null, X, [seg('x0000401', 'xxxxxxxxx04', 0, 4, 0)]),
        video('xxxxxxxxx05', '2026-08-01T00:00:00Z', X, [seg('x0000501', 'xxxxxxxxx05', 0, 3, 5)]),
        video('yyyyyyyyy01', '2026-10-20T00:00:00Z', Y, [
            seg('y0000101', 'yyyyyyyyy01', 0, 1, 100),
            seg('y0000102', 'yyyyyyyyy01', 60, 7, 0),
        ]),
        video('nnnnnnnnn01', '2026-10-15T00:00:00Z', NAMED, [seg('n0000101', 'nnnnnnnnn01', 0, 2, 7)]),
        video('zzzzzzzzz01', '2026-10-16T00:00:00Z', null, [seg('z0000101', 'zzzzzzzzz01', 0, 1, 9)]),
    ];
    const index = buildSongIndex(videos, dict);
    const ids = (rows: { song: { id: number } }[]) => rows.map((r) => r.song.id);

    it("'latest'：依最新一場新到舊，null 排最後，相同時依歌名", () => {
        // 1、5 最新=10-10（Alpha < Echo）；2、3 最新=10-01（Beta < Charlie）；6=09-01；4 無日期
        expect(ids(songsOfVtuber(index, 'x1', 'latest'))).toEqual([1, 5, 2, 3, 6, 4]);
    });

    it("'count'：依版本數由多到少，相同時依 latestAt 新到舊", () => {
        // 3 有 3 版；1、2 各 2 版（10-10 > 10-01）；5、6、4 各 1 版（10-10 > 09-01 > null）
        expect(ids(songsOfVtuber(index, 'x1', 'count'))).toEqual([3, 1, 2, 5, 6, 4]);
    });

    it('latestAt 是該 VTuber 自己版本中最新的一場，plays 是各版本加總', () => {
        const rows = songsOfVtuber(index, 'x1', 'latest');
        const one = rows.find((r) => r.song.id === 1)!;
        expect(one.latestAt).toBe(ms('2026-10-10T00:00:00Z'));
        expect(one.plays).toBe(11);
        expect(rows.find((r) => r.song.id === 3)!.plays).toBe(12);
        expect(rows.find((r) => r.song.id === 4)!.latestAt).toBeNull();
    });

    it('排除別位 VTuber 與沒有 VTuber 的版本，也排除 songId 為 null 的片段', () => {
        const rows = songsOfVtuber(index, 'x1', 'latest');
        expect(ids(rows)).not.toContain(7);
        const one = rows.find((r) => r.song.id === 1)!;
        expect(codes(one.versions)).toEqual(['x0000201', 'x0000101']);
        expect(rows.flatMap((r) => codes(r.versions))).not.toContain('x0000199');
    });

    it('VTuber 鍵沿用 catalogView.vtuberKey（沒有 id 用 name:<名稱>）', () => {
        const key = vtuberKey(NAMED);
        expect(key).toBe('name:無ID');
        const rows = songsOfVtuber(index, key, 'latest');
        expect(ids(rows)).toEqual([2]);
        expect(codes(rows[0].versions)).toEqual(['n0000101']);
    });

    it('沒有這位 VTuber 時回空陣列', () => {
        expect(songsOfVtuber(index, 'nobody', 'latest')).toEqual([]);
        expect(songsOfVtuber(index, 'nobody', 'count')).toEqual([]);
    });
});

describe('versionsOfSong / flattenVersions（L6）', () => {
    const dict = dictOf([[1, 'Alpha', null], [2, 'Beta', null]]);
    // 每個 VTuber 的每場各唱歌 1 一次；dates 的長度就是該 VTuber 的版本數
    const mk = (prefix: string, vt: SongVtuber | null, dates: string[]) =>
        dates.map((d, i) => video(`${prefix}-${i}`, d, vt, [seg(`${prefix}-${i}`, `${prefix}-${i}`, 0, 1)]));
    const V: SongVtuber = { id: 'v1', name: 'V', img: null };
    const W: SongVtuber = { id: 'w1', name: 'W', img: null };
    const Z: SongVtuber = { id: 'z1', name: 'Z', img: null };
    const P: SongVtuber = { id: 'p1', name: 'Pa', img: null };
    const Q: SongVtuber = { id: 'q1', name: 'Qb', img: null };
    const videos = [
        ...mk('xa', X, ['2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z']),
        ...mk('ya', Y, ['2026-10-20T00:00:00Z']),
        ...mk('za', Z, ['2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z', '2026-08-03T00:00:00Z']),
        ...mk('wa', W, ['2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z']),
        ...mk('va', V, ['2026-09-30T00:00:00Z', '2026-10-05T00:00:00Z']),
        ...mk('pa', P, ['2026-07-01T00:00:00Z']),
        ...mk('qa', Q, ['2026-07-01T00:00:00Z']),
        ...mk('na', null, ['2026-10-25T00:00:00Z', '2026-10-24T00:00:00Z', '2026-10-23T00:00:00Z', '2026-10-22T00:00:00Z', '2026-10-21T00:00:00Z']),
        video('bbbbbbbbb01', '2026-10-01T00:00:00Z', X, [seg('b0000001', 'bbbbbbbbb01', 0, 2)]),
    ];
    const index = buildSongIndex(videos, dict);
    const keys = (groups: { key: string | null }[]) => groups.map((g) => g.key);

    it('沒指定 from：依版本數多到少、再依最新一場、再依名稱，沒有 VTuber 的排最後', () => {
        // W、Z 各 3 版（W 最新 09-01 > Z 08-03）；V、X 各 2 版（V 10-05 > X 10-02）；
        // Y、Pa、Qb 各 1 版（Y 10-20 最新；Pa、Qb 同日依名稱）；無 VTuber 有 5 版仍墊底
        expect(keys(versionsOfSong(index, 1, null))).toEqual(['w1', 'z1', 'v1', 'x1', 'y1', 'p1', 'q1', null]);
    });

    it('from 那位排第一，其餘維持原規則', () => {
        expect(keys(versionsOfSong(index, 1, 'x1'))).toEqual(['x1', 'w1', 'z1', 'v1', 'y1', 'p1', 'q1', null]);
        expect(keys(versionsOfSong(index, 1, 'q1'))).toEqual(['q1', 'w1', 'z1', 'v1', 'x1', 'y1', 'p1', null]);
    });

    it('未知的 from（或這首歌沒有該 VTuber 的版本）直接忽略', () => {
        const base = keys(versionsOfSong(index, 1, null));
        expect(keys(versionsOfSong(index, 1, 'nobody'))).toEqual(base);
        expect(keys(versionsOfSong(index, 2, 'z1'))).toEqual(['x1']);
    });

    it('每組的版本依開台時間新到舊', () => {
        const x = versionsOfSong(index, 1, null).find((g) => g.key === 'x1')!;
        expect(x.versions.map((e) => e.video.streamedAt)).toEqual(['2026-10-02T00:00:00Z', '2026-10-01T00:00:00Z']);
    });

    it('找不到這首歌回空陣列', () => {
        expect(versionsOfSong(index, 999, 'x1')).toEqual([]);
    });

    it('flattenVersions 依群組順序攤平成單一陣列', () => {
        const groups = versionsOfSong(index, 1, 'y1');
        const flat = flattenVersions(groups);
        expect(flat).toEqual(groups.flatMap((g) => g.versions));
        expect(flat).toHaveLength(2 + 1 + 3 + 3 + 2 + 1 + 1 + 5);
        expect(flat[0]).toBe(groups[0].versions[0]);
        expect(flattenVersions([])).toEqual([]);
    });
});
