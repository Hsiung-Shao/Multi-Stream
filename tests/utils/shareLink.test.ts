import { describe, it, expect } from 'vitest';
import { serializeShare, parseShare, buildShareUrl, entryToUrl, SHARE_MAX } from '../../src/utils/shareLink';

const tw = (channelId: string) => ({ platform: 'twitch' as const, channelId, videoId: '' });
const yt = (videoId: string) => ({ platform: 'youtube' as const, channelId: '', videoId });

describe('shareLink', () => {
    it('round-trip：序列化再解析得到相同串流與 chat 旗標', () => {
        const qs = serializeShare([tw('xQc'), yt('dQw4w9WgXcQ')], true);
        expect(qs).toBe('streams=tw:xqc,yt:dQw4w9WgXcQ&chat=1');
        expect(parseShare('?' + qs)).toEqual({
            streams: [{ platform: 'twitch', id: 'xqc' }, { platform: 'youtube', id: 'dQw4w9WgXcQ' }],
            chat: true,
        });
    });

    it('chat=false 不帶 chat 參數；解析時預設 false', () => {
        const qs = serializeShare([tw('a')], false);
        expect(qs).toBe('streams=tw:a');
        expect(parseShare(qs)?.chat).toBe(false);
    });

    it('Twitch 頻道名正規化為小寫（URL 與去重一致）；YouTube videoId 保留大小寫', () => {
        expect(parseShare('streams=tw:PokiMane,yt:AbC_-123')?.streams).toEqual([
            { platform: 'twitch', id: 'pokimane' },
            { platform: 'youtube', id: 'AbC_-123' },
        ]);
    });

    it('去重：同一台只出現一次（含大小寫差異）', () => {
        expect(serializeShare([tw('a'), tw('A'), tw('a')], false)).toBe('streams=tw:a');
        expect(parseShare('streams=tw:a,tw:A,tw:a')?.streams).toHaveLength(1);
    });

    it('上限 16：多餘的被截掉', () => {
        const many = Array.from({ length: 20 }, (_, i) => tw(`c${i}`));
        const parsed = parseShare(serializeShare(many, false));
        expect(parsed?.streams).toHaveLength(SHARE_MAX);
        expect(parseShare('streams=' + Array.from({ length: 20 }, (_, i) => `tw:d${i}`).join(','))?.streams).toHaveLength(SHARE_MAX);
    });

    it('未知前綴、缺冒號、非法字元、空 id 的 token 全部忽略', () => {
        expect(parseShare('streams=zz:x,notoken,tw:,tw:bad name,yt:<script>,tw:ok')?.streams).toEqual([
            { platform: 'twitch', id: 'ok' },
        ]);
    });

    it('沒有 streams 參數、空值、全是非法 token → null', () => {
        expect(parseShare('')).toBeNull();
        expect(parseShare('?foo=bar')).toBeNull();
        expect(parseShare('?streams=')).toBeNull();
        expect(parseShare('?streams=zz:1,tw:!!')).toBeNull();
    });

    it('YouTube 沒有 videoId、Twitch 沒有 channelId 的串流不會被序列化', () => {
        expect(serializeShare([yt(''), tw(''), { platform: 'youtube', channelId: 'UCxx', videoId: null }], false)).toBe('');
        expect(buildShareUrl('https://multistreaming.org', [yt('')], false)).toBeNull();
    });

    it('buildShareUrl 產生 /canvas?streams=… 完整網址', () => {
        expect(buildShareUrl('https://multistreaming.org', [tw('a'), yt('b')], true))
            .toBe('https://multistreaming.org/canvas?streams=tw:a,yt:b&chat=1');
    });

    it('entryToUrl 還原成 addStream 接受的來源 URL', () => {
        expect(entryToUrl({ platform: 'twitch', id: 'xqc' })).toBe('https://twitch.tv/xqc');
        expect(entryToUrl({ platform: 'youtube', id: 'dQw4w9WgXcQ' })).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it('id 超過 64 字元視為非法', () => {
        expect(parseShare('streams=tw:' + 'a'.repeat(65))).toBeNull();
        expect(parseShare('streams=tw:' + 'a'.repeat(64))?.streams).toHaveLength(1);
    });
});
