// /songs 畫面網址 ↔ 畫面狀態：解析、序列化、往返一致、非法值退回列表
// v1.3：?vtuber= 改進 VTuber 個人頁（歌單／歌回分頁），新增 ?song=<id>[&from=<key>] 單曲頁；列表不再帶 vtuber 欄位
import { describe, it, expect } from 'vitest';
import { parseSongsView, serializeSongsView, type SongsView } from '../../../src/features/songs/lib/songsView';

const LIST: SongsView = { kind: 'list' };
const vt = (vtuber: string, tab: 'songs' | 'videos' = 'songs'): SongsView => ({ kind: 'vtuber', vtuber, tab });
const song = (songId: number, from: string | null = null): SongsView => ({ kind: 'song', songId, from });

describe('parseSongsView', () => {
    it('空字串與只有問號都是列表', () => {
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

    // 改寫：原本「?vtuber= 進列表並帶篩選」；規格改成進 VTuber 個人頁，預設「歌單」分頁
    it('?vtuber= 進個人頁且預設 songs 分頁，過長（超過 200 字元）或空值退回列表', () => {
        expect(parseSongsView('?vtuber=v1')).toEqual(vt('v1', 'songs'));
        expect(parseSongsView('?vtuber=' + encodeURIComponent('name:星川 測試'))).toEqual(vt('name:星川 測試'));
        expect(parseSongsView('?vtuber=' + 'x'.repeat(200))).toEqual(vt('x'.repeat(200)));
        expect(parseSongsView('?vtuber=' + 'x'.repeat(201))).toEqual(LIST);
        expect(parseSongsView('?vtuber=')).toEqual(LIST);
    });

    it('?vtuber=k&tab=videos 進歌回分頁，tab 是 songs 或非法值時當 songs', () => {
        expect(parseSongsView('?vtuber=v1&tab=videos')).toEqual(vt('v1', 'videos'));
        expect(parseSongsView('?vtuber=v1&tab=songs')).toEqual(vt('v1', 'songs'));
        expect(parseSongsView('?vtuber=v1&tab=bogus')).toEqual(vt('v1', 'songs'));
        expect(parseSongsView('?vtuber=v1&tab=')).toEqual(vt('v1', 'songs'));
        expect(parseSongsView('?vtuber=v1&tab=VIDEOS')).toEqual(vt('v1', 'songs'));
    });

    it('沒有 vtuber 時單獨的 tab 被忽略', () => {
        expect(parseSongsView('?tab=videos')).toEqual(LIST);
    });

    it('?song=<id> 進單曲頁，from 可省略；?from= 帶來源 VTuber 鍵', () => {
        expect(parseSongsView('?song=12')).toEqual(song(12, null));
        expect(parseSongsView('?song=12&from=v1')).toEqual(song(12, 'v1'));
        expect(parseSongsView('?song=12&from=' + encodeURIComponent('name:星川 測試'))).toEqual(song(12, 'name:星川 測試'));
        expect(parseSongsView('song=7')).toEqual(song(7, null));
    });

    it('歌曲 id 必須符合 ^[1-9]\\d{0,15}$，否則退回列表', () => {
        expect(parseSongsView('?song=1')).toEqual(song(1));
        expect(parseSongsView('?song=1234567890123456')).toEqual(song(1234567890123456));
        for (const bad of ['0', '012', '-1', '1.5', 'abc', '12a', '', ' 12', '12345678901234567']) {
            expect(parseSongsView('?song=' + encodeURIComponent(bad))).toEqual(LIST);
        }
    });

    it('from 超過 200 字元時當 null，單曲頁照開；剛好 200 字保留', () => {
        expect(parseSongsView('?song=12&from=' + 'x'.repeat(201))).toEqual(song(12, null));
        expect(parseSongsView('?song=12&from=' + 'x'.repeat(200))).toEqual(song(12, 'x'.repeat(200)));
    });

    it('沒有 song 時單獨的 from 被忽略', () => {
        expect(parseSongsView('?from=v1')).toEqual(LIST);
    });

    // 改寫：原本「v > view > vtuber」；加入 song 後為 v > song > view > vtuber
    it('多個參數同時出現時優先序為 v > song > view=playlists > vtuber > list', () => {
        expect(parseSongsView('?vtuber=v1&view=playlists')).toEqual({ kind: 'playlists', playlistId: null });
        expect(parseSongsView('?vtuber=v1&view=playlists&v=aaaaaaaaaaa')).toEqual({ kind: 'video', videoId: 'aaaaaaaaaaa' });
        expect(parseSongsView('?vtuber=v1&song=5')).toEqual(song(5, null));
        expect(parseSongsView('?song=5&view=playlists')).toEqual(song(5, null));
        expect(parseSongsView('?song=5&v=aaaaaaaaaaa')).toEqual({ kind: 'video', videoId: 'aaaaaaaaaaa' });
        expect(parseSongsView('?song=5&vtuber=v1&view=playlists&v=aaaaaaaaaaa')).toEqual({ kind: 'video', videoId: 'aaaaaaaaaaa' });
    });

    it('不認得的參數被忽略', () => {
        expect(parseSongsView('?foo=bar')).toEqual(LIST);
    });
});

describe('serializeSongsView', () => {
    it('列表序列化成空字串', () => {
        expect(serializeSongsView(LIST)).toBe('');
    });

    it('其他畫面序列化成以問號開頭的字串', () => {
        expect(serializeSongsView({ kind: 'video', videoId: 'aaaaaaaaaaa' })).toBe('?v=aaaaaaaaaaa');
        expect(serializeSongsView({ kind: 'playlists', playlistId: null })).toBe('?view=playlists');
        expect(serializeSongsView({ kind: 'playlists', playlistId: 'abc' })).toMatch(/^\?view=playlists&pl=abc$/);
    });

    it('個人頁：預設 songs 分頁不寫 tab，videos 分頁才寫', () => {
        expect(serializeSongsView(vt('v1', 'songs'))).toBe('?vtuber=v1');
        expect(serializeSongsView(vt('v1', 'videos'))).toBe('?vtuber=v1&tab=videos');
    });

    it('單曲頁：from 為 null 時不寫 from', () => {
        expect(serializeSongsView(song(12, null))).toBe('?song=12');
        expect(serializeSongsView(song(12, 'v1'))).toBe('?song=12&from=v1');
    });

    it('VTuber key 與 from 用 encodeURIComponent 編碼', () => {
        const key = 'name:星川&測試=1#x';
        const a = serializeSongsView(vt(key));
        expect(a).toBe('?vtuber=' + encodeURIComponent(key));
        expect(a).not.toContain('#');
        const b = serializeSongsView(song(12, key));
        expect(b).toBe('?song=12&from=' + encodeURIComponent(key));
        expect(b).not.toContain('#');
    });
});

describe('往返一致', () => {
    const views: SongsView[] = [
        LIST,
        vt('v1'),
        vt('v1', 'videos'),
        vt('name:星川 測試&a=b#c'),
        vt('name:星川 測試&a=b#c', 'videos'),
        song(12),
        song(12, 'v1'),
        song(1234567890123456, 'name:星川 測試&a=b#c'),
        { kind: 'video', videoId: 'abcDEF_-123' },
        { kind: 'playlists', playlistId: null },
        { kind: 'playlists', playlistId: 'p-1_Z' },
    ];
    it.each(views.map((v) => [JSON.stringify(v), v] as const))('parse(serialize(%s)) 與原值深相等', (_name, view) => {
        expect(parseSongsView(serializeSongsView(view))).toEqual(view);
    });
});
