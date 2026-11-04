// 團體嵌入（/embed/schedule/group/<uuid>）的資料層：RPC schedule_group_embed（migration <ts>_schedule_group_embed）。
// vtuber_groups 沒有 slug（中文團名做不出 ASCII slug），對外用 uuid；使用者不會手打，都由產生器複製。
// 回傳 subject（schedule-embed.js 的形狀）或 { kind:'notfound' } / { kind:'error' }；found 進 edge 快取 5 分鐘。
import { anonRpc } from './schedule-person.js';
import { EMBED_CACHE_TTL_S, EMBED_ERROR_TTL_S } from './schedule-embed.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CACHE_ORIGIN = 'https://multistreaming.org/__edge-cache/schedule-group-embed/v1/';
/** 團體嵌入最多列幾場（RPC 端也同樣上限；超過的數量由 RPC 的 total 算成 truncated） */
export const GROUP_MAX_ITEMS = 100;
const DAY_MS = 86_400_000;
const UPCOMING_GRACE_MS = 15 * 60 * 1000;

function pickItem(it) {
    const s = {
        title: typeof it.title === 'string' ? it.title.slice(0, 300) : '',
        platform: it.platform === 'twitch' ? 'twitch' : 'youtube',
        start: it.actual_start ?? it.scheduled_start ?? null,
        member: typeof it.member_name === 'string' ? it.member_name.slice(0, 120) : '',
    };
    if (it.time_tbd === true && !it.actual_start) s.tbd = true;
    return s;
}

/** 把 RPC 回傳整理成 subject；形狀不對回 null */
export function groupSubjectFromRpc(data, now = Date.now()) {
    if (!data || typeof data !== 'object' || !data.group || typeof data.group.name !== 'string') return null;
    const items = Array.isArray(data.items) ? data.items.filter((x) => x && typeof x === 'object') : [];
    const live = [];
    const upcoming = [];
    const until = now + 7 * DAY_MS;
    for (const it of items) {
        if (it.status === 'live') live.push(pickItem(it));
        else if (it.status === 'scheduled') {
            const t = Date.parse(it.scheduled_start);
            const notPast = it.time_tbd === true ? t + DAY_MS > now : t + UPCOMING_GRACE_MS >= now;
            if (Number.isFinite(t) && notPast && t <= until) upcoming.push(pickItem(it));
        }
    }
    const sortKey = (x) => Date.parse(x.start) + (x.tbd ? DAY_MS - 1 : 0);
    upcoming.sort((a, b) => sortKey(a) - sortKey(b));
    const parent = typeof data.group.parent_name === 'string' && data.group.parent_name ? data.group.parent_name : null;
    const total = Number(data.total);
    const truncated = Number.isFinite(total) && total > items.length ? total - items.length : 0;
    return {
        truncated,
        id: String(data.group.id ?? ''),
        name: parent && parent !== data.group.name ? `${parent} · ${data.group.name}` : data.group.name,
        image: null,
        streams: { live: live.slice(0, GROUP_MAX_ITEMS), upcoming: upcoming.slice(0, GROUP_MAX_ITEMS) },
        pagePath: `/vtubers#directory-group-${String(data.group.id ?? '')}`,
    };
}

/** 解析團體 uuid → { kind:'found', subject } | { kind:'notfound' } | { kind:'error' }；found／notfound 進 edge 快取 */
export async function resolveGroupEmbed(env, id, rpcFn = anonRpc, cache = globalThis.caches?.default ?? null, now = Date.now()) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) return { kind: 'notfound' };
    const key = new Request(CACHE_ORIGIN + id.toLowerCase());
    if (cache) {
        const hit = await cache.match(key).catch(() => null);
        if (hit) {
            const cached = await hit.json().catch(() => null);
            if (cached && (cached.kind === 'found' || cached.kind === 'notfound')) return cached;
        }
    }
    const res = await rpcFn(env, 'schedule_group_embed', { p_group_id: id.toLowerCase() });
    if (!res || !res.ok) return { kind: 'error' };
    const subject = res.data === null ? null : groupSubjectFromRpc(res.data, now);
    const result = subject ? { kind: 'found', subject } : { kind: 'notfound' };
    if (cache) {
        const ttl = result.kind === 'found' ? EMBED_CACHE_TTL_S : EMBED_ERROR_TTL_S;
        await cache.put(key, new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` } })).catch(() => {});
    }
    return result;
}
