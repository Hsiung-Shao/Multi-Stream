// Snapshot：前端唯一的讀取來源（Supabase Storage public bucket `streams`，路徑 v1/snapshot.json）。
// 格式依 Docs「資料模型草案」：version、generated_at、heavy_refreshed_at、channels、live、upcoming、recent。
// 時間欄位為 null 時直接省略。

import type { Db } from './db.ts';
import { DbError, inList } from './db.ts';
import { isRecentForSnapshot, isUpcomingForSnapshot, RECENT_WINDOW_HOURS } from './rules.ts';
import type { StreamRecord } from './types.ts';

export const SNAPSHOT_BUCKET = 'streams';
export const SNAPSHOT_PATH = 'v1/snapshot.json';
/** Storage cache-control 秒數；Docs：snapshot 有效 1 分鐘、頁面每 5 分鐘檢查 */
export const SNAPSHOT_CACHE_SECONDS = '60';

export interface SnapshotChannel {
  name: string;
  avatar?: string;
  group?: string;
  nationality: string;
  youtube?: string; // UC…
  twitch?: string; // login
  /** 個人週表頁 /schedule/<slug> */
  slug?: string;
  /** 所屬企業勢（公司名）：企業勢子團取所屬公司、企業勢本身取自己；社團／個人工作室／未查證不輸出 */
  agency?: string;
  /** 合作中的企業勢（公司名；不含主所屬公司）：vtuber_group_links role=collaborator、已開始（since 空或已到）且未結束（until 空或未到） */
  collabs?: string[];
}

/** 團體 id → 顯示名與所屬企業勢 */
export interface SnapshotGroupInfo {
  name: string;
  agency: string | null;
}

export interface GroupRow {
  id: string;
  name: string;
  kind: string;
  parent_id: string | null;
}

/** 由 vtuber_groups 算出每個團體的所屬企業勢（子團往上找公司） */
export function resolveGroups(rows: readonly GroupRow[]): Map<string, SnapshotGroupInfo> {
  const byId = new Map(rows.map((g) => [g.id, g]));
  const out = new Map<string, SnapshotGroupInfo>();
  for (const g of rows) {
    const parent = g.parent_id ? byId.get(g.parent_id) : undefined;
    const agency = g.kind === 'agency' ? (parent?.kind === 'agency' ? parent.name : g.name) : null;
    out.set(g.id, { name: g.name, agency });
  }
  return out;
}

export interface GroupLinkRow {
  vtuber_id: string;
  group_id: string;
}

/** 台北日期（YYYY-MM-DD）；台灣沒有日光節約，固定 +8 */
export function taipeiDate(now: number): string {
  return new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
}

/** 合作關係 → 每位藝人合作中的公司名（依名稱排序、去重、排除主所屬公司與非企業勢） */
export function resolveCollabs(
  links: readonly GroupLinkRow[],
  groups: ReadonlyMap<string, SnapshotGroupInfo>,
): Map<string, string[]> {
  const out = new Map<string, Set<string>>();
  for (const l of links) {
    const agency = groups.get(l.group_id)?.agency;
    if (!agency) continue;
    const set = out.get(l.vtuber_id) ?? new Set<string>();
    set.add(agency);
    out.set(l.vtuber_id, set);
  }
  return new Map([...out].map(([id, set]) => [id, [...set].sort()]));
}

/** 合併進主場次的另一平台場次（雙平台同一場，見 merge.ts） */
export interface SnapshotAlso {
  platform: 'youtube' | 'twitch';
  external_id: string;
  source: string;
}

/**
 * 場次的精簡表示。前端可自行推導的欄位不放（本地實測 860 場 + 580 頻道的 snapshot 有 600KB，砍掉後約一半）：
 *   - 觀看網址：youtube → https://www.youtube.com/watch?v=<external_id>；twitch → https://www.twitch.tv/<channels[vtuber_id].twitch>
 *   - 縮圖：youtube → https://i.ytimg.com/vi/<external_id>/hqdefault.jpg；twitch → https://static-cdn.jtvnw.net/previews-ttv/live_user_<login>-640x360.jpg
 *   - 主鍵：(platform, external_id) 唯一，不另帶資料庫 uuid
 */
export interface SnapshotStream {
  vtuber_id: string;
  platform: 'youtube' | 'twitch';
  external_id: string;
  source: string;
  status: string;
  title?: string;
  category?: string;
  viewer_count?: number;
  scheduled_start?: string;
  actual_start?: string;
  actual_end?: string;
  also?: SnapshotAlso[];
}

export interface Snapshot {
  version: 1;
  generated_at: string;
  heavy_refreshed_at?: string;
  channels: Record<string, SnapshotChannel>;
  live: SnapshotStream[];
  upcoming: SnapshotStream[];
  recent: SnapshotStream[];
  /** 所有企業勢（頂層公司，依名稱排序）：「所屬」選單要列出本週沒有場次的公司 */
  agencies?: string[];
}

interface VtuberRow {
  id: string;
  name: string;
  img_url: string | null;
  nationality: string;
  group_id: string | null;
  youtube_channel_id: string | null;
  twitch_channel_id: string | null;
  slug?: string | null;
}

/** snapshot 需要的場次欄位：streams 列＋合併指向 */
export type SnapshotSourceRow = StreamRecord & { merged_with?: string | null };

const TITLE_MAX = 120;

function omitNull<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)) as T;
}

/** 純函式：把 streams 與名冊組成 snapshot（測試直接餵資料） */
export function buildSnapshot(
  streams: readonly SnapshotSourceRow[],
  vtubers: readonly VtuberRow[],
  groups: ReadonlyMap<string, SnapshotGroupInfo>,
  now: number,
  heavyRefreshedAt: string | null,
  collabs: ReadonlyMap<string, readonly string[]> = new Map(),
  agencies: readonly string[] = [],
): Snapshot {
  const vmap = new Map(vtubers.map((v) => [v.id, v]));
  const live: SnapshotStream[] = [];
  const upcoming: SnapshotStream[] = [];
  const recent: SnapshotStream[] = [];
  const usedVtubers = new Set<string>();

  // 合併：被併入的場次（merged_with 指向一個會輸出的主場次）不單獨輸出，改掛在主場次的 also
  const visible = (s: SnapshotSourceRow) => s.status !== 'hidden' && !s.is_schedule_frame;
  const byId = new Map(streams.map((s) => [s.id, s]));
  const alsoOf = new Map<string, SnapshotAlso[]>();
  const merged = new Set<string>();
  for (const s of streams) {
    if (!s.merged_with || !visible(s)) continue;
    const primary = byId.get(s.merged_with);
    if (!primary || !visible(primary)) continue;
    merged.add(s.id);
    const list = alsoOf.get(primary.id) ?? [];
    list.push({ platform: s.platform, external_id: s.external_id, source: s.source });
    alsoOf.set(primary.id, list);
  }

  const toItem = (s: SnapshotSourceRow): SnapshotStream =>
    omitNull({
      vtuber_id: s.vtuber_id,
      platform: s.platform,
      external_id: s.external_id,
      source: s.source,
      status: s.status,
      title: s.title ? s.title.slice(0, TITLE_MAX) : null,
      category: s.category,
      viewer_count: s.viewer_count,
      scheduled_start: s.scheduled_start,
      actual_start: s.actual_start,
      actual_end: s.actual_end,
      also: alsoOf.get(s.id) ?? null,
    }) as SnapshotStream;

  for (const s of streams) {
    if (!visible(s) || merged.has(s.id)) continue;
    if (s.status === 'live') live.push(toItem(s));
    else if (isUpcomingForSnapshot(s, now)) upcoming.push(toItem(s));
    else if (isRecentForSnapshot(s, now)) recent.push(toItem(s));
    else continue;
    usedVtubers.add(s.vtuber_id);
  }
  const byStart = (a: SnapshotStream, b: SnapshotStream) =>
    Date.parse(a.scheduled_start ?? a.actual_start ?? '') - Date.parse(b.scheduled_start ?? b.actual_start ?? '');
  live.sort((a, b) => (b.viewer_count ?? 0) - (a.viewer_count ?? 0));
  upcoming.sort(byStart);
  recent.sort((a, b) => Date.parse(b.actual_end ?? '') - Date.parse(a.actual_end ?? ''));

  const channels: Record<string, SnapshotChannel> = {};
  for (const id of usedVtubers) {
    const v = vmap.get(id);
    if (!v) continue;
    const agency = v.group_id ? groups.get(v.group_id)?.agency ?? null : null;
    const collabList = (collabs.get(id) ?? []).filter((a) => a !== agency);
    channels[id] = omitNull({
      name: v.name,
      avatar: v.img_url,
      group: v.group_id ? groups.get(v.group_id)?.name ?? null : null,
      agency,
      collabs: collabList.length ? collabList : null,
      nationality: v.nationality,
      youtube: v.youtube_channel_id,
      twitch: v.twitch_channel_id,
      slug: v.slug ?? null,
    }) as SnapshotChannel;
  }

  return omitNull({
    version: 1 as const,
    generated_at: new Date(now).toISOString(),
    heavy_refreshed_at: heavyRefreshedAt,
    channels,
    live,
    upcoming,
    recent,
    agencies: agencies.length ? [...agencies] : null,
  }) as Snapshot;
}

/** 從資料庫組 snapshot 並上傳；回傳位元組數 */
export async function publishSnapshot(db: Db, now: number, heavyRefreshedAt: string | null): Promise<number> {
  const cols =
    'id,vtuber_id,channel_id,platform,external_id,source,status,scheduled_start,scheduled_end,actual_start,actual_end,title,category,thumbnail_url,viewer_count,is_schedule_frame,fetched_at,merged_with';
  const sinceIso = new Date(now - RECENT_WINDOW_HOURS * 3_600_000).toISOString();
  const active = await db.selectAll<SnapshotSourceRow>(
    'streams',
    `select=${cols}&status=in.(scheduled,live)&is_schedule_frame=eq.false`,
  );
  const ended = await db.selectAll<SnapshotSourceRow>(
    'streams',
    `select=${cols}&status=eq.ended&actual_end=gte.${encodeURIComponent(sinceIso)}`,
  );
  const streams = [...active, ...ended];
  const vtuberIds = [...new Set(streams.map((s) => s.vtuber_id))];
  const vtubers: VtuberRow[] = [];
  for (let i = 0; i < vtuberIds.length; i += 100) {
    vtubers.push(
      ...(await db.select<VtuberRow>(
        'vtubers',
        `select=id,name,img_url,nationality,group_id,youtube_channel_id,twitch_channel_id,slug&id=${inList(vtuberIds.slice(i, i + 100))}&limit=100`,
      )),
    );
  }
  // kind／parent_id 由 20260929110000 migration 新增；migration 還沒套的環境退回只讀團名（沒有所屬企業勢），snapshot 照常發布
  let groupRows: GroupRow[];
  try {
    groupRows = await db.selectAll<GroupRow>('vtuber_groups', 'select=id,name,kind,parent_id');
  } catch {
    const legacy = await db.selectAll<{ id: string; name: string }>('vtuber_groups', 'select=id,name');
    groupRows = legacy.map((g) => ({ ...g, kind: 'unverified', parent_id: null }));
  }
  const groups = resolveGroups(groupRows);
  // vtuber_group_links 由 20260930100000 新增；表還沒建（404／400）的環境視為沒有合作。
  // 其他錯誤也不擋 snapshot 發布（合作是附屬資訊），但留 log，下一輪發布會補回
  let links: GroupLinkRow[] = [];
  try {
    // since／until 是已公告的起訖日（台北日期）：開始當天起、結束當天以前算合作中
    const today = taipeiDate(now);
    links = await db.selectAll<GroupLinkRow>(
      'vtuber_group_links',
      `select=vtuber_id,group_id&role=eq.collaborator&or=(since.is.null,since.lte.${today})&and=(or(until.is.null,until.gte.${today}))`,
      'vtuber_id,group_id', // 這張表沒有 id 欄，分頁排序用主鍵
    );
  } catch (e) {
    if (!(e instanceof DbError && (e.status === 404 || e.status === 400))) {
      console.warn(`vtuber_group_links: ${e instanceof Error ? e.message : 'error'}`);
    }
    links = [];
  }
  const used = new Set(vtuberIds);
  const collabs = resolveCollabs(links.filter((l) => used.has(l.vtuber_id)), groups);

  const agencies = groupRows
    .filter((g) => g.kind === 'agency' && !g.parent_id)
    .map((g) => g.name)
    .sort((a, b) => a.localeCompare(b));
  const snapshot = buildSnapshot(streams, vtubers, groups, now, heavyRefreshedAt, collabs, agencies);
  const body = JSON.stringify(snapshot);
  await db.putStorageObject(SNAPSHOT_BUCKET, SNAPSHOT_PATH, body, 'application/json', SNAPSHOT_CACHE_SECONDS);
  return new TextEncoder().encode(body).length;
}
