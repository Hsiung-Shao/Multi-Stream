// C10、C11：TwitchChatClient 帶使用者權杖與送出訊息（假 socket；只依介面規格撰寫）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitchChatClient, type SocketLike } from '../../../src/features/chat/TwitchChatClient';

class FakeSocket implements SocketLike {
    sent: string[] = [];
    readyState = 0;
    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    closed = false;
    send(d: string) { this.sent.push(d); }
    close() { this.closed = true; }
    open() { this.readyState = 1; this.onopen?.(); }
    recv(data: string) { this.onmessage?.({ data }); }
    drop() { this.readyState = 3; this.onclose?.(); }
    lines() { return this.sent.flatMap((s) => s.split(/\r?\n/)).filter(Boolean); }
}

function setup() {
    const sockets: FakeSocket[] = [];
    const client = new TwitchChatClient({
        createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; },
    });
    return { client, sockets };
}
const WELCOME = ':tmi.twitch.tv 001 me :Welcome, GLHF!';
/** 帶 credentials 連線並收到 001，之後只看 send 送出的內容 */
function loggedIn(channels = ['c']) {
    const ctx = setup();
    ctx.client.setChannels(channels);
    ctx.client.setCredentials({ login: 'me', token: 'tok' });
    ctx.client.connect();
    const sock = ctx.sockets[0];
    sock.open();
    sock.recv(WELCOME);
    sock.sent.length = 0;
    return { ...ctx, sock };
}
const privmsgs = (s: FakeSocket) => s.lines().filter((l) => l.startsWith('PRIVMSG'));

describe('C10 登入後連線用使用者身分', () => {
    it('setCredentials 後連線握手送 PASS oauth:tok、NICK me，不含 justinfan', () => {
        const { client, sockets } = setup();
        client.setCredentials({ login: 'me', token: 'tok' });
        client.connect();
        sockets[0].open();
        const lines = sockets[0].lines();
        expect(lines).toContain('PASS oauth:tok');
        expect(lines).toContain('NICK me');
        expect(lines.some((l) => l.includes('justinfan'))).toBe(false);
    });

    it('setCredentials(null) 後再連線回到匿名 justinfan，不帶 oauth', () => {
        const { client, sockets } = setup();
        client.setCredentials({ login: 'me', token: 'tok' });
        client.setCredentials(null);
        client.connect();
        sockets[0].open();
        const lines = sockets[0].lines();
        expect(lines.some((l) => /^NICK justinfan\d+$/.test(l))).toBe(true);
        expect(lines.some((l) => l.includes('oauth:'))).toBe(false);
    });

    describe('已連線時換身分', () => {
        beforeEach(() => { vi.useFakeTimers(); });
        afterEach(() => { vi.useRealTimers(); });

        it('已匿名連線後 setCredentials 會重連，新連線握手帶使用者身分', () => {
            const { client, sockets } = setup();
            client.connect();
            sockets[0].open();
            sockets[0].recv(':tmi.twitch.tv 001 justinfan123 :Welcome, GLHF!');
            client.setCredentials({ login: 'me', token: 'tok' });
            vi.advanceTimersByTime(1000); // 容許重連走退避計時器
            expect(sockets.length).toBeGreaterThanOrEqual(2);
            const last = sockets[sockets.length - 1];
            last.open();
            expect(last.lines()).toContain('PASS oauth:tok');
            expect(last.lines()).toContain('NICK me');
        });
    });
});

describe('C11 送出訊息格式與防注入', () => {
    it('正常送出：回 true，送 PRIVMSG #c :文字，頭尾空白去掉', () => {
        const { client, sock } = loggedIn();
        expect(client.send('c', '  hello world  ')).toBe(true);
        expect(privmsgs(sock)).toEqual(['PRIVMSG #c :hello world']);
    });

    it('文字含換行夾帶指令：只送出一行 PRIVMSG，不另起 PRIVMSG #x', () => {
        const { client, sock } = loggedIn();
        client.send('c', 'hi\r\nPRIVMSG #x :evil');
        const withPriv = sock.sent.filter((s) => s.includes('PRIVMSG'));
        expect(withPriv).toHaveLength(1);
        expect(withPriv[0].replace(/\r?\n$/, '')).not.toMatch(/[\r\n]/);
        expect(privmsgs(sock)).toHaveLength(1);
        expect(privmsgs(sock)[0].startsWith('PRIVMSG #c :hi')).toBe(true);
        expect(sock.lines().some((l) => l.startsWith('PRIVMSG #x'))).toBe(false);
    });

    it('500 字元可送出、501 字元回 false 不送', () => {
        const { client, sock } = loggedIn();
        expect(client.send('c', 'a'.repeat(500))).toBe(true);
        sock.sent.length = 0;
        expect(client.send('c', 'a'.repeat(501))).toBe(false);
        expect(sock.sent).toHaveLength(0);
    });

    it('空字串與只有空白或換行回 false 不送', () => {
        const { client, sock } = loggedIn();
        expect(client.send('c', '')).toBe(false);
        expect(client.send('c', '   ')).toBe(false);
        expect(client.send('c', '\r\n')).toBe(false);
        expect(sock.sent).toHaveLength(0);
    });

    it('不在目前頻道集合的頻道回 false 不送', () => {
        const { client, sock } = loggedIn(['c']);
        expect(client.send('other', 'hi')).toBe(false);
        expect(sock.sent).toHaveLength(0);
    });

    it('沒有 credentials（匿名）回 false 不送', () => {
        const { client, sockets } = setup();
        client.setChannels(['c']);
        client.connect();
        sockets[0].open();
        sockets[0].recv(':tmi.twitch.tv 001 justinfan123 :Welcome, GLHF!');
        sockets[0].sent.length = 0;
        expect(client.send('c', 'hi')).toBe(false);
        expect(sockets[0].sent).toHaveLength(0);
    });

    it('未連線（socket 尚未 open）回 false 不送', () => {
        const { client, sockets } = setup();
        client.setChannels(['c']);
        client.setCredentials({ login: 'me', token: 'tok' });
        client.connect();
        expect(client.send('c', 'hi')).toBe(false);
        expect(sockets[0].sent).toHaveLength(0);
    });

    it('斷線後回 false 不送', () => {
        const { client, sock } = loggedIn();
        sock.drop();
        sock.sent.length = 0;
        expect(client.send('c', 'hi')).toBe(false);
        expect(sock.sent).toHaveLength(0);
    });
});
