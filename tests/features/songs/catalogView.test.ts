// 歌回目錄檢視純函式：排序／搜尋（自 SongsPage 搬出，行為不變）與 VTuber 清單推導、篩選
import { describe, it, expect } from 'vitest';
import {
    videoPlays,
    sortCatalog,
    filterCatalog,
    vtuberKey,
    deriveVtubers,
    filterByVtuber,
} from '../../../src/features/songs/lib/catalogView';
import type { SongVideo, SongSegment, SongVtuber } from '../../../src/features/songs/songsSource';

const seg = (code: string, videoId: string, title: string, artist: string | null, plays = 0): SongSegment => ({
    code, videoId, start: 0, end: 100, title, artist, plays,
});

const video = (
    videoId: string,
    title: string,
    streamedAt: string | null,
    vtuber: SongVtuber | null,
    segments: SongSegment[],
): SongVideo => ({ videoId, title, streamedAt, vtuber, segments });

const hoshi: SongVtuber = { id: 'v1', name: '星川測試', img: 'https://img/hoshi.png' };
const tsuki: SongVtuber = { id: 'v2', name: '月見測試', img: null };

// A：最舊、總播放 3；B：最新、總播放 30；C：中間、總播放 12
const A = video('aaaaaaaaaaa', '舊歌回', '2026-09-01T12:00:00Z', hoshi, [
    seg('aaaaaaa1', 'aaaaaaaaaaa', '夜に駆ける', 'YOASOBI', 1),
    seg('aaaaaaa2', 'aaaaaaaaaaa', '紅蓮華', 'LiSA', 2),
]);
const B = video('bbbbbbbbbbb', '新歌回', '2026-10-20T12:00:00Z', tsuki, [
    seg('bbbbbbb1', 'bbbbbbbbbbb', '小幸運', '田馥甄', 30),
]);
const C = video('ccccccccccc', '中歌回', '2026-10-01T12:00:00Z', hoshi, [
    seg('ccccccc1', 'ccccccccccc', '千本桜', '初音ミク', 5),
    seg('ccccccc2', 'ccccccccccc', 'Lemon', '米津玄師', 7),
]);

describe('videoPlays', () => {
    it('回傳所有片段播放次數總和，沒有片段時為 0', () => {
        expect(videoPlays(C)).toBe(12);
        expect(videoPlays(video('ddddddddddd', 'x', null, null, []))).toBe(0);
    });
});

describe('sortCatalog', () => {
    it('latest 依開台時間由新到舊排列', () => {
        expect(sortCatalog([A, B, C], 'latest').map((v) => v.videoId)).toEqual(['bbbbbbbbbbb', 'ccccccccccc', 'aaaaaaaaaaa']);
    });

    it('popular 依總播放次數由多到少排列', () => {
        expect(sortCatalog([A, B, C], 'popular').map((v) => v.videoId)).toEqual(['bbbbbbbbbbb', 'ccccccccccc', 'aaaaaaaaaaa']);
        // 與 latest 順序不同的資料：舊的那場播放最多
        const hot = video('eeeeeeeeeee', '舊但很紅', '2026-01-01T00:00:00Z', hoshi, [seg('eeeeeee1', 'eeeeeeeeeee', '熱門曲', null, 999)]);
        expect(sortCatalog([B, hot], 'popular').map((v) => v.videoId)).toEqual(['eeeeeeeeeee', 'bbbbbbbbbbb']);
        expect(sortCatalog([B, hot], 'latest').map((v) => v.videoId)).toEqual(['bbbbbbbbbbb', 'eeeeeeeeeee']);
    });

    it('回傳新陣列，不修改輸入的順序', () => {
        const input = [A, B, C];
        const out = sortCatalog(input, 'latest');
        expect(out).not.toBe(input);
        expect(input.map((v) => v.videoId)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']);
    });
});

describe('filterCatalog', () => {
    it('空白搜尋字串回傳全部歌回', () => {
        expect(filterCatalog([A, B, C], '').map((v) => v.videoId)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']);
    });

    it('依原唱搜尋（不分大小寫）只留命中的歌，沒命中的歌回整支去掉', () => {
        const out = filterCatalog([A, B, C], 'lisa');
        expect(out.map((v) => v.videoId)).toEqual(['aaaaaaaaaaa']);
        expect(out[0].segments.map((s) => s.code)).toEqual(['aaaaaaa2']);
    });

    it('依歌名搜尋只留命中的歌', () => {
        const out = filterCatalog([A, B, C], 'lemon');
        expect(out.map((v) => v.videoId)).toEqual(['ccccccccccc']);
        expect(out[0].segments.map((s) => s.code)).toEqual(['ccccccc2']);
    });

    it('依 VTuber 名稱搜尋保留該 VTuber 整支歌回的所有歌', () => {
        const out = filterCatalog([A, B, C], '星川');
        expect(out.map((v) => v.videoId)).toEqual(['aaaaaaaaaaa', 'ccccccccccc']);
        expect(out[0].segments).toHaveLength(2);
        expect(out[1].segments).toHaveLength(2);
    });

    it('完全沒有命中時回傳空陣列', () => {
        expect(filterCatalog([A, B, C], '不存在的關鍵字zzz')).toEqual([]);
    });
});

describe('vtuberKey', () => {
    it('id 非空時回 id，id 為空字串時回 name:名稱', () => {
        expect(vtuberKey({ id: 'v1', name: '星川測試', img: null })).toBe('v1');
        expect(vtuberKey({ id: '', name: '無編號', img: null })).toBe('name:無編號');
    });
});

describe('deriveVtubers', () => {
    it('同 id 多場合併：場數、首數加總，最新開台時間取最大值', () => {
        const out = deriveVtubers([A, B, C]);
        const h = out.find((x) => x.key === 'v1');
        expect(h).toMatchObject({ key: 'v1', id: 'v1', name: '星川測試', img: 'https://img/hoshi.png', videoCount: 2, songCount: 4 });
        expect(h?.latestAt).toBe(Date.parse('2026-10-01T12:00:00Z'));
        const t = out.find((x) => x.key === 'v2');
        expect(t).toMatchObject({ videoCount: 1, songCount: 1, img: null });
    });

    it('vtuber 為 null 的影片不納入清單', () => {
        const orphan = video('fffffffffff', '沒標 VTuber', '2026-10-25T00:00:00Z', null, [seg('fffffff1', 'fffffffffff', '歌', null)]);
        const out = deriveVtubers([orphan, B]);
        expect(out.map((x) => x.key)).toEqual(['v2']);
    });

    it('排序：最新開台的在前，沒有開台時間的排最後，時間相同依名稱', () => {
        const noDate = video('ggggggggggg', '無日期', null, { id: 'v3', name: '無日期者', img: null }, [seg('ggggggg1', 'ggggggggggg', '歌', null)]);
        const out = deriveVtubers([noDate, A, B]);
        // B(v2 最新 10/20) → A(v1 9/01) → 無日期(v3)
        expect(out.map((x) => x.key)).toEqual(['v2', 'v1', 'v3']);
        expect(out[2].latestAt).toBeNull();

        const same1 = video('hhhhhhhhhhh', 'h', '2026-05-05T00:00:00Z', { id: 'x1', name: 'b 名', img: null }, [seg('hhhhhhh1', 'hhhhhhhhhhh', '歌', null)]);
        const same2 = video('iiiiiiiiiii', 'i', '2026-05-05T00:00:00Z', { id: 'x2', name: 'a 名', img: null }, [seg('iiiiiii1', 'iiiiiiiiiii', '歌', null)]);
        expect(deriveVtubers([same1, same2]).map((x) => x.name)).toEqual(['a 名', 'b 名']);
    });

    it('id 為空的 VTuber 以 name: 開頭的 key 區分，同名合併', () => {
        const mk = (vid: string, code: string) =>
            video(vid, '歌回', '2026-10-01T00:00:00Z', { id: '', name: '無編號', img: null }, [seg(code, vid, '歌', null)]);
        const out = deriveVtubers([mk('jjjjjjjjjjj', 'jjjjjjj1'), mk('kkkkkkkkkkk', 'kkkkkkk1')]);
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ key: 'name:無編號', videoCount: 2, songCount: 2 });
    });

    it('沒有影片時回空陣列', () => {
        expect(deriveVtubers([])).toEqual([]);
    });
});

describe('filterByVtuber', () => {
    it('key 為 null 時原樣回傳全部', () => {
        expect(filterByVtuber([A, B, C], null)).toEqual([A, B, C]);
    });

    it('只留該 VTuber 的歌回且保持原本順序', () => {
        const sorted = sortCatalog([A, B, C], 'latest'); // B, C, A
        expect(filterByVtuber(sorted, 'v1').map((v) => v.videoId)).toEqual(['ccccccccccc', 'aaaaaaaaaaa']);
    });

    it('vtuber 為 null 的影片被篩掉，沒有符合的 key 時回空陣列', () => {
        const orphan = video('fffffffffff', 'x', null, null, []);
        expect(filterByVtuber([orphan, B], 'v2').map((v) => v.videoId)).toEqual(['bbbbbbbbbbb']);
        expect(filterByVtuber([A, B], 'nope')).toEqual([]);
    });

    it('以 name: key 篩選 id 為空的 VTuber', () => {
        const anon = video('lllllllllll', 'x', null, { id: '', name: '無編號', img: null }, []);
        expect(filterByVtuber([anon, A], 'name:無編號').map((v) => v.videoId)).toEqual(['lllllllllll']);
    });
});
