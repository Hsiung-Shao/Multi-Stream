import { describe, it, expect, beforeEach } from 'vitest';
import { usePlaylistStore, PLAYLIST_MAX_ITEMS } from '../../../src/features/songs/store/usePlaylistStore';

const KEY = 'song-playlists';
const st = () => usePlaylistStore.getState();
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? 'null');

beforeEach(() => {
    localStorage.clear();
    usePlaylistStore.setState({ playlists: [] });
});

describe('usePlaylistStore', () => {
    it('歌單新增、移除、排序、改名、刪除', () => {
        const id = st().createPlaylist('我的歌單', ['aaaaaaaa', 'bbbbbbbb', 'aaaaaaaa']);
        expect(st().playlists).toHaveLength(1);
        expect(st().playlists[0]).toMatchObject({ id, name: '我的歌單', codes: ['aaaaaaaa', 'bbbbbbbb'] });

        // 加入時去重：已存在的不重複加
        st().addToPlaylist(id, ['bbbbbbbb', 'cccccccc', 'dddddddd']);
        expect(st().playlists[0].codes).toEqual(['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd']);

        st().removeFromPlaylist(id, 'bbbbbbbb');
        expect(st().playlists[0].codes).toEqual(['aaaaaaaa', 'cccccccc', 'dddddddd']);

        st().moveInPlaylist(id, 0, 2);
        expect(st().playlists[0].codes).toEqual(['cccccccc', 'dddddddd', 'aaaaaaaa']);

        st().renamePlaylist(id, '改名後');
        expect(st().playlists[0].name).toBe('改名後');

        // 寫進 localStorage（key 與版本正確、包含新增的 code）
        const saved = stored();
        expect(saved.version).toBe(1);
        expect(saved.state.playlists[0].codes).toEqual(['cccccccc', 'dddddddd', 'aaaaaaaa']);

        st().deletePlaylist(id);
        expect(st().playlists).toEqual([]);
        expect(stored().state.playlists).toEqual([]);
    });

    it('名稱 trim 後為空時使用「未命名歌單」', () => {
        st().createPlaylist('   ');
        expect(st().playlists[0].name).toBe('未命名歌單');
    });

    it('多個歌單的 id 不重複，操作只影響指定歌單', () => {
        const a = st().createPlaylist('A', ['aaaaaaaa']);
        const b = st().createPlaylist('B', ['bbbbbbbb']);
        expect(a).not.toBe(b);
        st().addToPlaylist(a, ['cccccccc']);
        expect(st().playlists.find((p) => p.id === b)!.codes).toEqual(['bbbbbbbb']);
    });

    it('加入超過上限時截斷到 PLAYLIST_MAX_ITEMS', () => {
        const id = st().createPlaylist('大', []);
        const many = Array.from({ length: PLAYLIST_MAX_ITEMS + 100 }, (_, i) => `c${String(i).padStart(7, '0')}`);
        st().addToPlaylist(id, many);
        expect(st().playlists[0].codes).toHaveLength(PLAYLIST_MAX_ITEMS);
        expect(st().playlists[0].codes[0]).toBe(many[0]);
    });

    it('操作不存在的歌單 id 不拋錯也不改動資料', () => {
        st().createPlaylist('A', ['aaaaaaaa']);
        const before = JSON.stringify(st().playlists);
        st().addToPlaylist('nope', ['bbbbbbbb']);
        st().removeFromPlaylist('nope', 'aaaaaaaa');
        st().moveInPlaylist('nope', 0, 1);
        st().renamePlaylist('nope', 'X');
        st().deletePlaylist('nope');
        expect(JSON.stringify(st().playlists)).toBe(before);
    });
});
