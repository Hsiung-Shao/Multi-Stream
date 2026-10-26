// /songs 畫面網址 ↔ 畫面狀態：解析、序列化、往返一致、非法值退回列表
import { describe, it, expect } from 'vitest';
import { parseSongsView, serializeSongsView, type SongsView } from '../../../src/features/songs/lib/songsView';

const LIST: SongsView = { kind: 'list', vtuber: null };

describe('parseSongsView', () => {
    it('空字串與只有問號都是不篩選的列表', () => {
        expect(parseSongsView('')).toEqual(LIST);
        expect(parseSongsView('?')).toEqual(LIST);
    });

    it('?v= 帶 11 碼影片 ID 進詳細畫面，有沒有開頭問號都行', () => {
        expect(parseSongsView('?v=abcDEF_-123')).toEqual({ kind: 'video', videoId: 'abcDEF_-123' });
        expect(parseSongsView('v=abcDEF_-123')).toEqual({ kind: 'video', videoId: 'abcDEF_-123' });
    });

    it('影片 ID 不是 11 碼或含非法字元時退回列表', () => {
        expect(parseSongsView('?v=short')).toEqual(LIST);
        expect(parseSongsView('?v=abcdefghijkl')).toEqual(LIST);
        expect(parseSongsView('?v=abc def ghi')).toEqual(LIST);
        expect(parseSongsView('?v=')).toEqual(LIST);
    });

    it('?view=playlists 進歌單畫面，可帶 pl 歌單 ID', () => {
        expect(parseSongsView('?view=playlists')).toEqual({ kind: 'playlists', playlistId: null });
        expect(parseSongsView('?view=playlists&pl=abc123')).toEqual({ kind: 'playlists', playlistId: 'abc123' });
    });

    it('?view= 是未知值時退回列表', () => {
        expect(parseSongsView('?view=x')).toEqual(LIST);
        expect(parseSongsView('?view=')).toEqual(LIST);
    });

    it('?vtuber= 進列表並帶篩選，過長（超過 200 字元）或空值退回不篩選', () => {
        expect(parseSongsView('?vtuber=v1')).toEqual({ kind: 'list', vtuber: 'v1' });
        expect(parseSongsView('?vtuber=' + encodeURIComponent('name:星川 測試'))).toEqual({ kind: 'list', vtuber: 'name:星川 測試' });
        expect(parseSongsView('?vtuber=' + 'x'.repeat(200))).toEqual({ kind: 'list', vtuber: 'x'.repeat(200) });
        expect(parseSongsView('?vtuber=' + 'x'.repeat(201))).toEqual(LIST);
        expect(parseSongsView('?vtuber=')).toEqual(LIST);
    });

    it('多個參數同時出現時優先序為 v > view > vtuber', () => {
        expect(parseSongsView('?vtuber=v1&view=playlists')).toEqual({ kind: 'playlists', playlistId: null });
        expect(parseSongsView('?vtuber=v1&view=playlists&v=aaaaaaaaaaa')).toEqual({ kind: 'video', videoId: 'aaaaaaaaaaa' });
    });

    it('不認得的參數被忽略', () => {
        expect(parseSongsView('?foo=bar')).toEqual(LIST);
    });
});

describe('serializeSongsView', () => {
    it('不篩選的列表序列化成空字串', () => {
        expect(serializeSongsView(LIST)).toBe('');
    });

    it('其他畫面序列化成以問號開頭的字串', () => {
        expect(serializeSongsView({ kind: 'video', videoId: 'aaaaaaaaaaa' })).toBe('?v=aaaaaaaaaaa');
        expect(serializeSongsView({ kind: 'playlists', playlistId: null })).toBe('?view=playlists');
        expect(serializeSongsView({ kind: 'playlists', playlistId: 'abc' })).toMatch(/^\?view=playlists&pl=abc$/);
    });

    it('VTuber key 用 encodeURIComponent 編碼', () => {
        const key = 'name:星川&測試=1#x';
        const s = serializeSongsView({ kind: 'list', vtuber: key });
        expect(s).toBe('?vtuber=' + encodeURIComponent(key));
        expect(s).not.toContain('#');
    });
});

describe('往返一致', () => {
    const views: SongsView[] = [
        LIST,
        { kind: 'list', vtuber: 'v1' },
        { kind: 'list', vtuber: 'name:星川 測試&a=b#c' },
        { kind: 'video', videoId: 'abcDEF_-123' },
        { kind: 'playlists', playlistId: null },
        { kind: 'playlists', playlistId: 'p-1_Z' },
    ];
    it.each(views.map((v) => [JSON.stringify(v), v] as const))('parse(serialize(%s)) 與原值深相等', (_name, view) => {
        expect(parseSongsView(serializeSongsView(view))).toEqual(view);
    });
});
