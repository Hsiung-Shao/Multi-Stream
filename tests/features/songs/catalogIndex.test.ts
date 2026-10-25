import { describe, it, expect } from 'vitest';
import { buildVideoIndex, songsForVtuber } from '../../../src/features/songs/lib/catalogIndex';
import type { SongVideo } from '../../../src/features/songs/songsSource';

const seg = (code: string, videoId: string, start: number) => ({ code, videoId, start, end: start + 60, title: `歌${code}`, artist: null, plays: 0 });
const vid = (videoId: string, streamedAt: string | null, vtuberId: string | null, codes: string[]): SongVideo => ({
    videoId,
    title: `影片 ${videoId}`,
    streamedAt,
    vtuber: vtuberId ? { id: vtuberId, name: vtuberId, img: null } : null,
    segments: codes.map((c, i) => seg(c, videoId, i * 100)),
} as SongVideo);

describe('buildVideoIndex', () => {
    it('依 videoId 建歌回索引：每支對到自己全部 code，順序同 segments', () => {
        const videos = [
            vid('aaaaaaaaaaa', null, 'v1', ['aaaa0001', 'aaaa0002', 'aaaa0003']),
            vid('bbbbbbbbbbb', null, 'v1', ['bbbb0001']),
            vid('ccccccccccc', null, null, ['cccc0002', 'cccc0001']),
        ];
        const index = buildVideoIndex(videos);
        expect(index.size).toBe(3);
        expect(index.get('aaaaaaaaaaa')).toEqual({ title: '影片 aaaaaaaaaaa', codes: ['aaaa0001', 'aaaa0002', 'aaaa0003'] });
        expect(index.get('bbbbbbbbbbb')?.codes).toEqual(['bbbb0001']);
        // 不依 code 字母排序，維持 segments 原順序
        expect(index.get('ccccccccccc')?.codes).toEqual(['cccc0002', 'cccc0001']);
        expect(index.get('ddddddddddd')).toBeUndefined();
    });
});

describe('songsForVtuber', () => {
    it('只回該 VTuber，streamedAt 新到舊，null 排最後且同為 null 保持原順序，vtuber 為 null 不納入', () => {
        const videos = [
            vid('n1nnnnnnnnn', null, 'v1', ['n1n10001']),
            vid('old00000000', '2026-01-01T00:00:00Z', 'v1', ['old10001']),
            vid('other000000', '2026-09-01T00:00:00Z', 'v2', ['oth10001']),
            vid('new00000000', '2026-10-01T00:00:00Z', 'v1', ['new10001']),
            vid('nov00000000', '2026-10-05T00:00:00Z', null, ['nov10001']),
            vid('n2nnnnnnnnn', null, 'v1', ['n2n10001']),
        ];
        const result = songsForVtuber(videos, 'v1');
        expect(result.map((v) => v.videoId)).toEqual(['new00000000', 'old00000000', 'n1nnnnnnnnn', 'n2nnnnnnnnn']);
    });

    it('不修改傳入陣列，找不到回空陣列', () => {
        const videos = [vid('old00000000', '2026-01-01T00:00:00Z', 'v1', ['old10001']), vid('new00000000', '2026-10-01T00:00:00Z', 'v1', ['new10001'])];
        const before = videos.map((v) => v.videoId);
        songsForVtuber(videos, 'v1');
        expect(videos.map((v) => v.videoId)).toEqual(before);
        expect(songsForVtuber(videos, 'nobody')).toEqual([]);
    });
});
