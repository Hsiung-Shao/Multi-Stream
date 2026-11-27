// F1～F6、F9：貼圖選單 v2 的資料層（只 mock fetch）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmoteGroups } from '../../../src/features/chat/thirdPartyEmotes';
import type { TwitchEmote, TwitchOwner } from '../../../src/features/chat/twitchEmotes';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const headerOf = (init: RequestInit | undefined, name: string) => {
    const h = init?.headers;
    if (!h) return undefined;
    if (h instanceof Headers) return h.get(name) ?? undefined;
    const rec = h as Record<string, string>;
    const key = Object.keys(rec).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? rec[key] : undefined;
};
const urlOf = (u: unknown) => String(u);

const VALIDATE = 'https://id.twitch.tv/oauth2/validate';
const USER = 'https://api.twitch.tv/helix/chat/emotes/user';
const USERS = 'https://api.twitch.tv/helix/users';
const creds = { login: 'me', token: 'tok123' };
const validateRes = () => json({ client_id: 'cid', login: 'me', user_id: '42', scopes: ['chat:read', 'user:read:emotes'] });
const CDN = 'https://static-cdn.jtvnw.net/emoticons/v2';

describe('F1 Twitch 貼圖保留頻道與類型', () => {
    beforeEach(() => { vi.resetModules(); });
    afterEach(() => vi.unstubAllGlobals());

    it('兩頁貼圖：emotes 帶 ownerId／type、動圖用 animated 網址、userId 取自 validate、byName 正確', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (url === VALIDATE) return validateRes();
            if (urlOf(url).startsWith(USER)) {
                return urlOf(url).includes('after=C1')
                    ? json({ data: [{ id: '200', name: 'otherFollow', emote_type: 'follower', emote_set_id: '', owner_id: '888', format: ['static'] }], pagination: {} })
                    : json({
                        data: [
                            { id: '25', name: 'Kappa', emote_type: 'globals', emote_set_id: '0', owner_id: '0', format: ['static'] },
                            { id: '100', name: 'chanSub', emote_type: 'subscriptions', emote_set_id: 's1', owner_id: '777', format: ['static', 'animated'] },
                        ],
                        pagination: { cursor: 'C1' },
                    });
            }
            return new Response('nf', { status: 404 });
        }));
        const { loadTwitchEmotes } = await import('../../../src/features/chat/twitchEmotes');
        const set = await loadTwitchEmotes(creds);

        expect(set.userId).toBe('42');
        expect(set.needsReauth).toBe(false);
        expect(set.byName).toEqual({ Kappa: '25', chanSub: '100', otherFollow: '200' });
        expect(set.emotes).toHaveLength(3);
        const by = (n: string) => set.emotes.find((e) => e.name === n)!;
        expect(by('chanSub')).toMatchObject({ id: '100', ownerId: '777', type: 'subscriptions', url: `${CDN}/100/animated/dark/1.0` });
        expect(by('Kappa')).toMatchObject({ id: '25', ownerId: '0', type: 'globals', url: `${CDN}/25/default/dark/1.0` });
        expect(by('otherFollow')).toMatchObject({ ownerId: '888', type: 'follower', url: `${CDN}/200/default/dark/1.0` });
    });
});

describe('F2 頻道名稱與頭像查詢', () => {
    beforeEach(() => { vi.resetModules(); });
    afterEach(() => vi.unstubAllGlobals());

    const usersMock = () => vi.fn(async (url: string, _init?: RequestInit) => {
        if (url === VALIDATE) return validateRes();
        if (urlOf(url).startsWith(USERS)) {
            const ids = new URL(urlOf(url)).searchParams.getAll('id');
            return json({
                data: ids.map((id) => ({
                    id,
                    login: `login${id}`,
                    display_name: `Name${id}`,
                    profile_image_url: id === '2' ? 'http://insecure/a.png' : `https://cdn/${id}.png`,
                })),
            });
        }
        return new Response('nf', { status: 404 });
    });

    it('兩個頻道：名稱正確、http 頭像被丟掉、請求帶 Bearer 與 Client-Id', async () => {
        const fetchMock = usersMock();
        vi.stubGlobal('fetch', fetchMock);
        const { loadTwitchOwners } = await import('../../../src/features/chat/twitchEmotes');
        const owners = await loadTwitchOwners(creds, ['1', '2']);

        expect(owners['1']).toEqual({ id: '1', login: 'login1', displayName: 'Name1', avatar: 'https://cdn/1.png' });
        expect(owners['2'].login).toBe('login2');
        expect(owners['2'].displayName).toBe('Name2');
        expect(owners['2'].avatar).toBeUndefined();

        const call = fetchMock.mock.calls.find((c) => urlOf(c[0]).startsWith(USERS))!;
        expect(headerOf(call[1], 'Authorization')).toBe('Bearer tok123');
        expect(headerOf(call[1], 'Client-Id')).toBe('cid');
    });

    it('150 個 id 時分成多次請求、每次最多 100 個，結果全部合併', async () => {
        const fetchMock = usersMock();
        vi.stubGlobal('fetch', fetchMock);
        const { loadTwitchOwners } = await import('../../../src/features/chat/twitchEmotes');
        const ids = Array.from({ length: 150 }, (_, i) => String(1000 + i));
        const owners = await loadTwitchOwners(creds, ids);

        const calls = fetchMock.mock.calls.filter((c) => urlOf(c[0]).startsWith(USERS));
        expect(calls.length).toBeGreaterThanOrEqual(2);
        for (const c of calls) expect(new URL(urlOf(c[0])).searchParams.getAll('id').length).toBeLessThanOrEqual(100);
        expect(Object.keys(owners)).toHaveLength(150);
    });
});

describe('F3 追隨者貼圖只收該頻道 follower', () => {
    beforeEach(() => { vi.resetModules(); });
    afterEach(() => vi.unstubAllGlobals());

    it('只留 owner＝該頻道且 type=follower 的；同權杖同頻道第二次不再發 fetch', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url === VALIDATE) return validateRes();
            if (urlOf(url).startsWith(USER)) {
                return json({
                    data: [
                        { id: '1', name: 'subOfThis', emote_type: 'subscriptions', emote_set_id: 's', owner_id: '555', format: ['static'] },
                        { id: '2', name: 'followOfThis', emote_type: 'follower', emote_set_id: 's', owner_id: '555', format: ['static'] },
                        { id: '3', name: 'followOfOther', emote_type: 'follower', emote_set_id: 's', owner_id: '999', format: ['static'] },
                    ],
                    pagination: {},
                });
            }
            return new Response('nf', { status: 404 });
        });
        vi.stubGlobal('fetch', fetchMock);
        const { loadFollowerEmotes } = await import('../../../src/features/chat/twitchEmotes');

        const first = await loadFollowerEmotes(creds, '555');
        expect(first.map((e) => e.name)).toEqual(['followOfThis']);
        expect(first[0]).toMatchObject({ ownerId: '555', type: 'follower', url: `${CDN}/2/default/dark/1.0` });
        const userCall = fetchMock.mock.calls.find((c) => urlOf(c[0]).startsWith(USER))!;
        expect(new URL(urlOf(userCall[0])).searchParams.get('broadcaster_id')).toBe('555');

        const before = fetchMock.mock.calls.length;
        const second = await loadFollowerEmotes(creds, '555');
        expect(second.map((e) => e.name)).toEqual(['followOfThis']);
        expect(fetchMock.mock.calls.length).toBe(before);
    });
});

describe('F4 7TV 個人貼圖', () => {
    beforeEach(() => { vi.resetModules(); });
    afterEach(() => vi.unstubAllGlobals());

    const setBody = (id: string, name: string, flags: number, emote: string, cdnId: string) => ({
        id, name, flags,
        emotes: [{ name: emote, data: { host: { url: `//cdn.7tv.app/emote/${cdnId}`, files: [{ name: '1x.webp' }] } } }],
    });

    it('只回 flags 含 4 那組的貼圖，不去抓其他組', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url === 'https://7tv.io/v3/users/twitch/42') {
                return json({
                    emote_set: { id: 'SETN' },
                    user: { id: 'u1', emote_sets: [{ id: 'SETN', name: 'normal', flags: 0 }, { id: 'SETP', name: 'personal', flags: 4 }] },
                });
            }
            if (url === 'https://7tv.io/v3/emote-sets/SETP') return json(setBody('SETP', 'personal', 4, 'myEmote', 'PID'));
            if (url === 'https://7tv.io/v3/emote-sets/SETN') return json(setBody('SETN', 'normal', 0, 'normalEmote', 'NID'));
            return new Response('nf', { status: 404 });
        });
        vi.stubGlobal('fetch', fetchMock);
        const { loadPersonal7tv } = await import('../../../src/features/chat/thirdPartyEmotes');
        const personal = await loadPersonal7tv('42');
        expect(personal).toEqual({ myEmote: 'https://cdn.7tv.app/emote/PID/1x.webp' });
        expect(fetchMock.mock.calls.some((c) => urlOf(c[0]).endsWith('/emote-sets/SETN'))).toBe(false);
    });

    it('沒有個人組時回 {} 且不打 emote-sets', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url === 'https://7tv.io/v3/users/twitch/42') {
                return json({ emote_set: { id: 'SETN' }, user: { id: 'u1', emote_sets: [{ id: 'SETN', name: 'normal', flags: 0 }] } });
            }
            return new Response('nf', { status: 404 });
        });
        vi.stubGlobal('fetch', fetchMock);
        const { loadPersonal7tv } = await import('../../../src/features/chat/thirdPartyEmotes');
        expect(await loadPersonal7tv('42')).toEqual({});
        expect(fetchMock.mock.calls.some((c) => urlOf(c[0]).includes('/emote-sets/'))).toBe(false);
    });

    it('7TV 查無此使用者（404）時回 {}', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('nf', { status: 404 })));
        const { loadPersonal7tv } = await import('../../../src/features/chat/thirdPartyEmotes');
        expect(await loadPersonal7tv('42')).toEqual({});
    });
});

const groups = (p: Partial<EmoteGroups> = {}): EmoteGroups => ({ '7tv': {}, bttv: {}, ffz: {}, ...p });

describe('F5 跨頻道比對過濾一般字', () => {
    it('A 看得到 B 的 monkaS，但看不到 lol／OK／kekw；同名 Same 用 A 自己的網址', async () => {
        const { buildEmoteMaps } = await import('../../../src/features/chat/thirdPartyEmotes');
        const maps = buildEmoteMaps(['a', 'b'], groups(), {
            a: groups({ '7tv': { Same: 'https://a/same' } }),
            b: groups({
                '7tv': { monkaS: 'https://b/monka', lol: 'https://b/lol', OK: 'https://b/ok', kekw: 'https://b/kekw', LUL: 'https://b/LUL', Same: 'https://b/same' },
            }),
        });
        const a = maps.get('a')!;
        expect(a.get('monkaS')).toBe('https://b/monka');
        expect(a.get('LUL')).toBe('https://b/LUL');
        expect(a.has('lol')).toBe(false);
        expect(a.has('OK')).toBe(false);
        expect(a.has('kekw')).toBe(false);
        expect(a.get('Same')).toBe('https://a/same');
        // B 自己的表保留所有自己的貼圖（過濾只套用在跨頻道）
        const b = maps.get('b')!;
        expect(b.get('lol')).toBe('https://b/lol');
        expect(b.get('OK')).toBe('https://b/ok');
        expect(b.get('Same')).toBe('https://b/same');
    });

    it('純數字名稱（6677、666）不做跨頻道比對，本頻道照常', async () => {
        const { buildEmoteMaps } = await import('../../../src/features/chat/thirdPartyEmotes');
        const maps = buildEmoteMaps(['a', 'b'], groups(), { a: groups(), b: groups({ '7tv': { '6677': 'https://b/6677', '666': 'https://b/666' } }) });
        expect(maps.get('a')!.has('6677')).toBe(false);
        expect(maps.get('a')!.has('666')).toBe(false);
        expect(maps.get('b')!.get('6677')).toBe('https://b/6677');
    });

    it('優先順序：本頻道 7TV > BTTV > FFZ，且蓋過全域', async () => {
        const { buildEmoteMaps } = await import('../../../src/features/chat/thirdPartyEmotes');
        const maps = buildEmoteMaps(['a'], groups({ '7tv': { Glob: 'https://g/glob', Over: 'https://g/over' } }), {
            a: groups({ '7tv': { Dup: 'https://a/7tv', Over: 'https://a/over' }, bttv: { Dup: 'https://a/bttv', OnlyB: 'https://a/onlyb' }, ffz: { Dup: 'https://a/ffz' } }),
        });
        const a = maps.get('a')!;
        expect(a.get('Dup')).toBe('https://a/7tv');
        expect(a.get('OnlyB')).toBe('https://a/onlyb');
        expect(a.get('Glob')).toBe('https://g/glob');
        expect(a.get('Over')).toBe('https://a/over');
    });
});

describe('F6 選單分段與段落註記', () => {
    const t = (k: string, o?: Record<string, unknown>) => k + (o ? JSON.stringify(o) : '');
    const tw = (name: string, id: string, ownerId: string, type: string): TwitchEmote => ({ name, id, ownerId, type, url: `${CDN}/${id}/default/dark/1.0` });
    const owners: Record<string, TwitchOwner> = {
        '101': { id: '101', login: 'zed', displayName: 'Zed', avatar: 'https://av/zed.png' },
        '102': { id: '102', login: 'alpha', displayName: 'Alpha', avatar: 'https://av/alpha.png' },
    };
    const base = () => ({
        channel: 'alice',
        logins: ['alice', 'bob', 'carol'],
        twitch: [
            tw('Kappa', '25', '0', 'globals'),
            tw('smile', '1', '', 'smilies'),
            tw('zedSub', '11', '101', 'subscriptions'),
            tw('alphaSub', '12', '102', 'subscriptions'),
            tw('strayFollow', '13', '103', 'follower'),
        ],
        owners,
        follower: { alice: [tw('aliceFollow', '21', '999', 'follower')], bob: [tw('bobFollow', '22', '998', 'follower')] },
        channelGroups: {
            alice: groups({ '7tv': { aSeven: 'https://a/7' }, bttv: { aBttv: 'https://a/b' } }),
            bob: groups({ bttv: { bBttv: 'https://b/b' }, ffz: { bFfz: 'https://b/f' } }),
            carol: groups(),
        },
        global: groups({ '7tv': { gSeven: 'https://g/7' }, ffz: { gFfz: 'https://g/f' } }),
        personal: { myEmote: 'https://p/my' },
    });

    it('段落 id 依「目前頻道→個人→訂閱（依頻道名排序）→其他頻道→全域」，空段落不輸出', async () => {
        const { buildPickerSections } = await import('../../../src/features/chat/emoteSections');
        const ids = buildPickerSections(base(), t).map((s) => s.id);
        expect(ids).toEqual([
            'ch:alice:follower', 'ch:alice:7tv', 'ch:alice:bttv',
            'personal',
            'sub:102', 'sub:101',
            'other:bob:follower', 'other:bob:bttv', 'other:bob:ffz',
            'global:twitch', 'global:7tv', 'global:ffz',
        ]);
    });

    it('other: 段落有 note 且含該頻道 login，其餘段落 note 為 undefined', async () => {
        const { buildPickerSections } = await import('../../../src/features/chat/emoteSections');
        const secs = buildPickerSections(base(), t);
        expect(secs.filter((s) => s.id.startsWith('other:')).length).toBe(3);
        for (const s of secs) {
            if (s.id.startsWith('other:')) {
                expect(s.note, s.id).toBeTruthy();
                expect(s.note, s.id).toContain('bob');
            } else {
                expect(s.note, s.id).toBeUndefined();
            }
        }
    });

    it('sub 段帶頻道頭像；follower 類型不進 sub 段；globals／smilies／owner 為 0 或空字串歸全域 Twitch', async () => {
        const { buildPickerSections } = await import('../../../src/features/chat/emoteSections');
        const secs = buildPickerSections(base(), t);
        const sec = (id: string) => secs.find((s) => s.id === id)!;
        expect(sec('sub:101').avatar).toBe('https://av/zed.png');
        expect(sec('sub:102').avatar).toBe('https://av/alpha.png');
        expect(sec('sub:101').emotes).toEqual([{ name: 'zedSub', url: `${CDN}/11/default/dark/1.0` }]);
        expect(secs.some((s) => s.id === 'sub:103')).toBe(false);
        expect(secs.flatMap((s) => s.emotes.map((e) => e.name))).not.toContain('strayFollow');
        expect(sec('global:twitch').emotes.map((e) => e.name).sort()).toEqual(['Kappa', 'smile']);
    });

    it('各段落內容：目前頻道、個人、其他頻道、全域的貼圖與網址正確', async () => {
        const { buildPickerSections } = await import('../../../src/features/chat/emoteSections');
        const secs = buildPickerSections(base(), t);
        const sec = (id: string) => secs.find((s) => s.id === id)!;
        expect(sec('ch:alice:follower').emotes).toEqual([{ name: 'aliceFollow', url: `${CDN}/21/default/dark/1.0` }]);
        expect(sec('ch:alice:7tv').emotes).toEqual([{ name: 'aSeven', url: 'https://a/7' }]);
        expect(sec('personal').emotes).toEqual([{ name: 'myEmote', url: 'https://p/my' }]);
        expect(sec('other:bob:ffz').emotes).toEqual([{ name: 'bFfz', url: 'https://b/f' }]);
        expect(sec('global:7tv').emotes).toEqual([{ name: 'gSeven', url: 'https://g/7' }]);
    });

    it('沒有個人貼圖時不輸出 personal 段', async () => {
        const { buildPickerSections } = await import('../../../src/features/chat/emoteSections');
        const ids = buildPickerSections({ ...base(), personal: {} }, t).map((s) => s.id);
        expect(ids).toContain('ch:alice:7tv');
        expect(ids).not.toContain('personal');
    });
});

describe('F9 自己的訊息顯示個人貼圖', () => {
    it('selfEmoteMap 同時有 base 的 Kappa 與 personal 的 myEmote', async () => {
        const { selfEmoteMap } = await import('../../../src/features/chat/thirdPartyEmotes');
        const base = new Map([['Kappa', 'https://t/kappa.png']]);
        const m = selfEmoteMap(base, { myEmote: 'https://p/my.webp' });
        expect(m.get('Kappa')).toBe('https://t/kappa.png');
        expect(m.get('myEmote')).toBe('https://p/my.webp');
        expect(base.has('myEmote')).toBe(false);
    });
});
