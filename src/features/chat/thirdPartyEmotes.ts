/**
 * 7TV／BTTV／FFZ 第三方表情：全域＋頻道（以 Twitch 數字 id 查），回傳「名稱 → 圖片網址」。
 * 失敗一律靜默（表情只是加分，抓不到就顯示文字）；結果快取在 sessionStorage。
 */
const TIMEOUT_MS = 8000;
// v2：快取改存分組格式，換前綴避免讀到舊的平坦格式
const CACHE_PREFIX = 'ms_chat_emotes:v2:';

type EmoteMap = Record<string, string>;

async function getJson(url: string): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit' });
        // 404＝這個頻道沒在該家註冊，是正常的「沒有表情」，不算失敗
        if (res.status === 404) return {};
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// 只收 https 圖片網址：資料來自第三方，不能讓它塞進 javascript: 或其他協定
const safeUrl = (u: unknown) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null);

interface SevenTvEmote { name?: string; data?: { host?: { url?: string; files?: { name?: string }[] } } }
function from7tv(emotes: unknown, out: EmoteMap) {
    if (!Array.isArray(emotes)) return;
    for (const e of emotes as SevenTvEmote[]) {
        const host = e?.data?.host;
        const file = host?.files?.find(f => f.name === '1x.webp') ?? host?.files?.[0];
        const url = host?.url && file?.name ? safeUrl(`https:${host.url}/${file.name}`) : null;
        if (e?.name && url) out[e.name] = url;
    }
}

function fromBttv(emotes: unknown, out: EmoteMap) {
    if (!Array.isArray(emotes)) return;
    for (const e of emotes as { id?: string; code?: string }[]) {
        if (e?.code && e.id && /^[a-f0-9]+$/i.test(e.id)) out[e.code] = `https://cdn.betterttv.net/emote/${e.id}/1x`;
    }
}

function fromFfz(sets: unknown, out: EmoteMap) {
    if (!sets || typeof sets !== 'object') return;
    for (const set of Object.values(sets as Record<string, { emoticons?: { name?: string; urls?: Record<string, string> }[] }>)) {
        for (const e of set?.emoticons ?? []) {
            const url = safeUrl(e?.urls?.['1']);
            if (e?.name && url) out[e.name] = url;
        }
    }
}

export type EmoteGroups = { '7tv': EmoteMap; bttv: EmoteMap; ffz: EmoteMap };
const emptyGroups = (): EmoteGroups => ({ '7tv': {}, bttv: {}, ffz: {} });
/** 訊息顯示用的平坦對照：同名時 7TV 蓋 BTTV 蓋 FFZ */
const flatten = (g: EmoteGroups): EmoteMap => ({ ...g.ffz, ...g.bttv, ...g['7tv'] });

/** build 回傳 false＝有一家沒抓到：結果照用，但不快取，下次再試 */
async function load(key: string, build: (out: EmoteGroups) => Promise<boolean>): Promise<EmoteGroups> {
    try {
        const hit = sessionStorage.getItem(CACHE_PREFIX + key);
        if (hit) return JSON.parse(hit) as EmoteGroups;
    } catch { /* 無痕或停用儲存：直接重抓 */ }
    const out = emptyGroups();
    const complete = await build(out);
    if (complete) try { sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(out)); } catch { /* 滿了就不快取 */ }
    return out;
}

export const loadGlobalEmoteGroups = () => load('global', async out => {
    const [seven, bttv, ffz] = await Promise.all([
        getJson('https://7tv.io/v3/emote-sets/global'),
        getJson('https://api.betterttv.net/3/cached/emotes/global'),
        getJson('https://api.frankerfacez.com/v1/set/global'),
    ]);
    fromFfz((ffz as { sets?: unknown })?.sets, out.ffz);
    fromBttv(bttv, out.bttv);
    from7tv((seven as { emotes?: unknown })?.emotes, out['7tv']);
    return seven !== null && bttv !== null && ffz !== null;
});

export const loadChannelEmoteGroups = (roomId: string) => {
    if (!/^\d+$/.test(roomId)) return Promise.resolve(emptyGroups());
    return load(`room:${roomId}`, async out => {
        const [seven, bttv, ffz] = await Promise.all([
            getJson(`https://7tv.io/v3/users/twitch/${roomId}`),
            getJson(`https://api.betterttv.net/3/cached/users/twitch/${roomId}`),
            getJson(`https://api.frankerfacez.com/v1/room/id/${roomId}`),
        ]);
        fromFfz((ffz as { sets?: unknown })?.sets, out.ffz);
        const b = bttv as { channelEmotes?: unknown; sharedEmotes?: unknown } | null;
        fromBttv(b?.channelEmotes, out.bttv);
        fromBttv(b?.sharedEmotes, out.bttv);
        from7tv((seven as { emote_set?: { emotes?: unknown } })?.emote_set?.emotes, out['7tv']);
        return seven !== null && bttv !== null && ffz !== null;
    });
};

export const loadGlobalEmotes = () => loadGlobalEmoteGroups().then(flatten);
export const loadChannelEmotes = (roomId: string) => loadChannelEmoteGroups(roomId).then(flatten);
