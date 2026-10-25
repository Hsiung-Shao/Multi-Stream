import { describe, it, expect } from 'vitest';
import { parseStoredVolume, serializeVolume, VOLUME_STORAGE_KEY, DEFAULT_VOLUME } from '../../../src/features/songs/lib/volume';

describe('volume', () => {
    it('常數：key 與預設音量', () => {
        expect(VOLUME_STORAGE_KEY).toBe('song-player-volume');
        expect(DEFAULT_VOLUME).toBe(100);
    });

    it('音量儲存值解析與夾限', () => {
        expect(parseStoredVolume(null)).toEqual({ volume: 100, muted: false });
        expect(parseStoredVolume('{"volume":150,"muted":true}')).toEqual({ volume: 100, muted: true });
        expect(parseStoredVolume('{"volume":-5}')).toEqual({ volume: 0, muted: false });
        expect(parseStoredVolume('{"volume":33.6}')).toEqual({ volume: 34, muted: false });
        expect(parseStoredVolume('{"volume":0}')).toEqual({ volume: 0, muted: false });
    });

    it('壞資料回預設：壞 JSON、非物件、volume 非數字、muted 非 boolean', () => {
        expect(parseStoredVolume('oops')).toEqual({ volume: 100, muted: false });
        expect(parseStoredVolume('"text"')).toEqual({ volume: 100, muted: false });
        expect(parseStoredVolume('42')).toEqual({ volume: 100, muted: false });
        expect(parseStoredVolume('null')).toEqual({ volume: 100, muted: false });
        expect(parseStoredVolume('{"volume":"x"}')).toEqual({ volume: 100, muted: false });
        expect(parseStoredVolume('{"volume":50,"muted":"yes"}')).toEqual({ volume: 50, muted: false });
    });

    it('serialize 後 parse 往返一致', () => {
        for (const s of [{ volume: 0, muted: true }, { volume: 37, muted: false }, { volume: 100, muted: true }]) {
            expect(parseStoredVolume(serializeVolume(s))).toEqual(s);
        }
    });
});
