/**
 * 可分享連結：/canvas?streams=tw:<channel>,yt:<videoId>[&chat=1]
 *
 * - 純函式、零 DOM：序列化/解析都在這裡，App.tsx（啟動消費）與分享按鈕共用。
 * - compact 前綴（tw:/yt:）比塞完整 URL 短且不必 encode；id 只允許 [A-Za-z0-9_-]，其餘 token 忽略。
 * - 只還原「看哪些台」：volume/mute/視窗座標不進 URL（addStream 的模板排版會自己算）。
 * - YouTube 只在有 videoId 時序列化（頻道頁沒有 videoId 無法還原，直播結束後連結自然失效屬預期）。
 */
export const SHARE_PARAM = 'streams';
export const SHARE_CHAT_PARAM = 'chat';
/** 與 useStreamStore.addStream 的 16 路上限一致 */
export const SHARE_MAX = 16;

export type SharePlatform = 'twitch' | 'youtube';
export interface ShareEntry { platform: SharePlatform; id: string }
export interface SharePayload { streams: ShareEntry[]; chat: boolean }

const PREFIX: Record<SharePlatform, string> = { twitch: 'tw', youtube: 'yt' };
const PLATFORM_BY_PREFIX: Record<string, SharePlatform> = { tw: 'twitch', yt: 'youtube' };
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

type ShareSource = { platform: SharePlatform; channelId?: string | null; videoId?: string | null };

/** 從目前串流列表組出 query string（不含 '?'）；無可分享串流回 '' */
export function serializeShare(streams: ShareSource[], chat: boolean): string {
    const seen = new Set<string>();
    const tokens: string[] = [];
    for (const s of streams) {
        if (tokens.length >= SHARE_MAX) break;
        const id = s.platform === 'twitch' ? (s.channelId ?? '').toLowerCase() : (s.videoId ?? '');
        if (!ID_RE.test(id)) continue;
        const token = `${PREFIX[s.platform]}:${id}`;
        if (seen.has(token)) continue;
        seen.add(token);
        tokens.push(token);
    }
    if (tokens.length === 0) return '';
    return `${SHARE_PARAM}=${tokens.join(',')}${chat ? `&${SHARE_CHAT_PARAM}=1` : ''}`;
}

/** 解析 location.search；沒有 streams 參數或沒有任何合法 token 回 null */
export function parseShare(search: string): SharePayload | null {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const raw = params.get(SHARE_PARAM);
    if (!raw) return null;
    const seen = new Set<string>();
    const streams: ShareEntry[] = [];
    for (const token of raw.split(',')) {
        if (streams.length >= SHARE_MAX) break;
        const idx = token.indexOf(':');
        if (idx <= 0) continue;
        const platform = PLATFORM_BY_PREFIX[token.slice(0, idx)];
        let id = token.slice(idx + 1).trim();
        if (!platform || !ID_RE.test(id)) continue;
        if (platform === 'twitch') id = id.toLowerCase();
        const key = `${platform}:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        streams.push({ platform, id });
    }
    if (streams.length === 0) return null;
    return { streams, chat: params.get(SHARE_CHAT_PARAM) === '1' };
}

export function buildShareUrl(origin: string, streams: ShareSource[], chat: boolean): string | null {
    const qs = serializeShare(streams, chat);
    return qs ? `${origin}/canvas?${qs}` : null;
}

/** 還原成 addStream 接受的來源 URL */
export function entryToUrl(e: ShareEntry): string {
    return e.platform === 'twitch'
        ? `https://twitch.tv/${e.id}`
        : `https://www.youtube.com/watch?v=${e.id}`;
}
