// C1：IRC 行解析與 PRIVMSG 轉 ChatMessage
import { describe, expect, it } from 'vitest';
import { parseEmotesTag, parseIrc, toChatMessage } from '../../../src/features/chat/ircParse';

const PRIVMSG =
    '@badges=broadcaster/1,subscriber/0;color=#FF69B4;display-name=Test\\sUser;emotes=25:0-4;id=abc-123;room-id=12345;tmi-sent-ts=1700000000000 :testuser!testuser@testuser.tmi.twitch.tv PRIVMSG #SomeChan :Kappa hello world';

describe('C1 解析 PRIVMSG', () => {
    it('帶 tags 的 PRIVMSG：parseIrc 拆出 tags／prefix／command／params，\\s 還原成空白', () => {
        const m = parseIrc(PRIVMSG)!;
        expect(m.command).toBe('PRIVMSG');
        expect(m.prefix).toBe('testuser!testuser@testuser.tmi.twitch.tv');
        expect(m.params).toEqual(['#SomeChan', 'Kappa hello world']);
        expect(m.tags['display-name']).toBe('Test User');
        expect(m.tags.color).toBe('#FF69B4');
        expect(m.tags['room-id']).toBe('12345');
    });

    it('tag 值反跳脫：\\: 變分號、\\\\ 變反斜線', () => {
        const m = parseIrc('@a=x\\:y;b=p\\\\q :tmi.twitch.tv NOTICE #c :hi')!;
        expect(m.tags.a).toBe('x;y');
        expect(m.tags.b).toBe('p\\q');
    });

    it('無 tags 的 PING：command=PING、params 帶伺服器名', () => {
        const m = parseIrc('PING :tmi.twitch.tv')!;
        expect(m.command).toBe('PING');
        expect(m.params).toEqual(['tmi.twitch.tv']);
    });

    it('toChatMessage 各欄位正確：channel 去 # 小寫、user 取 nick、顯示名／顏色／id／roomId／ts', () => {
        const c = toChatMessage(parseIrc(PRIVMSG)!)!;
        expect(c.channel).toBe('somechan');
        expect(c.user).toBe('testuser');
        expect(c.displayName).toBe('Test User');
        expect(c.color).toBe('#FF69B4');
        expect(c.id).toBe('abc-123');
        expect(c.roomId).toBe('12345');
        expect(c.ts).toBe(1700000000000);
        expect(c.text).toBe('Kappa hello world');
        expect(c.action).toBe(false);
        expect(c.emotes).toEqual([{ id: '25', start: 0, end: 4 }]);
    });

    it('/me 訊息：action=true 且 text 去掉 ACTION 包裝', () => {
        const c = toChatMessage(
            parseIrc('@id=a1;tmi-sent-ts=5 :nick!nick@nick.tmi.twitch.tv PRIVMSG #chan :\x01ACTION waves hello\x01')!,
        )!;
        expect(c.action).toBe(true);
        expect(c.text).toBe('waves hello');
    });

    it('無 tmi-sent-ts：ts 退回目前時間', () => {
        const before = Date.now();
        const c = toChatMessage(parseIrc(':nick!nick@nick.tmi.twitch.tv PRIVMSG #chan :hi')!)!;
        expect(c.ts).toBeGreaterThanOrEqual(before);
        expect(c.ts).toBeLessThanOrEqual(Date.now());
    });

    it('非 PRIVMSG（PING、JOIN）：toChatMessage 回 null', () => {
        expect(toChatMessage(parseIrc('PING :tmi.twitch.tv')!)).toBeNull();
        expect(toChatMessage(parseIrc(':n!n@n.tmi.twitch.tv JOIN #chan')!)).toBeNull();
    });

    it('parseEmotesTag：多表情多範圍依 start 排序；空值回空陣列', () => {
        expect(parseEmotesTag('25:0-4,12-16/1902:6-10')).toEqual([
            { id: '25', start: 0, end: 4 },
            { id: '1902', start: 6, end: 10 },
            { id: '25', start: 12, end: 16 },
        ]);
        expect(parseEmotesTag(undefined)).toEqual([]);
        expect(parseEmotesTag('')).toEqual([]);
    });
});
