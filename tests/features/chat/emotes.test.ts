// E1～E6：貼圖來源分組、Twitch 個人貼圖、Tab 補完、自己送出的貼圖位置（只 mock fetch 與假 socket）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitchChatClient, type SocketLike } from '../../../src/features/chat/TwitchChatClient';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const headerOf = (init: RequestInit | undefined, name: string) => {
    const h = init?.headers;
    if (!h) return undefined;
    if (h instanceof Headers) return h.get(name) ?? undefined;
    const rec = h as Record<string, string>;
    const key = Object.keys(rec).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? rec[key] : undefined;
};

describe('E1 第三方貼圖依來源分組', () => {
    beforeEach(() => { sessionStorage.clear(); vi.resetModules(); });
    afterEach(() => vi.unstubAllGlobals());

    const mockGlobal = () => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url === 'https://7tv.io/v3/emote-sets/global') {
            return json({ emotes: [{ name: 'EZ', data: { host: { url: '//cdn.7tv.app/emote/SEVENID', files: [{ name: '1x.webp' }] } } }] });
        }
        if (url === 'https://api.betterttv.net/3/cached/emotes/global') return json([{ id: 'abc123', code: 'monkaS' }]);
        if (url === 'https://api.frankerfacez.com/v1/set/global') {
            return json({ sets: { '1': { emoticons: [{ name: 'LaterSooner', urls: { '1': 'https://cdn.frankerfacez.com/emote/1/1' } }] } } });
        }
        return new Response('nf', { status: 404 });
    }));

    it('三家全域各回一個時，loadGlobalEmoteGroups 依來源分到 7tv／bttv／ffz', async () => {
        mockGlobal();
        const { loadGlobalEmoteGroups } = await import('../../../src/features/chat/thirdPartyEmotes');
        const g = await loadGlobalEmoteGroups();
        expect(Object.keys(g['7tv'])).toEqual(['EZ']);
        expect(g['7tv'].EZ).toContain('cdn.7tv.app/emote/SEVENID');
        expect(g['7tv'].EZ).toContain('1x.webp');
        expect(g.bttv).toEqual({ monkaS: 'https://cdn.betterttv.net/emote/abc123/1x' });
        expect(g.ffz).toEqual({ LaterSooner: 'https://cdn.frankerfacez.com/emote/1/1' });
    });

    it('loadGlobalEmotes 平坦結果仍含三家的貼圖', async () => {
        mockGlobal();
        const { loadGlobalEmotes } = await import('../../../src/features/chat/thirdPartyEmotes');
        const flat = await loadGlobalEmotes();
        expect(Object.keys(flat).sort()).toEqual(['EZ', 'LaterSooner', 'monkaS']);
        expect(flat.monkaS).toBe('https://cdn.betterttv.net/emote/abc123/1x');
    });
});

describe('E2／E3 Twitch 個人貼圖', () => {
    beforeEach(() => { vi.resetModules(); });
    afterEach(() => vi.unstubAllGlobals());

    const VALIDATE = 'https://id.twitch.tv/oauth2/validate';
    const USER = 'https://api.twitch.tv/helix/chat/emotes/user';
    const GLOBAL = 'https://api.twitch.tv/helix/chat/emotes/global';
    const creds = { login: 'me', token: 'tok123' };
    const validate = (scopes: string[]) => json({ client_id: 'cid', login: 'me', user_id: '42', scopes });

    it('E2 有 user:read:emotes 時依 cursor 取完兩頁，帶對的 header 與 after', async () => {
        const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
            if (url === VALIDATE) return validate(['chat:read', 'user:read:emotes']);
            if (url.startsWith(USER)) {
                return url.includes('after=CUR1')
                    ? json({ data: [{ id: '3', name: 'LUL' }], pagination: {} })
                    : json({ data: [{ id: '25', name: 'Kappa' }], pagination: { cursor: 'CUR1' } });
            }
            return new Response('nf', { status: 404 });
        });
        vi.stubGlobal('fetch', fetchMock);
        const { loadTwitchEmotes, twitchEmoteUrl } = await import('../../../src/features/chat/twitchEmotes');
        const set = await loadTwitchEmotes(creds);
        expect(set.byName).toEqual({ Kappa: '25', LUL: '3' });
        expect(set.needsReauth).toBe(false);
        expect(twitchEmoteUrl('25')).toBe('https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0');

        const calls = fetchMock.mock.calls;
        const validateCall = calls.find((c) => c[0] === VALIDATE)!;
        expect(headerOf(validateCall[1], 'Authorization')).toBe('OAuth tok123');
        const userCalls = calls.filter((c) => c[0].startsWith(USER));
        expect(userCalls).toHaveLength(2);
        expect(userCalls[0][0]).toContain('user_id=42');
        expect(userCalls[0][0]).not.toContain('after=');
        expect(userCalls[1][0]).toContain('after=CUR1');
        expect(headerOf(userCalls[0][1], 'Authorization')).toBe('Bearer tok123');
        expect(headerOf(userCalls[0][1], 'Client-Id')).toBe('cid');
        expect(calls.some((c) => c[0].startsWith(GLOBAL))).toBe(false);
    });

    it('E3a 權杖沒有 user:read:emotes 時改取全域貼圖並標記 needsReauth', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url === VALIDATE) return validate(['chat:read', 'chat:edit']);
            if (url.startsWith(GLOBAL)) return json({ data: [{ id: '25', name: 'Kappa' }] });
            return new Response('nf', { status: 404 });
        });
        vi.stubGlobal('fetch', fetchMock);
        const { loadTwitchEmotes } = await import('../../../src/features/chat/twitchEmotes');
        const set = await loadTwitchEmotes(creds);
        expect(set.byName).toEqual({ Kappa: '25' });
        expect(set.needsReauth).toBe(true);
        expect(fetchMock.mock.calls.some((c) => (c[0] as string).startsWith(USER))).toBe(false);
        const g = fetchMock.mock.calls.find((c) => (c[0] as string).startsWith(GLOBAL))!;
        expect(headerOf(g[1] as RequestInit, 'Authorization')).toBe('Bearer tok123');
        expect(headerOf(g[1] as RequestInit, 'Client-Id')).toBe('cid');
    });

    it('E3b 有 scope 但 user 端點回 401 時退回全域貼圖並標記 needsReauth', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (url === VALIDATE) return validate(['user:read:emotes']);
            if (url.startsWith(USER)) return new Response('unauthorized', { status: 401 });
            if (url.startsWith(GLOBAL)) return json({ data: [{ id: '3', name: 'LUL' }] });
            return new Response('nf', { status: 404 });
        }));
        const { loadTwitchEmotes } = await import('../../../src/features/chat/twitchEmotes');
        const set = await loadTwitchEmotes(creds);
        expect(set.byName).toEqual({ LUL: '3' });
        expect(set.needsReauth).toBe(true);
    });
});

describe('E4／E5／E5b Tab 補完與插入', () => {
    const load = () => import('../../../src/features/chat/emoteComplete');
    const names = ['LUL', 'KappaPride', 'Kappa'];

    it('E4 「hi Kap」依序補成 Kappa、KappaPride，再循環回 Kappa', async () => {
        const { completeEmote, insertEmote } = await load();
        const a = completeEmote('hi Kap', 6, names)!;
        expect(a.text).toBe('hi Kappa ');
        expect(a.caret).toBe(9);
        const b = completeEmote(a.text, a.caret, names, a.state)!;
        expect(b.text).toBe('hi KappaPride ');
        expect(b.caret).toBe(14);
        const c = completeEmote(b.text, b.caret, names, b.state)!;
        expect(c.text).toBe('hi Kappa ');
    });

    it('E4b 開頭比對不分大小寫，只換游標前那個詞', async () => {
        const { completeEmote, insertEmote } = await load();
        const r = completeEmote('kap 後面', 3, names)!;
        expect(r.text).toBe('Kappa  後面');
        expect(r.caret).toBe(6);
    });

    it('E5 沒有符合的名稱時回 null（不攔 Tab）', async () => {
        const { completeEmote, insertEmote } = await load();
        expect(completeEmote('hi zzz', 6, names)).toBeNull();
    });

    it('E5c 游標前是空白（詞為空）時回 null', async () => {
        const { completeEmote, insertEmote } = await load();
        expect(completeEmote('hi ', 3, names)).toBeNull();
    });

    it('E5b 插入貼圖：緊貼文字就補前空白，後面一律補空白，caret 在最後', async () => {
        const { completeEmote, insertEmote } = await load();
        expect(insertEmote('hi', 2, 'Kappa')).toEqual({ text: 'hi Kappa ', caret: 9 });
        expect(insertEmote('', 0, 'Kappa')).toEqual({ text: 'Kappa ', caret: 6 });
    });

    it('E5d 在文字中間插入：前面已是空白不重複補', async () => {
        const { completeEmote, insertEmote } = await load();
        expect(insertEmote('hi  bye', 3, 'Kappa')).toEqual({ text: 'hi Kappa  bye', caret: 9 });
    });
});

describe('E6 自己送出的 Twitch 貼圖顯示成圖', () => {
    class FakeSocket implements SocketLike {
        sent: string[] = [];
        readyState = 0;
        onopen: (() => void) | null = null;
        onmessage: ((ev: { data: string }) => void) | null = null;
        onclose: (() => void) | null = null;
        send(d: string) { this.sent.push(d); }
        close() { /* noop */ }
        open() { this.readyState = 1; this.onopen?.(); }
        recv(data: string) { this.onmessage?.({ data }); }
    }
    function loggedIn() {
        const sockets: FakeSocket[] = [];
        const client = new TwitchChatClient({ createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; } });
        client.setChannels(['chan']);
        client.setCredentials({ login: 'me', token: 'tok' });
        client.connect();
        sockets[0].open();
        sockets[0].recv(':tmi.twitch.tv 001 me :Welcome, GLHF!');
        return client;
    }
    const last = (c: TwitchChatClient) => c.getMessages().at(-1)!;

    it('send 帶名稱對照時，自己那則訊息的 emotes 標出 Kappa 的位置', () => {
        const client = loggedIn();
        expect(client.send('chan', 'Kappa 你好', { Kappa: '25' })).toBe(true);
        expect(last(client).emotes).toEqual([{ id: '25', start: 0, end: 4 }]);
    });

    it('E6b 沒給對照時 emotes 為空陣列', () => {
        const client = loggedIn();
        client.send('chan', 'Kappa 你好');
        expect(last(client).emotes).toEqual([]);
    });

    it('E6c 只比對整詞，且位置以 code point 計（前面有 emoji）', () => {
        const client = loggedIn();
        client.send('chan', 'Kappa123 😀 Kappa', { Kappa: '25' });
        // 'Kappa123 ' 9 個、emoji 1 個、空白 1 個 → 第二個 Kappa 從 11 起
        expect(last(client).emotes).toEqual([{ id: '25', start: 11, end: 15 }]);
    });
});

describe('review 第 1 輪', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('游標被移走後再按 Tab，不沿用舊的補完狀態（不重複文字）', async () => {
        const { completeEmote } = await import('../../../src/features/chat/emoteComplete');
        const names = ['Kappa', 'KappaClaus'];
        const a = completeEmote('aa Kap', 6, names)!;
        expect(a.text).toBe('aa Kappa ');
        // 使用者用滑鼠把游標點到開頭的「aa」後面再按 Tab：沒有候選，應回 null 而不是拿舊狀態拼字串
        expect(completeEmote(a.text, 2, names, a.state)).toBeNull();
    });

    it('第 2 頁暫時失敗（503）時不快取不完整的結果，下次會重查', async () => {
        vi.resetModules();
        let fail = true;
        const fetchMock = vi.fn(async (url: string) => {
            if (url === 'https://id.twitch.tv/oauth2/validate') return json({ client_id: 'cid', login: 'me', user_id: '42', scopes: ['user:read:emotes'] });
            if (url.includes('after=CUR1')) return fail ? new Response('x', { status: 503 }) : json({ data: [{ id: '3', name: 'LUL' }], pagination: {} });
            return json({ data: [{ id: '25', name: 'Kappa' }], pagination: { cursor: 'CUR1' } });
        });
        vi.stubGlobal('fetch', fetchMock);
        const { loadTwitchEmotes } = await import('../../../src/features/chat/twitchEmotes');
        const first = await loadTwitchEmotes({ login: 'me', token: 't' });
        expect(first.byName).toEqual({ Kappa: '25' });
        fail = false;
        const second = await loadTwitchEmotes({ login: 'me', token: 't' });
        expect(second.byName).toEqual({ Kappa: '25', LUL: '3' });
    });
});
