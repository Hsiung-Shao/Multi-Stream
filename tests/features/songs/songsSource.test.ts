// 歌曲目錄來源：短 key JSON 轉前端型別、壞資料丟棄、code 查表、15 秒逾時
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    parseSongCatalog, parseSongDictionary, buildCodeIndex, resolveCodes, fetchSongCatalog, toQueueItem, CATALOG_TIMEOUT_MS, CATALOG_URL,
} from '../../../src/features/songs/songsSource';

const RAW = [
    {
        v: 'aaaaaaaaaaa',
        t: '歌回 #1',
        d: '2026-10-01T12:00:00Z',
        vt: { i: 'vt-1', n: '測試 VTuber', img: 'https://example.com/a.png' },
        s: [
            ['abcd1234', 10, 200, '第一首', '原唱 A'],
            ['efgh5678', 200, 420, '第二首', null],
        ],
    },
    { v: 'bbbbbbbbbbb', t: '沒有 VTuber', d: null, vt: null, s: [['ijkl9012', 0, 60, '單曲', '']] },
];

afterEach(() => {
    vi.useRealTimers();
});

describe('parseSongCatalog', () => {
    it('短 key 轉成前端型別並帶上 videoId', () => {
        const videos = parseSongCatalog(RAW);
        expect(videos).toHaveLength(2);
        expect(videos[0]).toMatchObject({
            videoId: 'aaaaaaaaaaa',
            title: '歌回 #1',
            streamedAt: '2026-10-01T12:00:00Z',
            vtuber: { id: 'vt-1', name: '測試 VTuber', img: 'https://example.com/a.png' },
        });
        expect(videos[0].segments[0]).toEqual({ code: 'abcd1234', videoId: 'aaaaaaaaaaa', start: 10, end: 200, title: '第一首', artist: '原唱 A', plays: 0, songId: null, versionNote: null });
        expect(videos[1].vtuber).toBeNull();
        expect(videos[1].segments[0].artist).toBeNull();
    });

    it('影片 ID、code、時間不合法的項目丟棄，其餘保留', () => {
        const videos = parseSongCatalog([
            { v: 'bad', t: 'x', s: [] },
            {
                v: 'ccccccccccc', t: '混合', vt: null,
                s: [['UPPER123', 0, 10, 'a', null], ['good0001', 50, 40, 'b', null], ['good0002', 0, 30, '  ', null], ['good0003', 0, 30, '留下', null], 'junk'],
            },
        ]);
        expect(videos.map((v) => v.videoId)).toEqual(['ccccccccccc']);
        expect(videos[0].segments.map((s) => s.code)).toEqual(['good0003']);
    });

    it('不是陣列時回空陣列', () => {
        expect(parseSongCatalog({ ok: false })).toEqual([]);
    });
});

describe('buildCodeIndex / resolveCodes', () => {
    it('依 code 保序取出片段並回報找不到的數量', () => {
        const index = buildCodeIndex(parseSongCatalog(RAW));
        const { found, missing } = resolveCodes(index, ['ijkl9012', 'zzzz0000', 'abcd1234']);
        expect(found.map((e) => e.segment.code)).toEqual(['ijkl9012', 'abcd1234']);
        expect(found[0].video.videoId).toBe('bbbbbbbbbbb');
        expect(missing).toBe(1);
    });

    it('片段轉佇列項目只帶 code、videoId 與起訖', () => {
        const [video] = parseSongCatalog(RAW);
        expect(toQueueItem(video.segments[1])).toEqual({ code: 'efgh5678', videoId: 'aaaaaaaaaaa', start: 200, end: 420 });
    });
});

describe('fetchSongCatalog', () => {
    it('成功時回傳影片清單與 code 查表', async () => {
        const fetchFn = vi.fn(async () => new Response(JSON.stringify(RAW), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        const catalog = await fetchSongCatalog(undefined, fetchFn as unknown as typeof fetch);
        expect(fetchFn).toHaveBeenCalledWith(CATALOG_URL, expect.objectContaining({ credentials: 'same-origin' }));
        expect(catalog.videos).toHaveLength(2);
        expect(catalog.byCode.get('efgh5678')?.segment.title).toBe('第二首');
    });

    it('非 2xx 回應丟錯', async () => {
        const fetchFn = vi.fn(async () => new Response('{}', { status: 502 }));
        await expect(fetchSongCatalog(undefined, fetchFn as unknown as typeof fetch)).rejects.toThrow('catalog 502');
    });

    it('回應不是陣列時丟錯', async () => {
        const fetchFn = vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 200 }));
        await expect(fetchSongCatalog(undefined, fetchFn as unknown as typeof fetch)).rejects.toThrow('bad payload');
    });

    it('15 秒沒回應就中止請求', async () => {
        vi.useFakeTimers();
        let seenSignal: AbortSignal | undefined;
        const fetchFn = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
            seenSignal = init?.signal ?? undefined;
            seenSignal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }));
        const pending = fetchSongCatalog(undefined, fetchFn as unknown as typeof fetch);
        const settled = expect(pending).rejects.toThrow('aborted');
        await vi.advanceTimersByTimeAsync(CATALOG_TIMEOUT_MS - 1);
        expect(seenSignal?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(seenSignal?.aborted).toBe(true);
        await settled;
    });

    it('外部取消訊號會連動中止', async () => {
        const outer = new AbortController();
        let seenSignal: AbortSignal | undefined;
        const fetchFn = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
            seenSignal = init?.signal ?? undefined;
            seenSignal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }));
        const pending = fetchSongCatalog(outer.signal, fetchFn as unknown as typeof fetch);
        outer.abort();
        await expect(pending).rejects.toThrow('aborted');
        expect(seenSignal?.aborted).toBe(true);
    });
});

describe('parseSongCatalog 播放次數（v1.1）', () => {
    it('目錄舊格式缺播放次數視為 0，有第 6 欄就帶入', () => {
        const [video] = parseSongCatalog([
            {
                v: 'ddddddddddd', t: '播放次數', vt: null,
                s: [['play0001', 0, 60, '舊格式', null], ['play0002', 60, 120, '有次數', null, 12], ['play0003', 120, 180, '壞值', null, 'many']],
            },
        ]);
        expect(video.segments.map((s) => s.plays)).toEqual([0, 12, 0]);
    });
});

// ---- v1.3：8 欄片段與歌曲字典（L1–L3） ----
const DICT = { songs: [[12, '想你時風起', '原唱 A'], [13, '無原唱歌', null]] };
const ROW8 = (overrides: unknown[]) => [{ v: 'eeeeeeeeeee', t: '八欄', vt: null, s: [overrides] }, DICT];
const firstSeg = (rows: unknown[]) => parseSongCatalog(rows)[0].segments[0];
const note = (value: unknown) => firstSeg(ROW8(['note0001', 0, 60, '歌', null, 0, 12, value])).versionNote;

describe('parseSongCatalog 8 欄（L1）', () => {
    it('第 7、8 欄帶入 songId 與 versionNote', () => {
        expect(firstSeg(ROW8(['seg80001', 10, 200, '想你時風起', '原唱 A', 3, 12, '練歌版']))).toEqual({
            code: 'seg80001', videoId: 'eeeeeeeeeee', start: 10, end: 200, title: '想你時風起', artist: '原唱 A', plays: 3, songId: 12, versionNote: '練歌版',
        });
    });

    it('第 7 欄不是正安全整數時 songId 為 null，片段仍保留', () => {
        for (const bad of [0, -3, 1.5, '12', null, Number.MAX_SAFE_INTEGER + 1, NaN]) {
            const seg = firstSeg(ROW8(['bad00001', 0, 60, '歌', null, 0, bad, null]));
            expect(seg.code).toBe('bad00001');
            expect(seg.songId).toBeNull();
        }
    });

    it('第 8 欄 trim 後 1–30 字才當 versionNote，其餘為 null', () => {
        expect(note('  清唱  ')).toBe('清唱');
        expect(note('x')).toBe('x');
        expect(note('x'.repeat(30))).toBe('x'.repeat(30));
        expect(note(`  ${'x'.repeat(30)}  `)).toBe('x'.repeat(30));
        expect(note('x'.repeat(31))).toBeNull();
        expect(note('')).toBeNull();
        expect(note('   ')).toBeNull();
        expect(note(5)).toBeNull();
        expect(note(null)).toBeNull();
    });
});

describe('parseSongCatalog 舊格式與字典元素（L2）', () => {
    it('6 欄與 7 欄舊格式照樣解析，缺的欄位為 null', () => {
        const [video] = parseSongCatalog([
            { v: 'fffffffffff', t: '舊', vt: null, s: [['old00006', 0, 60, '六欄', null, 4], ['old00007', 60, 120, '七欄', null, 5, 12]] },
            DICT,
        ]);
        expect(video.segments[0]).toMatchObject({ code: 'old00006', plays: 4, songId: null, versionNote: null });
        expect(video.segments[1]).toMatchObject({ code: 'old00007', plays: 5, songId: 12, versionNote: null });
    });

    it('沒有字典的純 6 欄目錄（舊後端）全部 songId、versionNote 為 null', () => {
        const videos = parseSongCatalog(RAW);
        const segs = videos.flatMap((v) => v.segments);
        expect(segs).toHaveLength(3);
        expect(segs.every((s) => s.songId === null && s.versionNote === null)).toBe(true);
    });

    it('尾端字典元素不會被當成影片', () => {
        expect(parseSongCatalog([...RAW, DICT])).toHaveLength(2);
        expect(parseSongCatalog([{ songs: [] }])).toEqual([]);
    });
});

describe('parseSongDictionary（L3）', () => {
    const rows = (dict: ReturnType<typeof parseSongDictionary>) => [...dict!.values()].map((s) => [s.id, s.title, s.artist]);

    it('讀出尾端字典；空字典回空集合而不是 null', () => {
        expect(rows(parseSongDictionary([...RAW, DICT]))).toEqual([[12, '想你時風起', '原唱 A'], [13, '無原唱歌', null]]);
        const empty = parseSongDictionary([{ songs: [] }]);
        expect(empty).not.toBeNull();
        expect(empty!.size).toBe(0);
    });

    it('找不到字典（舊格式、不是陣列、空陣列）回 null', () => {
        expect(parseSongDictionary(RAW)).toBeNull();
        expect(parseSongDictionary({ ok: false })).toBeNull();
        expect(parseSongDictionary([])).toBeNull();
        expect(parseSongDictionary(null)).toBeNull();
    });

    it('字典裡的壞項丟棄，其餘保留', () => {
        const dict = parseSongDictionary([{ songs: [
            [1, '好', null], [0, '零', null], [-2, '負', null], [1.5, '小數', null], ['3', '字串 id', null],
            [4, '', null], [5, 123, null], 'junk', null, [6, '也好', 'X'],
        ] }]);
        expect(rows(dict)).toEqual([[1, '好', null], [6, '也好', 'X']]);
    });

    it('片段 songId 不在字典裡時當 null，在字典裡才保留', () => {
        const [video] = parseSongCatalog([
            { v: 'ggggggggggg', t: '對照', vt: null, s: [['dic00012', 0, 60, '在', null, 0, 12, null], ['dic00099', 60, 120, '不在', null, 0, 99, '清唱']] },
            DICT,
        ]);
        expect(video.segments.map((s) => s.songId)).toEqual([12, null]);
    });
});

describe('fetchSongCatalog 帶 songs（L3）', () => {
    const respond = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

    it('新格式：videos 不含字典，songs 是索引並含各歌版本', async () => {
        const body = [{ v: 'hhhhhhhhhhh', t: '新', d: '2026-10-01T00:00:00Z', vt: null, s: [['new00001', 0, 60, '想你時風起', '原唱 A', 0, 12, null]] }, DICT];
        const catalog = await fetchSongCatalog(undefined, respond(body));
        expect(catalog.videos).toHaveLength(1);
        expect(catalog.byCode.size).toBe(1);
        expect(catalog.songs).not.toBeNull();
        expect(catalog.songs!.versions.get(12)).toHaveLength(1);
        expect(catalog.songs!.songs.get(13)).toMatchObject({ id: 13, title: '無原唱歌' });
    });

    it('舊格式（沒有字典）：songs 為 null，影片照常', async () => {
        const catalog = await fetchSongCatalog(undefined, respond(RAW));
        expect(catalog.songs).toBeNull();
        expect(catalog.videos).toHaveLength(2);
    });

    it('只有空字典：videos 為空、songs 是空索引', async () => {
        const catalog = await fetchSongCatalog(undefined, respond([{ songs: [] }]));
        expect(catalog.videos).toEqual([]);
        expect(catalog.songs).not.toBeNull();
        expect(catalog.songs!.versions.size).toBe(0);
    });
});
