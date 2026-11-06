// 歌回合唱成員＋剪輯來源（前端純邏輯）：目錄解析 FE1～FE3、deriveVtubers／collabsOfVtuber（FE6）、fetchOEmbed
import { describe, it, expect } from 'vitest';
import { parseSongCatalog } from '../../../src/features/songs/songsSource';
import { deriveVtubers } from '../../../src/features/songs/lib/catalogView';
import { collabsOfVtuber } from '../../../src/features/songs/lib/songIndex';
import { fetchOEmbed } from '../../../src/features/songs/streamLookup';

const DICT = { songs: [[12, '想你時風起', '原唱 A']] };
const CS = { n: '剪輯頻道', u: 'https://www.youtube.com/@clipper' };

/** 單一影片、單一片段（9 欄，第 9 欄由參數決定）的目錄 */
const oneSeg = (performers: unknown, extra: Record<string, unknown> = {}) => [
    { v: 'aaaaaaaaaaa', t: '歌回', d: '2026-10-01T12:00:00Z', vt: { i: 'v1', n: '星川', img: null }, s: [['perf0001', 0, 60, '歌', null, 0, 12, null, performers]], ...extra },
    DICT,
];
const firstSeg = (rows: unknown[]) => parseSongCatalog(rows)[0].segments[0] as unknown as { performers: unknown };

describe('FE1 parseSongCatalog 合唱與剪輯來源', () => {
    it('FE1 第 9 欄解析成 performers，站內帶 vtuberId、站外為 null', () => {
        const seg = firstSeg(oneSeg([['vt-2', '月見'], [null, '站外歌手']]));
        expect(seg.performers).toEqual([
            { vtuberId: 'vt-2', name: '月見' },
            { vtuberId: null, name: '站外歌手' },
        ]);
    });

    it('FE1 影片 cs 解析成 clipSource，沒有 cs 為 null', () => {
        const [withCs] = parseSongCatalog(oneSeg([], { cs: CS })) as unknown as { clipSource: unknown }[];
        expect(withCs.clipSource).toEqual({ name: '剪輯頻道', url: 'https://www.youtube.com/@clipper' });
        const [without] = parseSongCatalog(oneSeg([])) as unknown as { clipSource: unknown }[];
        expect(without.clipSource).toBeNull();
    });

    it('FE1 cs 的 n／u 不合法或 u 不是 https 開頭時 clipSource 為 null，影片仍保留', () => {
        const bads: unknown[] = [
            { n: '', u: CS.u },
            { n: CS.n, u: '' },
            { n: 5, u: CS.u },
            { n: CS.n, u: 7 },
            { n: CS.n },
            { u: CS.u },
            { n: CS.n, u: 'http://www.youtube.com/@clipper' },
            { n: CS.n, u: 'javascript:alert(1)' },
            'junk',
            null,
        ];
        for (const cs of bads) {
            const videos = parseSongCatalog(oneSeg([], { cs })) as unknown as { videoId: string; clipSource: unknown }[];
            expect(videos).toHaveLength(1);
            expect(videos[0].clipSource).toBeNull();
        }
    });

    it('FE1 站內合唱者與片段其他欄位同時保留（不影響 songId、versionNote）', () => {
        const seg = parseSongCatalog([
            { v: 'aaaaaaaaaaa', t: '歌回', vt: null, s: [['perf0002', 10, 70, '歌', '原唱', 3, 12, '清唱', [['vt-2', '月見']]]] },
            DICT,
        ])[0].segments[0];
        expect(seg).toMatchObject({ code: 'perf0002', start: 10, end: 70, plays: 3, songId: 12, versionNote: '清唱' });
        expect((seg as unknown as { performers: unknown }).performers).toEqual([{ vtuberId: 'vt-2', name: '月見' }]);
    });
});

describe('FE2 舊格式目錄', () => {
    it('FE2 6 欄、8 欄片段的 performers 為空陣列，影片 clipSource 為 null', () => {
        const videos = parseSongCatalog([
            {
                v: 'bbbbbbbbbbb', t: '舊', vt: null,
                s: [['old00006', 0, 60, '六欄', null, 4], ['old00008', 60, 120, '八欄', null, 5, 12, '練歌版']],
            },
            DICT,
        ]) as unknown as { clipSource: unknown; segments: { performers: unknown }[] }[];
        expect(videos[0].clipSource).toBeNull();
        expect(videos[0].segments.map((s) => s.performers)).toEqual([[], []]);
    });

    it('FE2 第 9 欄不是陣列（字串、物件、null）一律當空陣列，片段保留', () => {
        for (const bad of ['oops', { a: 1 }, null, 5]) {
            const seg = firstSeg(oneSeg(bad));
            expect(seg.performers).toEqual([]);
        }
    });
});

describe('FE3 壞的合唱項目只丟該項', () => {
    it('FE3 混入壞值時只丟壞項，好項與片段都保留', () => {
        const videos = parseSongCatalog(oneSeg([
            ['vt-2', '好一'],
            'junk',
            null,
            [5, '數字 id'],
            [null, ''],
            [null, 123],
            ['vt-3'],
            [null, '好二'],
        ]));
        expect(videos).toHaveLength(1);
        expect(videos[0].segments).toHaveLength(1);
        expect((videos[0].segments[0] as unknown as { performers: unknown }).performers).toEqual([
            { vtuberId: 'vt-2', name: '好一' },
            { vtuberId: null, name: '好二' },
        ]);
    });

    it('FE3 某段合唱全是壞值時該段 performers 為空，同影片其他片段不受影響', () => {
        const [video] = parseSongCatalog([
            {
                v: 'aaaaaaaaaaa', t: '歌回', vt: null,
                s: [
                    ['bad00001', 0, 60, '壞', null, 0, 12, null, ['x', 1, [null, '']]],
                    ['good0001', 60, 120, '好', null, 0, 12, null, [[null, '站外']]],
                ],
            },
            DICT,
        ]);
        expect(video.segments.map((s) => (s as unknown as { performers: unknown[] }).performers.length)).toEqual([0, 1]);
    });
});

// ---------- FE6 純邏輯：deriveVtubers 的 collabCount、collabsOfVtuber ----------
const COLLAB_CATALOG = [
    {
        v: 'aaaaaaaaaaa', t: '星川歌回', d: '2026-10-01T12:00:00Z', vt: { i: 'v1', n: '星川', img: null },
        // 故意讓開始時間較晚的排在前面，驗證 collabsOfVtuber 同影片依 start 排序
        s: [
            ['seg1a001', 200, 300, '歌二', null, 0, null, null, [['v2', '月見'], [null, '站外歌手']]],
            ['seg1a002', 10, 100, '歌一', null, 0, null, null, [['v2', '月見'], ['v3', '路過合唱者']]],
            ['seg1a003', 400, 500, '歌三', null, 0, null, null, []],
        ],
    },
    {
        v: 'bbbbbbbbbbb', t: '月見歌回', d: '2026-10-05T12:00:00Z', vt: { i: 'v2', n: '月見', img: null },
        s: [
            ['seg2b001', 0, 60, '月見自己的歌', null, 0, null, null, []],
            ['seg2b002', 60, 120, '月見邀星川', null, 0, null, null, [['v1', '星川']]],
        ],
    },
    {
        v: 'ccccccccccc', t: '另一場星川', d: '2026-09-20T12:00:00Z', vt: { i: 'v1', n: '星川', img: null },
        s: [['seg3c001', 0, 60, '舊合唱', null, 0, null, null, [['v2', '月見']]]],
    },
];

describe('FE6 deriveVtubers 合唱者', () => {
    const summaries = () => deriveVtubers(parseSongCatalog(COLLAB_CATALOG));
    const by = (key: string) => summaries().find((s) => s.key === key) as unknown as {
        key: string; id: string; name: string; videoCount: number; songCount: number; collabCount: number;
    } | undefined;

    it('FE6 只以合唱者身分出現的 VTuber 也列入清單，歌回與歌曲數為 0', () => {
        const s = by('v3');
        expect(s).toBeDefined();
        expect(s).toMatchObject({ key: 'v3', id: 'v3', name: '路過合唱者', videoCount: 0, songCount: 0, collabCount: 1 });
    });

    it('FE6 collabCount 是以合唱者身分出現的片段數，不含自己歌回的片段', () => {
        // 月見：星川歌回 2 段 + 另一場 1 段 = 3；自己歌回的 2 段不算
        expect(by('v2')).toMatchObject({ videoCount: 1, songCount: 2, collabCount: 3 });
        // 星川：被月見邀 1 段
        expect(by('v1')).toMatchObject({ videoCount: 2, songCount: 4, collabCount: 1 });
    });

    it('FE6 站外合唱者（沒有 vtuberId）不會進清單', () => {
        expect(summaries().map((s) => s.name)).not.toContain('站外歌手');
        expect(summaries().map((s) => s.key).sort()).toEqual(['v1', 'v2', 'v3']);
    });

    it('FE6 沒有任何合唱資料時 collabCount 全為 0、清單與原本相同', () => {
        const plain = deriveVtubers(parseSongCatalog([
            { v: 'ddddddddddd', t: 'x', d: null, vt: { i: 'v9', n: '單人', img: null }, s: [['plain001', 0, 60, '歌', null]] },
        ])) as unknown as { key: string; collabCount: number }[];
        expect(plain).toHaveLength(1);
        expect(plain[0].collabCount).toBe(0);
    });
});

describe('FE6 collabsOfVtuber', () => {
    const videos = () => parseSongCatalog(COLLAB_CATALOG);

    it('FE6 只列該人以合唱者身分參與的片段，依影片時間新到舊、同影片依開始時間', () => {
        const out = collabsOfVtuber(videos(), 'v2');
        expect(out.map((e) => e.segment.code)).toEqual(['seg1a002', 'seg1a001', 'seg3c001']);
        expect(out[0].video.videoId).toBe('aaaaaaaaaaa');
        expect(out[2].video.videoId).toBe('ccccccccccc');
    });

    it('FE6 影片擁有者自己的片段不算合唱', () => {
        const codes = collabsOfVtuber(videos(), 'v2').map((e) => e.segment.code);
        expect(codes).not.toContain('seg2b001');
        expect(codes).not.toContain('seg2b002');
    });

    it('FE6 站內者在別人影片當合唱者與沒人邀請時：前者有、後者回空陣列', () => {
        expect(collabsOfVtuber(videos(), 'v3').map((e) => e.segment.code)).toEqual(['seg1a002']);
        expect(collabsOfVtuber(videos(), 'v1').map((e) => e.segment.code)).toEqual(['seg2b002']);
        expect(collabsOfVtuber(videos(), 'nobody')).toEqual([]);
    });

    it('FE6 不修改傳入的 videos', () => {
        const input = videos();
        const before = JSON.stringify(input);
        collabsOfVtuber(input, 'v2');
        expect(JSON.stringify(input)).toBe(before);
    });
});

// ---------- fetchOEmbed：標題＋上傳者 ----------
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

describe('fetchOEmbed', () => {
    it('回傳標題、上傳者名稱與上傳者網址', async () => {
        const fetchFn = async () => json({ title: ' 歌回 #3 ', author_name: '頻道甲', author_url: 'https://www.youtube.com/@jia' });
        await expect(fetchOEmbed('AbCdEfGhIjK', undefined, fetchFn as unknown as typeof fetch)).resolves.toEqual({
            title: '歌回 #3', authorName: '頻道甲', authorUrl: 'https://www.youtube.com/@jia',
        });
    });

    it('請求網址帶影片的 watch 網址', async () => {
        const calls: string[] = [];
        const fetchFn = async (url: RequestInfo | URL) => { calls.push(String(url)); return json({ title: 't' }); };
        await fetchOEmbed('AbCdEfGhIjK', undefined, fetchFn as unknown as typeof fetch);
        expect(calls[0]).toContain(encodeURIComponent('https://www.youtube.com/watch?v=AbCdEfGhIjK'));
    });

    it('缺少上傳者欄位時對應值為 null，其餘照常', async () => {
        const fetchFn = async () => json({ title: '只有標題' });
        await expect(fetchOEmbed('AbCdEfGhIjK', undefined, fetchFn as unknown as typeof fetch)).resolves.toEqual({
            title: '只有標題', authorName: null, authorUrl: null,
        });
    });

    it('上傳者欄位型別不對（數字、空字串）當 null', async () => {
        const fetchFn = async () => json({ title: 't', author_name: 5, author_url: '' });
        const out = await fetchOEmbed('AbCdEfGhIjK', undefined, fetchFn as unknown as typeof fetch);
        expect(out).toMatchObject({ title: 't', authorName: null, authorUrl: null });
    });

    it('非 2xx、網路錯誤、影片 ID 不合法都回 null', async () => {
        await expect(fetchOEmbed('AbCdEfGhIjK', undefined, (async () => json({}, 404)) as unknown as typeof fetch)).resolves.toBeNull();
        await expect(fetchOEmbed('AbCdEfGhIjK', undefined, (async () => { throw new TypeError('net'); }) as unknown as typeof fetch)).resolves.toBeNull();
        let called = false;
        await expect(fetchOEmbed('bad', undefined, (async () => { called = true; return json({}); }) as unknown as typeof fetch)).resolves.toBeNull();
        expect(called).toBe(false);
    });
});
