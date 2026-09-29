// 個人週表頁（/schedule/<slug>）的資料：直接以 anon 身分查 PostgREST，不載入 supabase-js（省約 59 KB gzip）。
//
// 連線資訊解析順序與 snapshotSource 相同：
//   1. VITE_SCHEDULE_SUPABASE_URL ＋ VITE_SCHEDULE_SUPABASE_ANON_KEY（本地開發指向本地 Supabase；anon key 本來就是公開值）
//   2. /api/supabase-config（正式站，與 getSupabase 同一個來源）
// RLS 已排除隱藏的場次與常駐框（見 migration 20260928100000_schedule_stage1）；這裡仍帶 is_schedule_frame=eq.false 以防萬一。
// client fetch 一律加逾時（memory error_client_fetch_needs_timeout）。

import { SCHEDULE_SLUG_RE } from '../../config/schedulePerson';
import { SnapshotError, SNAPSHOT_TIMEOUT_MS, fetchWithTimeout } from './snapshotSource';
import type { ScheduleAlso, ScheduleChannel, ScheduleStream } from './types';

/** 最近幾天的直播紀錄 */
export const PERSON_RECENT_DAYS = 30;
/** 接下來幾天（與公共週表一致） */
export const PERSON_UPCOMING_DAYS = 7;
/** 排定中／直播中的上限（7 天內一個人不會超過）與最近紀錄的上限（30 天、新到舊） */
const ACTIVE_LIMIT = 100;
const RECENT_LIMIT = 200;

export interface SchedulePerson {
    id: string;
    channel: ScheduleChannel;
    /** 近 90 天有開台或有排程：可索引（sitemap／robots 同一個欄位） */
    indexable: boolean;
    live: ScheduleStream[];
    upcoming: ScheduleStream[];
    recent: ScheduleStream[];
}

interface RestConfig {
    url: string;
    anonKey: string;
}

export interface PersonFetchOptions {
    envUrl?: string;
    envAnonKey?: string;
    fetchFn?: typeof fetch;
    signal?: AbortSignal;
    timeoutMs?: number;
    now?: number;
}

let cachedConfig: RestConfig | null = null;

/** 測試用：清掉 supabase-config 的快取 */
export function resetPersonSourceCache(): void {
    cachedConfig = null;
}

async function resolveRestConfig(opts: PersonFetchOptions): Promise<RestConfig> {
    const envUrl = opts.envUrl ?? (import.meta.env.VITE_SCHEDULE_SUPABASE_URL as string | undefined);
    const envKey = opts.envAnonKey ?? (import.meta.env.VITE_SCHEDULE_SUPABASE_ANON_KEY as string | undefined);
    if (envUrl && envKey) return { url: envUrl.replace(/\/$/, ''), anonKey: envKey };
    if (!cachedConfig) {
        const res = await fetchWithTimeout('/api/supabase-config', opts.timeoutMs ?? SNAPSHOT_TIMEOUT_MS, opts.signal, opts.fetchFn);
        if (!res.ok) throw new SnapshotError('config', `supabase-config HTTP ${res.status}`);
        const cfg = (await res.json().catch(() => null)) as { url?: string; anonKey?: string } | null;
        if (!cfg?.url || !cfg.anonKey) throw new SnapshotError('config', 'supabase-config incomplete');
        cachedConfig = { url: cfg.url.replace(/\/$/, ''), anonKey: cfg.anonKey };
    }
    return cachedConfig;
}

async function restGet<T>(cfg: RestConfig, path: string, opts: PersonFetchOptions): Promise<T> {
    const res = await fetchWithTimeout(`${cfg.url}/rest/v1/${path}`, opts.timeoutMs ?? SNAPSHOT_TIMEOUT_MS, opts.signal, opts.fetchFn, {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
        Accept: 'application/json',
    });
    if (!res.ok) throw new SnapshotError('http', `rest HTTP ${res.status}`);
    const data: unknown = await res.json().catch(() => null);
    if (!Array.isArray(data)) throw new SnapshotError('format', 'unexpected rest response');
    return data as T;
}

interface VtuberRow {
    id: string;
    name: string;
    img_url: string | null;
    nationality: string;
    youtube_channel_id: string | null;
    twitch_channel_id: string | null;
    slug: string;
    schedule_indexable: boolean;
    vtuber_groups: { name: string } | null;
}

export interface PersonStreamRow {
    id: string;
    platform: 'youtube' | 'twitch';
    external_id: string;
    source: string;
    status: string;
    title: string | null;
    category: string | null;
    viewer_count: number | null;
    scheduled_start: string | null;
    actual_start: string | null;
    actual_end: string | null;
    merged_with: string | null;
}

const STREAM_COLS = 'id,platform,external_id,source,status,title,category,viewer_count,scheduled_start,actual_start,actual_end,merged_with';

function toStream(vtuberId: string, r: PersonStreamRow): ScheduleStream {
    const s: ScheduleStream = { vtuber_id: vtuberId, platform: r.platform, external_id: r.external_id, source: r.source, status: r.status };
    if (r.title) s.title = r.title;
    if (r.category) s.category = r.category;
    if (r.viewer_count != null) s.viewer_count = r.viewer_count;
    if (r.scheduled_start) s.scheduled_start = r.scheduled_start;
    if (r.actual_start) s.actual_start = r.actual_start;
    if (r.actual_end) s.actual_end = r.actual_end;
    return s;
}

/**
 * 查詢結果 → 直播中／接下來／最近，規則與後端 buildSnapshot 一致：
 * 有 merged_with 且主場次也在結果裡 → 不單獨輸出，改掛到主場次的 also；主場次不在（例：已過期）就照常輸出。
 */
export function splitPersonStreams(vtuberId: string, rows: readonly PersonStreamRow[], now: number): Pick<SchedulePerson, 'live' | 'upcoming' | 'recent'> {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const also = new Map<string, ScheduleAlso[]>();
    const primaries: PersonStreamRow[] = [];
    for (const r of rows) {
        if (r.merged_with && byId.has(r.merged_with)) {
            const list = also.get(r.merged_with) ?? [];
            list.push({ platform: r.platform, external_id: r.external_id, source: r.source });
            also.set(r.merged_with, list);
        } else {
            primaries.push(r);
        }
    }
    const until = now + PERSON_UPCOMING_DAYS * 86_400_000;
    const live: ScheduleStream[] = [];
    const upcoming: ScheduleStream[] = [];
    const recent: ScheduleStream[] = [];
    for (const r of primaries) {
        const s = toStream(vtuberId, r);
        const extra = also.get(r.id);
        if (extra) s.also = extra;
        if (r.status === 'live') live.push(s);
        else if (r.status === 'scheduled') {
            const t = r.scheduled_start ? Date.parse(r.scheduled_start) : NaN;
            if (Number.isFinite(t) && t <= until) upcoming.push(s);
        } else if (r.status === 'ended' && r.actual_end) recent.push(s);
    }
    upcoming.sort((a, b) => (a.scheduled_start ?? '').localeCompare(b.scheduled_start ?? ''));
    recent.sort((a, b) => (b.actual_end ?? '').localeCompare(a.actual_end ?? ''));
    return { live, upcoming, recent };
}

/** 依 slug 查個人週表；slug 不合規則或查無此人回 null（頁面顯示 404） */
export async function fetchPerson(slug: string, opts: PersonFetchOptions = {}): Promise<SchedulePerson | null> {
    if (!SCHEDULE_SLUG_RE.test(slug)) return null;
    const cfg = await resolveRestConfig(opts);
    const vtuberSelect = 'id,name,img_url,nationality,youtube_channel_id,twitch_channel_id,slug,schedule_indexable,vtuber_groups(name)';
    const vtubers = await restGet<VtuberRow[]>(cfg, `vtubers?select=${encodeURIComponent(vtuberSelect)}&slug=eq.${encodeURIComponent(slug)}&limit=1`, opts);
    const v = vtubers[0];
    if (!v) return null;

    const now = opts.now ?? Date.now();
    const since = new Date(now - PERSON_RECENT_DAYS * 86_400_000).toISOString();
    // 拆成兩支查詢：合在一起用 scheduled_start 排序＋limit 時，Twitch 直播（scheduled_start 為 null）
    // 與最新的紀錄會最先被截掉。兩支並行，合併邏輯需要看到所有列才能把次要場次掛到主場次。
    const base = `streams?select=${STREAM_COLS}&vtuber_id=eq.${v.id}&is_schedule_frame=eq.false`;
    const [active, ended] = await Promise.all([
        restGet<PersonStreamRow[]>(cfg, `${base}&status=in.(scheduled,live)&order=scheduled_start.asc.nullsfirst&limit=${ACTIVE_LIMIT}`, opts),
        restGet<PersonStreamRow[]>(cfg, `${base}&status=eq.ended&actual_end=gte.${since}&order=actual_end.desc&limit=${RECENT_LIMIT}`, opts),
    ]);
    const rows = [...active, ...ended];

    const channel: ScheduleChannel = { name: v.name, nationality: v.nationality, slug: v.slug };
    if (v.img_url) channel.avatar = v.img_url;
    if (v.vtuber_groups?.name) channel.group = v.vtuber_groups.name;
    if (v.youtube_channel_id) channel.youtube = v.youtube_channel_id;
    if (v.twitch_channel_id) channel.twitch = v.twitch_channel_id;

    return { id: v.id, channel, indexable: v.schedule_indexable, ...splitPersonStreams(v.id, rows, now) };
}
