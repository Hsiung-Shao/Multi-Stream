// 個人週表頁（/schedule/<slug>）的資料：直接以 anon 身分查 PostgREST，不載入 supabase-js（省約 59 KB gzip）。
//
// 連線與逾時見 restClient.ts（與團體名冊共用）。
// RLS 已排除隱藏的場次與常駐框（見 migration 20260928100000_schedule_stage1）；這裡仍帶 is_schedule_frame=eq.false 以防萬一。
// client fetch 一律加逾時（memory error_client_fetch_needs_timeout）。

import { SCHEDULE_SLUG_RE } from '../../config/schedulePerson';
import { SnapshotError } from './snapshotSource';
import { isCollabActive, resetRestConfigCache, resolveRestConfig, restGet, taipeiDate, type RestConfig, type RestOptions } from './restClient';
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

export interface PersonFetchOptions extends RestOptions {
    now?: number;
}

/** 測試用：清掉 supabase-config 的快取（連線設定已抽到 restClient.ts） */
export const resetPersonSourceCache = resetRestConfigCache;

interface VtuberRow {
    id: string;
    name: string;
    img_url: string | null;
    nationality: string;
    youtube_channel_id: string | null;
    twitch_channel_id: string | null;
    slug: string;
    schedule_indexable: boolean;
    vtuber_groups: { name: string; kind?: string; parent?: { name: string; kind: string } | null } | null;
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

/** 所屬企業勢：與後端 snapshot.resolveGroups 同一規則（子團取所屬公司、企業勢本身取自己） */
export function agencyOf(g: VtuberRow['vtuber_groups']): string | null {
    if (!g || g.kind !== 'agency') return null;
    return g.parent?.kind === 'agency' ? g.parent.name : g.name;
}

interface CollabLinkRow {
    since?: string | null;
    until: string | null;
    vtuber_groups: VtuberRow['vtuber_groups'];
}

/** 合作中的企業勢（已開始且未結束）。合作是附屬資訊：查詢失敗（表還沒上線、逾時、5xx）回空陣列，不讓個人頁整頁出錯 */
async function fetchCollabAgencies(cfg: RestConfig, vtuberId: string, today: string, opts: PersonFetchOptions): Promise<string[]> {
    let links: CollabLinkRow[];
    try {
        links = await restGet<CollabLinkRow[]>(
            cfg,
            `vtuber_group_links?select=${encodeURIComponent('since,until,vtuber_groups(name,kind,parent:parent_id(name,kind))')}&vtuber_id=eq.${vtuberId}&role=eq.collaborator`,
            opts,
        );
    } catch (e) {
        if (opts.signal?.aborted) throw e;
        if (!(e instanceof SnapshotError && /HTTP 404/.test(e.message))) console.warn('person collabs unavailable');
        return [];
    }
    const names = links.filter((l) => isCollabActive(l.since, l.until, today)).map((l) => agencyOf(l.vtuber_groups));
    return [...new Set(names.filter((n): n is string => !!n))].sort();
}

/** 依 slug 查個人週表；slug 不合規則或查無此人回 null（頁面顯示 404） */
export async function fetchPerson(slug: string, opts: PersonFetchOptions = {}): Promise<SchedulePerson | null> {
    if (!SCHEDULE_SLUG_RE.test(slug)) return null;
    const cfg = await resolveRestConfig(opts);
    const vtuberCols = 'id,name,img_url,nationality,youtube_channel_id,twitch_channel_id,slug,schedule_indexable';
    const bySlug = `&slug=eq.${encodeURIComponent(slug)}&limit=1`;
    let vtubers: VtuberRow[];
    try {
        vtubers = await restGet<VtuberRow[]>(cfg, `vtubers?select=${encodeURIComponent(`${vtuberCols},vtuber_groups(name,kind,parent:parent_id(name,kind))`)}${bySlug}`, opts);
    } catch (e) {
        // vtuber_groups 的 kind／parent_id 還沒上線（migration 未套）時 PostgREST 回 400：退回只查團名
        if (!(e instanceof SnapshotError && e.message.includes('HTTP 400'))) throw e;
        vtubers = await restGet<VtuberRow[]>(cfg, `vtubers?select=${encodeURIComponent(`${vtuberCols},vtuber_groups(name)`)}${bySlug}`, opts);
    }
    const v = vtubers[0];
    if (!v) return null;

    const now = opts.now ?? Date.now();
    const since = new Date(now - PERSON_RECENT_DAYS * 86_400_000).toISOString();
    // 拆成兩支查詢：合在一起用 scheduled_start 排序＋limit 時，Twitch 直播（scheduled_start 為 null）
    // 與最新的紀錄會最先被截掉。兩支並行，合併邏輯需要看到所有列才能把次要場次掛到主場次。
    const base = `streams?select=${STREAM_COLS}&vtuber_id=eq.${v.id}&is_schedule_frame=eq.false`;
    const [active, ended, collabs] = await Promise.all([
        restGet<PersonStreamRow[]>(cfg, `${base}&status=in.(scheduled,live)&order=scheduled_start.asc.nullsfirst&limit=${ACTIVE_LIMIT}`, opts),
        restGet<PersonStreamRow[]>(cfg, `${base}&status=eq.ended&actual_end=gte.${since}&order=actual_end.desc&limit=${RECENT_LIMIT}`, opts),
        fetchCollabAgencies(cfg, v.id, taipeiDate(now), opts),
    ]);
    const rows = [...active, ...ended];

    const channel: ScheduleChannel = { name: v.name, nationality: v.nationality, slug: v.slug };
    if (v.img_url) channel.avatar = v.img_url;
    if (v.vtuber_groups?.name) channel.group = v.vtuber_groups.name;
    const agency = agencyOf(v.vtuber_groups);
    if (agency) channel.agency = agency;
    const otherCollabs = collabs.filter((a) => a !== agency);
    if (otherCollabs.length) channel.collabs = otherCollabs;
    if (v.youtube_channel_id) channel.youtube = v.youtube_channel_id;
    if (v.twitch_channel_id) channel.twitch = v.twitch_channel_id;

    return { id: v.id, channel, indexable: v.schedule_indexable, ...splitPersonStreams(v.id, rows, now) };
}
