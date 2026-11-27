/**
 * Twitch 原生貼圖：用發言權杖查「自己能用的」（含訂閱貼圖）。
 * 權杖沒有 user:read:emotes（舊登入）時退回全域貼圖，並標記需要重新授權。
 */
export interface TwitchEmoteSet { byName: Record<string, string>; needsReauth: boolean }

const TIMEOUT_MS = 8000;
const MAX_PAGES = 10;
const HELIX = 'https://api.twitch.tv/helix/chat/emotes';

export const twitchEmoteUrl = (id: string) => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`;

async function get(url: string, headers: Record<string, string>): Promise<{ status: number; body: unknown }> {
    try {
        const res = await fetch(url, { headers, credentials: 'omit', signal: AbortSignal.timeout(TIMEOUT_MS) });
        return { status: res.status, body: res.ok ? await res.json().catch(() => null) : null };
    } catch {
        return { status: 0, body: null };
    }
}

// 資料來自外部：id 會拼進圖片網址，名稱會進輸入框，都要驗格式
function collect(data: unknown, out: Record<string, string>) {
    if (!Array.isArray(data)) return;
    for (const e of data as { id?: unknown; name?: unknown }[]) {
        if (typeof e?.id === 'string' && /^[A-Za-z0-9_]+$/.test(e.id) && typeof e.name === 'string' && /^\S+$/.test(e.name)) out[e.name] = e.id;
    }
}

async function fetchSet(token: string): Promise<TwitchEmoteSet> {
    const v = await get('https://id.twitch.tv/oauth2/validate', { Authorization: `OAuth ${token}` });
    const info = v.body as { client_id?: string; user_id?: string; scopes?: string[] } | null;
    if (!info?.client_id || !info.user_id) return { byName: {}, needsReauth: false };
    const headers = { Authorization: `Bearer ${token}`, 'Client-Id': info.client_id };
    const byName: Record<string, string> = {};
    if (info.scopes?.includes('user:read:emotes')) {
        let cursor: string | undefined;
        let denied = false;
        for (let page = 0; page < MAX_PAGES; page++) {
            const r = await get(`${HELIX}/user?user_id=${encodeURIComponent(info.user_id)}${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`, headers);
            if (r.status === 401 || r.status === 403) { denied = true; break; }
            const b = r.body as { data?: unknown; pagination?: { cursor?: string } } | null;
            collect(b?.data, byName);
            cursor = b?.pagination?.cursor;
            if (!cursor) break;
        }
        if (!denied) return { byName, needsReauth: false };
    }
    collect(((await get(`${HELIX}/global`, headers)).body as { data?: unknown } | null)?.data, byName);
    return { byName, needsReauth: true };
}

let cache: { token: string; set: Promise<TwitchEmoteSet> } | null = null;

/** 同一個權杖只查一次；權杖換了（續期或換帳號）就重查 */
export function loadTwitchEmotes(creds: { login: string; token: string }): Promise<TwitchEmoteSet> {
    if (cache?.token !== creds.token) {
        const entry = { token: creds.token, set: fetchSet(creds.token) };
        cache = entry;
        // 什麼都沒拿到（網路錯誤）不快取，下次再試
        void entry.set.then(s => { if (!Object.keys(s.byName).length && cache === entry) cache = null; });
    }
    return cache.set;
}

export function resetTwitchEmotes(): void {
    cache = null;
}
