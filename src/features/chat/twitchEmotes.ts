/**
 * Twitch 原生貼圖：用發言權杖查「自己能用的」（含訂閱貼圖）。
 * 權杖沒有 user:read:emotes（舊登入）時退回全域貼圖，並標記需要重新授權。
 */
export interface TwitchEmote { name: string; id: string; ownerId: string; type: string; url: string }
/** byName：名稱→id（送出時標貼圖位置用）；emotes：完整條目（選單分段用）；userId：權杖本人 */
export interface TwitchEmoteSet { byName: Record<string, string>; emotes: TwitchEmote[]; needsReauth: boolean; userId?: string }
export interface TwitchOwner { id: string; login: string; displayName: string; avatar?: string }

const TIMEOUT_MS = 8000;
const MAX_PAGES = 10;
const HELIX = 'https://api.twitch.tv/helix/chat/emotes';

export { twitchEmoteUrl } from './messageParts';

async function get(url: string, headers: Record<string, string>): Promise<{ status: number; body: unknown }> {
    try {
        const res = await fetch(url, { headers, credentials: 'omit', signal: AbortSignal.timeout(TIMEOUT_MS) });
        return { status: res.status, body: res.ok ? await res.json().catch(() => null) : null };
    } catch {
        return { status: 0, body: null };
    }
}

// 資料來自外部：id 會拼進圖片網址，名稱會進輸入框，都要驗格式
function collect(data: unknown, byName: Record<string, string>, list: TwitchEmote[]) {
    if (!Array.isArray(data)) return;
    for (const e of data as { id?: unknown; name?: unknown; owner_id?: unknown; emote_type?: unknown; format?: unknown }[]) {
        if (typeof e?.id !== 'string' || !/^[A-Za-z0-9_]+$/.test(e.id) || typeof e.name !== 'string' || !/^\S+$/.test(e.name)) continue;
        const animated = Array.isArray(e.format) && e.format.includes('animated');
        byName[e.name] = e.id;
        list.push({
            name: e.name, id: e.id,
            ownerId: typeof e.owner_id === 'string' ? e.owner_id : '',
            type: typeof e.emote_type === 'string' ? e.emote_type : '',
            url: `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(e.id)}/${animated ? 'animated' : 'default'}/dark/1.0`,
        });
    }
}

interface TokenInfo { clientId: string; userId: string; scopes: string[] }
let validated: { token: string; info: Promise<TokenInfo | null> } | null = null;

/** 同一個權杖只 validate 一次；失敗不快取 */
function validate(token: string): Promise<TokenInfo | null> {
    if (validated?.token !== token) {
        const entry = { token, info: get('https://id.twitch.tv/oauth2/validate', { Authorization: `OAuth ${token}` }).then(v => {
            const b = v.body as { client_id?: string; user_id?: string; scopes?: string[] } | null;
            if (!b?.client_id || !b.user_id) { if (validated === entry) validated = null; return null; }
            return { clientId: b.client_id, userId: b.user_id, scopes: b.scopes ?? [] };
        }) };
        validated = entry;
    }
    return validated.info;
}
const authHeaders = (token: string, info: TokenInfo) => ({ Authorization: `Bearer ${token}`, 'Client-Id': info.clientId });

/** 依 cursor 取完使用者貼圖；denied＝權杖沒權限，complete＝每頁都成功 */
async function fetchUserEmotes(token: string, info: TokenInfo, extra: string): Promise<{ byName: Record<string, string>; emotes: TwitchEmote[]; denied: boolean; complete: boolean }> {
    const byName: Record<string, string> = {};
    const emotes: TwitchEmote[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
        const r = await get(`${HELIX}/user?user_id=${encodeURIComponent(info.userId)}${extra}${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`, authHeaders(token, info));
        if (r.status === 401 || r.status === 403) return { byName, emotes, denied: true, complete: true };
        if (r.status !== 200) return { byName, emotes, denied: false, complete: false };
        const b = r.body as { data?: unknown; pagination?: { cursor?: string } } | null;
        collect(b?.data, byName, emotes);
        cursor = b?.pagination?.cursor;
        if (!cursor) break;
    }
    return { byName, emotes, denied: false, complete: true };
}

/** complete＝每個請求都成功；不完整（網路錯誤、5xx、429）的結果照用但不快取 */
async function fetchSet(token: string): Promise<{ set: TwitchEmoteSet; complete: boolean }> {
    const info = await validate(token);
    if (!info) return { set: { byName: {}, emotes: [], needsReauth: false }, complete: false };
    if (info.scopes.includes('user:read:emotes')) {
        const r = await fetchUserEmotes(token, info, '');
        if (!r.denied) return { set: { byName: r.byName, emotes: r.emotes, needsReauth: false, userId: info.userId }, complete: r.complete };
    }
    const byName: Record<string, string> = {};
    const emotes: TwitchEmote[] = [];
    const g = await get(`${HELIX}/global`, authHeaders(token, info));
    collect((g.body as { data?: unknown } | null)?.data, byName, emotes);
    return { set: { byName, emotes, needsReauth: true, userId: info.userId }, complete: g.status === 200 };
}

let cache: { token: string; set: Promise<TwitchEmoteSet> } | null = null;

/** 同一個權杖只查一次；權杖換了（續期或換帳號）就重查 */
export function loadTwitchEmotes(creds: { login: string; token: string }): Promise<TwitchEmoteSet> {
    if (cache?.token !== creds.token) {
        const entry: { token: string; set: Promise<TwitchEmoteSet> } = { token: creds.token, set: fetchSet(creds.token).then(r => {
            // 不完整的不快取（先清再交出結果，呼叫端拿到時下一次一定重查）
            if (!r.complete && cache === entry) cache = null;
            return r.set;
        }) };
        cache = entry;
    }
    return cache.set;
}

/** 登出或換帳號時清掉（快取裡有權杖） */
export function resetTwitchEmotes(): void {
    cache = null;
    validated = null;
    followers.clear();
    owners.clear();
}

const owners = new Map<string, TwitchOwner>();

/** 貼圖擁有者（頻道）的名稱與頭像；查過的記在記憶體，查不到的下次再試 */
export async function loadTwitchOwners(creds: { login: string; token: string }, ids: string[]): Promise<Record<string, TwitchOwner>> {
    const info = await validate(creds.token);
    const want = [...new Set(ids)].filter(id => /^\d+$/.test(id) && !owners.has(id));
    if (info) {
        for (let i = 0; i < want.length; i += 100) {
            const qs = want.slice(i, i + 100).map(id => `id=${id}`).join('&');
            const r = await get(`https://api.twitch.tv/helix/users?${qs}`, authHeaders(creds.token, info));
            const data = (r.body as { data?: unknown } | null)?.data;
            if (!Array.isArray(data)) continue;
            for (const u of data as { id?: unknown; login?: unknown; display_name?: unknown; profile_image_url?: unknown }[]) {
                if (typeof u?.id !== 'string' || typeof u.login !== 'string') continue;
                const avatar = typeof u.profile_image_url === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u.profile_image_url) ? u.profile_image_url : undefined;
                owners.set(u.id, { id: u.id, login: u.login, displayName: typeof u.display_name === 'string' && u.display_name ? u.display_name : u.login, ...(avatar ? { avatar } : {}) });
            }
        }
    }
    const out: Record<string, TwitchOwner> = {};
    for (const id of ids) { const o = owners.get(id); if (o) out[id] = o; }
    return out;
}

const followers = new Map<string, Promise<TwitchEmote[]>>();

/** 某頻道你能用的追隨者貼圖（只在該頻道能用）；同權杖同頻道只查一次，不完整的不快取 */
export function loadFollowerEmotes(creds: { login: string; token: string }, broadcasterId: string): Promise<TwitchEmote[]> {
    if (!/^\d+$/.test(broadcasterId)) return Promise.resolve([]);
    const key = `${creds.token}:${broadcasterId}`;
    let hit = followers.get(key);
    if (!hit) {
        hit = (async () => {
            const info = await validate(creds.token);
            if (!info?.scopes.includes('user:read:emotes')) { followers.delete(key); return []; }
            const r = await fetchUserEmotes(creds.token, info, `&broadcaster_id=${broadcasterId}`);
            if (!r.complete) followers.delete(key);
            return r.emotes.filter(e => e.type === 'follower' && e.ownerId === broadcasterId);
        })();
        followers.set(key, hit);
    }
    return hit;
}
