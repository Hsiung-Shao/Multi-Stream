// C2、C6～C9：TwitchChatClient（假 socket + 假計時器）
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
    // 模擬伺服器端事件
    open() { this.readyState = 1; this.onopen?.(); }
    recv(data: string) { this.onmessage?.({ data }); }
    drop() { this.readyState = 3; this.onclose?.(); }
    /** 送出的每一行（容許一次 send 含多行、結尾 \r\n） */
    lines() { return this.sent.flatMap((s) => s.split(/\r?\n/)).filter(Boolean); }
}

function setup(maxPerChannel?: number) {
    const sockets: FakeSocket[] = [];
    const client = new TwitchChatClient({
        createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; },
        ...(maxPerChannel ? { maxPerChannel } : {}),
    });
    return { client, sockets };
}
/** 連線並完成 onopen、收到 001 */
function connected(maxPerChannel?: number, channels: string[] = ['c', 'one', 'two', 'big', 'small']) {
    const ctx = setup(maxPerChannel);
    ctx.client.setChannels(channels); // 真實使用時訊息只會來自已 JOIN 的頻道
    ctx.client.connect();
    ctx.sockets[0].open();
    return { ...ctx, sock: ctx.sockets[0] };
}
const priv = (id: string, ch: string, user: string, text = 'hi') =>
    `@id=${id};display-name=${user};tmi-sent-ts=1 :${user}!${user}@${user}.tmi.twitch.tv PRIVMSG #${ch} :${text}`;
const ids = (c: TwitchChatClient, ch?: string) => c.getMessages().filter((m) => !ch || m.channel === ch).map((m) => m.id);

describe('C2 PING／PONG 與握手', () => {
    it('收到 PING 回 PONG :tmi.twitch.tv', () => {
        const { sock } = connected();
        sock.recv('PING :tmi.twitch.tv\r\n');
        expect(sock.lines()).toContain('PONG :tmi.twitch.tv');
    });

    it('onopen 後送 CAP REQ、PASS、NICK justinfan<數字>，再 JOIN 已設定的頻道', () => {
        const { client, sockets } = setup();
        client.setChannels(['alpha']);
        client.connect();
        sockets[0].open();
        const lines = sockets[0].lines();
        expect(lines.some((l) => /^CAP REQ :.*twitch\.tv\/tags/.test(l))).toBe(true);
        expect(lines.some((l) => /^PASS /.test(l))).toBe(true);
        expect(lines.some((l) => /^NICK justinfan\d+$/.test(l))).toBe(true);
        expect(lines).toContain('JOIN #alpha');
        // JOIN 必須在握手（NICK）之後
        expect(lines.indexOf('JOIN #alpha')).toBeGreaterThan(lines.findIndex((l) => l.startsWith('NICK ')));
    });

    it('一次 data 含多行（\\r\\n 分隔）：每一行都處理', () => {
        const { client, sock } = connected();
        sock.recv(`${priv('a', 'c', 'u1')}\r\n${priv('b', 'c', 'u2')}\r\nPING :tmi.twitch.tv\r\n`);
        expect(ids(client)).toEqual(['a', 'b']);
        expect(sock.lines()).toContain('PONG :tmi.twitch.tv');
    });

    it('新訊息到達時通知訂閱者；取消訂閱後不再通知', () => {
        const { client, sock } = connected();
        const fn = vi.fn();
        const off = client.subscribe(fn);
        sock.recv(priv('a', 'c', 'u1'));
        expect(fn).toHaveBeenCalledTimes(1);
        off();
        sock.recv(priv('b', 'c', 'u1'));
        expect(fn).toHaveBeenCalledTimes(1);
    });
});

describe('C6 被刪訊息移除', () => {
    function seeded() {
        const ctx = connected();
        ctx.sock.recv([
            priv('m1', 'one', 'bad'), priv('m2', 'one', 'good'), priv('m3', 'one', 'bad'),
            priv('m4', 'two', 'bad'),
        ].join('\r\n'));
        return ctx;
    }

    it('CLEARMSG：只移除 target-msg-id 那一則', () => {
        const { client, sock } = seeded();
        sock.recv('@login=bad;target-msg-id=m1;tmi-sent-ts=2 :tmi.twitch.tv CLEARMSG #one :hi');
        expect(ids(client)).toEqual(['m2', 'm3', 'm4']);
    });

    it('CLEARCHAT 帶使用者：只移除該頻道該使用者的訊息，其他頻道同名使用者不受影響', () => {
        const { client, sock } = seeded();
        sock.recv('@room-id=1;target-user-id=9;tmi-sent-ts=2 :tmi.twitch.tv CLEARCHAT #one :bad');
        expect(ids(client)).toEqual(['m2', 'm4']);
    });

    it('CLEARCHAT 不帶使用者：清空該頻道，其他頻道保留', () => {
        const { client, sock } = seeded();
        sock.recv('@room-id=1;tmi-sent-ts=2 :tmi.twitch.tv CLEARCHAT #one');
        expect(ids(client)).toEqual(['m4']);
    });

    it('移除後通知訂閱者（畫面才會更新）', () => {
        const { client, sock } = seeded();
        const fn = vi.fn();
        client.subscribe(fn);
        sock.recv('@target-msg-id=m2 :tmi.twitch.tv CLEARMSG #one :hi');
        expect(fn).toHaveBeenCalled();
    });
});

describe('C7 頻道增減送 JOIN／PART', () => {
    it('已連線後 setChannels 由 [a,b] 改 [b,c]：送 JOIN #c、PART #a，不重送 b', () => {
        const { client, sock } = connected(undefined, []);
        client.setChannels(['a', 'b']);
        expect(sock.lines()).toEqual(expect.arrayContaining(['JOIN #a', 'JOIN #b']));
        sock.sent.length = 0;
        client.setChannels(['b', 'c']);
        const lines = sock.lines();
        expect(lines).toContain('JOIN #c');
        expect(lines).toContain('PART #a');
        expect(lines).not.toContain('JOIN #b');
        expect(lines).not.toContain('PART #b');
    });

    it('集合沒變：不送任何 JOIN／PART', () => {
        const { client, sock } = connected(undefined, []);
        client.setChannels(['a']);
        sock.sent.length = 0;
        client.setChannels(['a']);
        expect(sock.lines().filter((l) => /^(JOIN|PART)/.test(l))).toEqual([]);
    });
});

describe('C8 每頻道最多保留上限則數', () => {
    it('maxPerChannel=300 灌 400 則：該頻道只剩最新 300，另一頻道不受影響', () => {
        const { client, sock } = connected(300);
        const lines: string[] = [];
        for (let i = 0; i < 400; i++) lines.push(priv(`a${i}`, 'big', 'u'));
        for (let i = 0; i < 5; i++) lines.push(priv(`b${i}`, 'small', 'u'));
        sock.recv(lines.join('\r\n'));
        const big = ids(client, 'big');
        expect(big).toHaveLength(300);
        expect(big[0]).toBe('a100');
        expect(big[299]).toBe('a399');
        expect(ids(client, 'small')).toEqual(['b0', 'b1', 'b2', 'b3', 'b4']);
    });

    it('未指定 maxPerChannel：預設 300', () => {
        const { client, sock } = connected();
        const lines: string[] = [];
        for (let i = 0; i < 350; i++) lines.push(priv(`a${i}`, 'big', 'u'));
        sock.recv(lines.join('\r\n'));
        expect(ids(client, 'big')).toHaveLength(300);
    });
});

describe('C9 斷線退避重連', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('非主動斷線：1s 後建新 socket；連續失敗間隔 2s、4s', () => {
        const { client, sockets } = setup();
        client.connect();
        sockets[0].open();
        sockets[0].drop();
        vi.advanceTimersByTime(999);
        expect(sockets).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(sockets).toHaveLength(2);

        sockets[1].drop(); // 沒收到 001 就再斷
        vi.advanceTimersByTime(1999);
        expect(sockets).toHaveLength(2);
        vi.advanceTimersByTime(1);
        expect(sockets).toHaveLength(3);

        sockets[2].drop();
        vi.advanceTimersByTime(3999);
        expect(sockets).toHaveLength(3);
        vi.advanceTimersByTime(1);
        expect(sockets).toHaveLength(4);
    });

    it('退避上限 30s：第 6、7 次失敗都是等 30s', () => {
        const { client, sockets } = setup();
        client.connect();
        for (const d of [1000, 2000, 4000, 8000, 16000]) {
            sockets[sockets.length - 1].drop();
            vi.advanceTimersByTime(d);
        }
        expect(sockets).toHaveLength(6);
        for (let k = 0; k < 2; k++) {
            const n = sockets.length;
            sockets[n - 1].drop();
            vi.advanceTimersByTime(29999);
            expect(sockets).toHaveLength(n);
            vi.advanceTimersByTime(1);
            expect(sockets).toHaveLength(n + 1);
        }
    });

    it('收到 001 後再斷：退避重置回 1s', () => {
        const { client, sockets } = setup();
        client.connect();
        sockets[0].drop(); vi.advanceTimersByTime(1000); // -> 2
        sockets[1].drop(); vi.advanceTimersByTime(2000); // -> 3
        sockets[2].open();
        sockets[2].recv(':tmi.twitch.tv 001 justinfan123 :Welcome, GLHF!');
        sockets[2].drop();
        vi.advanceTimersByTime(999);
        expect(sockets).toHaveLength(3);
        vi.advanceTimersByTime(1);
        expect(sockets).toHaveLength(4);
    });

    it('重連後 onopen 重送握手並 JOIN 目前頻道', () => {
        const { client, sockets } = setup();
        client.setChannels(['a', 'b']);
        client.connect();
        sockets[0].open();
        sockets[0].drop();
        vi.advanceTimersByTime(1000);
        sockets[1].open();
        const lines = sockets[1].lines();
        expect(lines).toEqual(expect.arrayContaining(['JOIN #a', 'JOIN #b']));
        expect(lines.some((l) => /^NICK justinfan\d+$/.test(l))).toBe(true);
    });

    it('disconnect() 後 socket 的 onclose 不再重連', () => {
        const { client, sockets } = setup();
        client.connect();
        sockets[0].open();
        client.disconnect();
        expect(sockets[0].closed).toBe(true);
        sockets[0].drop(); // 真實 socket close() 後會觸發 onclose
        vi.advanceTimersByTime(120000);
        expect(sockets).toHaveLength(1);
    });

    it('已排程重連時 disconnect()：取消重連', () => {
        const { client, sockets } = setup();
        client.connect();
        sockets[0].drop();
        client.disconnect();
        vi.advanceTimersByTime(120000);
        expect(sockets).toHaveLength(1);
    });
});
