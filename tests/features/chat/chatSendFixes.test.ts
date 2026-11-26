// 發言 review 第 1 輪：權杖交付時序、非首次 provider、暫時錯誤、重複送出、IRC 登入失敗、被頻道規則擋下
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TwitchChatClient, type SocketLike } from '../../../src/features/chat/TwitchChatClient';

class FakeSocket implements SocketLike {
    sent: string[] = [];
    readyState = 0;
    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    send(d: string) { this.sent.push(d); }
    close() { this.readyState = 3; }
    open() { this.readyState = 1; this.onopen?.(); }
    recv(data: string) { this.onmessage?.({ data }); }
    drop() { this.readyState = 3; this.onclose?.(); }
}

function loggedIn() {
    const sockets: FakeSocket[] = [];
    const c = new TwitchChatClient({ createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; } });
    c.setChannels(['ch']);
    c.setCredentials({ login: 'me', token: 'tok' });
    c.connect();
    sockets[0].open();
    sockets[0].recv(':tmi.twitch.tv 001 me :Welcome');
    return { c, sockets };
}

describe('TwitchChatClient：發言失敗的處理', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('IRC 登入失敗時放棄這組權杖、回到匿名唯讀並標記需要重新授權', () => {
        const sockets: FakeSocket[] = [];
        const c = new TwitchChatClient({ createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; } });
        c.setChannels(['ch']);
        c.setCredentials({ login: 'me', token: 'bad' });
        c.connect();
        sockets[0].open();
        sockets[0].recv(':tmi.twitch.tv NOTICE * :Login authentication failed');
        sockets[0].drop();
        vi.advanceTimersByTime(1000);
        expect(c.authFailed()).toBe(true);
        expect(c.canSend()).toBe(false);
        sockets[1].open();
        expect(sockets[1].sent.some(l => l.startsWith('NICK justinfan'))).toBe(true);
        expect(sockets[1].sent.some(l => l.includes('oauth:bad'))).toBe(false);
    });

    it('訊息被頻道規則擋下時拿掉剛補上的自己訊息，改顯示一行系統提示', () => {
        const { c, sockets } = loggedIn();
        expect(c.send('ch', 'hello')).toBe(true);
        expect(c.getMessages().some(m => m.text === 'hello')).toBe(true);
        sockets[0].recv('@msg-id=msg_followersonly :tmi.twitch.tv NOTICE #ch :This room is in followers-only mode.');
        const msgs = c.getMessages();
        expect(msgs.some(m => m.text === 'hello')).toBe(false);
        const sys = msgs.find(m => m.system);
        expect(sys?.text).toContain('followers-only');
        expect(sys?.channel).toBe('ch');
    });
});

describe('chatToken：權杖交付與重取', () => {
    // 這次是用 Twitch 登入（signIn 跳轉前記下的）
    beforeEach(() => { vi.resetModules(); sessionStorage.setItem('ms_oauth_provider', 'twitch'); });
    afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });

    it('這次不是用 Twitch 登入（例如 Discord）時不交出續期權杖', async () => {
        sessionStorage.setItem('ms_oauth_provider', 'discord');
        const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const m = await import('../../../src/features/chat/chatToken');
        await m.captureTwitchChatToken(session('twitch') as never);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('交付成功後清掉登入方式記號，重新整理頁面不會再送一次', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: 'a', expires_in: 3600, login: 'me' }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const m = await import('../../../src/features/chat/chatToken');
        await m.captureTwitchChatToken(session('twitch') as never);
        expect(sessionStorage.getItem('ms_oauth_provider')).toBeNull();
    });

    const session = (provider: string, refresh = 'r1') => ({
        access_token: 'jwt', provider_refresh_token: refresh,
        user: { id: 'u', app_metadata: { provider, providers: ['google', 'twitch'] } },
    });

    it('非首次 provider（先用 Google 註冊）用 Twitch 登入也會交出續期權杖', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: 'a', expires_in: 3600, login: 'me' }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const m = await import('../../../src/features/chat/chatToken');
        await m.captureTwitchChatToken(session('google') as never);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe('POST');
    });

    it('同一個續期權杖只交一次（切回分頁重觸發登入事件時不重送）', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: 'a', expires_in: 3600, login: 'me' }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const m = await import('../../../src/features/chat/chatToken');
        await m.captureTwitchChatToken(session('twitch') as never);
        await m.captureTwitchChatToken(session('twitch') as never);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('交付進行中先查權杖時等交付完成，不會誤判成沒授權', async () => {
        let resolvePost!: (r: Response) => void;
        const fetchMock = vi.fn((_url: string, init?: RequestInit) => init?.method === 'POST'
            ? new Promise<Response>(r => { resolvePost = r; })
            : Promise.resolve(new Response('{}', { status: 404 })));
        vi.stubGlobal('fetch', fetchMock);
        const m = await import('../../../src/features/chat/chatToken');
        const capture = m.captureTwitchChatToken(session('twitch') as never);
        const get = m.getChatCredentials('jwt');
        resolvePost(new Response(JSON.stringify({ access_token: 'a', expires_in: 3600, login: 'me' }), { status: 200 }));
        await capture;
        expect((await get)?.login).toBe('me');
    });

    it('暫時性錯誤（502）不算沒授權，回報 error 讓呼叫端保留現有權杖', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 502 })));
        const m = await import('../../../src/features/chat/chatToken');
        expect(await m.fetchChatCredentials('jwt')).toEqual({ kind: 'error' });
        vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 404 })));
        expect(await m.fetchChatCredentials('jwt')).toEqual({ kind: 'missing' });
    });
});
