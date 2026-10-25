import { describe, it, expect } from 'vitest';
import {
    serializeSongShare,
    parseSongShare,
    SONG_SHARE_PARAM,
    SONG_SHARE_MAX,
} from '../../../src/features/songs/lib/songShareLink';

const gen = (n: number) => Array.from({ length: n }, (_, i) => `c${String(i).padStart(7, '0')}`);

describe('songShareLink', () => {
    it('常數：參數名 list、上限 100', () => {
        expect(SONG_SHARE_PARAM).toBe('list');
        expect(SONG_SHARE_MAX).toBe(100);
    });

    it('分享連結往返一致', () => {
        const codes = ['abcd1234', 'zzzz0000', '12345678'];
        const raw = serializeSongShare(codes);
        expect(raw).toBe('abcd1234.zzzz0000.12345678');
        expect(parseSongShare(raw)).toEqual(codes);
    });

    it('去重保序、截上限 100、擋非法字元', () => {
        expect(parseSongShare('aaaaaaaa.bbbbbbbb.aaaaaaaa.cccccccc')).toEqual(['aaaaaaaa', 'bbbbbbbb', 'cccccccc']);
        expect(parseSongShare(gen(120).join('.'))).toHaveLength(100);
        expect(serializeSongShare(gen(120)).split('.')).toHaveLength(100);
        // 大寫、符號、長度錯誤一律丟棄，不影響其他合法 code
        expect(parseSongShare('ABCDEFGH.abc-defg.abc1234.abc123456.good0001')).toEqual(['good0001']);
        expect(serializeSongShare(['ABCDEFGH', 'good0001', 'short'])).toBe('good0001');
        expect(serializeSongShare(['bad'])).toBe('');
        expect(parseSongShare(null)).toEqual([]);
        expect(parseSongShare(undefined)).toEqual([]);
        expect(parseSongShare('')).toEqual([]);
    });
});
