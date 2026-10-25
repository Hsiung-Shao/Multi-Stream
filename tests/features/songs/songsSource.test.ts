// 歌曲目錄來源：短 key JSON 轉前端型別、壞資料丟棄、code 查表、15 秒逾時
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    parseSongCatalog, buildCodeIndex, resolveCodes, fetchSongCatalog, toQueueItem, CATALOG_TIMEOUT_MS, CATALOG_URL,
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
        expect(videos[0].segments[0]).toEqual({ code: 'abcd1234', videoId: 'aaaaaaaaaaa', start: 10, end: 200, title: '第一首', artist: '原唱 A', plays: 0 });
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
