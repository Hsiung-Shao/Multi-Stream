// Snapshot：前端唯一的讀取來源（Supabase Storage public bucket `streams`，路徑 v1/snapshot.json）。
// 格式依 Docs「資料模型草案」：version、generated_at、heavy_refreshed_at、channels、live、upcoming、recent。
// 時間欄位為 null 時直接省略。

import type { Db } from './db.ts';
import { isRecentForSnapshot, isUpcomingForSnapshot, LIVE_STALE_HOURS, RECENT_WINDOW_HOURS } from './rules.ts';
import type { StreamRecord } from './types.ts';

export const SNAPSHOT_BUCKET = 'streams';
export const SNAPSHOT_PATH = 'v1/snapshot.json';
/** snapshot 的快取秒數（回應標頭 Cache-Control: max-age=60）；Docs：snapshot 有效 1 分鐘、頁面每 5 分鐘檢查 */
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
      scheduled_start: s.scheduled_start,
      actual_start: s.actual_start,
      actual_end: s.actual_end,
      also: alsoOf.get(s.id) ?? null,
    }) as SnapshotStream;

  for (const s of streams) {
    if (!visible(s) || merged.has(s.id)) continue;
    if (s.status === 'live') {
      if (now - Date.parse(s.fetched_at) > LIVE_STALE_HOURS * 3_600_000) continue;
      live.push(toItem(s));
    }
    else if (isUpcomingForSnapshot(s, now)) upcoming.push(toItem(s));
    else if (isRecentForSnapshot(s, now)) recent.push(toItem(s));
    else continue;
    usedVtubers.add(s.vtuber_id);
  }
  const byStart = (a: SnapshotStream, b: SnapshotStream) =>
    Date.parse(a.scheduled_start ?? a.actual_start ?? '') - Date.parse(b.scheduled_start ?? b.actual_start ?? '');
  // 不顯示觀看人數（2026-09-30 使用者裁定；live-og 拿不到人數）：直播中依開播時間，新開播的在前
  const startOf = (s: SnapshotStream) => (s.actual_start ? Date.parse(s.actual_start) : 0);
  live.sort((a, b) => startOf(b) - startOf(a));
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

/** 距上次上傳達這麼多分鐘就算資料沒變也重傳一次（generated_at 至多這麼舊；指紋不含 generated_at） */
export const SNAPSHOT_FORCE_MINUTES = 60;

interface SnapshotCheck {
  changed: boolean;
  fingerprint: string;
}

interface CollabLinkRow extends GroupLinkRow {
  since: string | null;
  until: string | null;
}

/** schedule_snapshot_source 的回傳：與原本五支查詢同範圍、同欄位 */
interface SnapshotSource {
  active: SnapshotSourceRow[];
  ended: SnapshotSourceRow[];
  vtubers: VtuberRow[];
  groups: GroupRow[];
  links: CollabLinkRow[];
}

/**
 * 從資料庫組 snapshot 並上傳；回傳位元組數，資料沒變（跳過上傳）時回 0。
 *
 * 出口流量（2026-10-09）：一天約 240 輪，原本每輪都把全部場次、實況主、團體讀回來重組上傳。改成：
 *   1. schedule_snapshot_check：資料庫端算 buildSnapshot 輸入的指紋（範圍與欄位見 migration 20261009120000）。
 *      指紋沒變、且距上次上傳未達 SNAPSHOT_FORCE_MINUTES → 回 0，什麼都不讀
 *   2. schedule_snapshot_source：一次取回來源（場次、用到的實況主、團體、合作）
 *   3. buildSnapshot → 上傳 Storage
 *   4. schedule_snapshot_mark：上傳成功才記指紋（上傳失敗的話下一輪指紋仍視為變動，會重傳）
 * 改 buildSnapshot 用到的欄位或時間窗，要同步改 migration 裡 schedule_snapshot_check 的指紋範圍。
 */
export async function publishSnapshot(db: Db, now: number, heavyRefreshedAt: string | null): Promise<number> {
  const sinceIso = new Date(now - RECENT_WINDOW_HOURS * 3_600_000).toISOString();
  const check = await db.rpc<SnapshotCheck>('schedule_snapshot_check', {
    p_now: new Date(now).toISOString(),
    p_since: sinceIso,
    p_force_minutes: SNAPSHOT_FORCE_MINUTES,
  });
  if (check && check.changed === false) return 0;

  const src = await db.rpc<SnapshotSource>('schedule_snapshot_source', { p_since: sinceIso });
  if (!src) throw new Error('schedule_snapshot_source 回傳空值');
  const streams = [...(src.active ?? []), ...(src.ended ?? [])];
  const groupRows = src.groups ?? [];
  const groups = resolveGroups(groupRows);
  // since／until 是已公告的起訖日（台北日期）：開始當天起、結束當天以前算合作中（資料庫只篩用到的實況主）
  const today = taipeiDate(now);
  const used = new Set(streams.map((s) => s.vtuber_id));
  const links = (src.links ?? []).filter(
    (l) => used.has(l.vtuber_id) && (l.since == null || l.since <= today) && (l.until == null || l.until >= today),
  );
  const collabs = resolveCollabs(links, groups);

  const agencies = groupRows
    .filter((g) => g.kind === 'agency' && !g.parent_id)
    .map((g) => g.name)
    .sort((a, b) => a.localeCompare(b));
  const snapshot = buildSnapshot(streams, src.vtubers ?? [], groups, now, heavyRefreshedAt, collabs, agencies);
  const body = JSON.stringify(snapshot);
  await db.putStorageObject(SNAPSHOT_BUCKET, SNAPSHOT_PATH, body, 'application/json', SNAPSHOT_CACHE_SECONDS);
  if (check?.fingerprint) {
    try {
      await db.rpc('schedule_snapshot_mark', { p_fingerprint: check.fingerprint });
    } catch (e) {
      // 記不下指紋只會讓下一輪多傳一次，不擋這一輪（上傳已成功）
      console.warn(`schedule_snapshot_mark: ${e instanceof Error ? e.message : 'error'}`);
    }
  }
  return new TextEncoder().encode(body).length;
}
