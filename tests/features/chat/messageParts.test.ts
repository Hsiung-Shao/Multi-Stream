// C3、C4：訊息切段（官方表情／第三方表情／連結）
import { describe, expect, it } from 'vitest';
import { messageParts, type MessagePart } from '../../../src/features/chat/messageParts';

const OFFICIAL = (id: string) => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`;
const none = new Map<string, string>();
// 還原：表情用名稱、連結用 text，應等於原文（切段不得掉字）
const flat = (ps: MessagePart[]) => ps.map((p) => (p.type === 'emote' ? p.name : p.text)).join('');

describe('C3 官方表情依位置切段', () => {
    it('Kappa hi Kappa：切成 [emote, text, emote]，url 為官方 CDN', () => {
        const ps = messageParts('Kappa hi Kappa', [{ id: '25', start: 0, end: 4 }, { id: '25', start: 9, end: 13 }], none);
        expect(ps.map((p) => p.type)).toEqual(['emote', 'text', 'emote']);
        expect(ps[0]).toEqual({ type: 'emote', name: 'Kappa', url: OFFICIAL('25') });
        expect(ps[1]).toEqual({ type: 'text', text: ' hi ' });
        expect(ps[2]).toEqual({ type: 'emote', name: 'Kappa', url: OFFICIAL('25') });
    });

    it('emoji 在前：位置以 code point 計，表情仍精準切在 Kappa', () => {
        // 😀 在 UTF-16 佔 2 單位但是 1 個 code point，Kappa 位於 2-6
        const ps = messageParts('😀 Kappa', [{ id: '25', start: 2, end: 6 }], none);
        const emotes = ps.filter((p) => p.type === 'emote');
        expect(emotes).toEqual([{ type: 'emote', name: 'Kappa', url: OFFICIAL('25') }]);
        expect(flat(ps)).toBe('😀 Kappa');
        expect(ps[0]).toEqual({ type: 'text', text: '😀 ' });
    });

    it('無表情的純文字：回單一 text 段', () => {
        expect(messageParts('hello', [], none)).toEqual([{ type: 'text', text: 'hello' }]);
    });
});

describe('C4 第三方表情只換整詞', () => {
    const third = new Map([['KEKW', 'https://cdn.example/kekw.png']]);

    it('「KEKW 笑死 KEKWait」只有第一個 KEKW 變表情，KEKWait 維持文字', () => {
        const ps = messageParts('KEKW 笑死 KEKWait', [], third);
        const emotes = ps.filter((p) => p.type === 'emote');
        expect(emotes).toEqual([{ type: 'emote', name: 'KEKW', url: 'https://cdn.example/kekw.png' }]);
        expect(flat(ps)).toBe('KEKW 笑死 KEKWait');
        const text = ps.filter((p) => p.type === 'text').map((p) => (p as { text: string }).text).join('');
        expect(text).toContain('KEKWait');
    });

    it('名稱大小寫不同（kekw）：不換表情', () => {
        expect(messageParts('kekw', [], third).some((p) => p.type === 'emote')).toBe(false);
    });
});

describe('連結切段', () => {
    it('https 整詞變 link；javascript: 與無協定詞維持文字', () => {
        const ps = messageParts('see https://example.com/a?b=1 javascript:alert(1) example.com', [], none);
        const links = ps.filter((p) => p.type === 'link');
        expect(links).toEqual([{ type: 'link', href: 'https://example.com/a?b=1', text: 'https://example.com/a?b=1' }]);
        expect(flat(ps)).toBe('see https://example.com/a?b=1 javascript:alert(1) example.com');
    });
});
