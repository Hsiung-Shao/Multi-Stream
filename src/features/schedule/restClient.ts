// 週表前端直接以 anon 身分查 PostgREST 的共用連線（個人頁、團體名冊），不載入 supabase-js（省約 59 KB gzip）。
//
// 連線資訊解析順序與 snapshotSource 相同：
//   1. VITE_SCHEDULE_SUPABASE_URL ＋ VITE_SCHEDULE_SUPABASE_ANON_KEY（本地開發指向本地 Supabase；anon key 本來就是公開值）
//   2. /api/supabase-config（正式站，與 getSupabase 同一個來源；模組內快取）
// client fetch 一律加逾時（memory error_client_fetch_needs_timeout）。

import { SnapshotError, SNAPSHOT_TIMEOUT_MS, fetchWithTimeout } from './snapshotSource';

export interface RestConfig {
    url: string;
    anonKey: string;
}

export interface RestOptions {
    envUrl?: string;
    envAnonKey?: string;
    fetchFn?: typeof fetch;
    signal?: AbortSignal;
    timeoutMs?: number;
}

let cachedConfig: RestConfig | null = null;

/** 測試用：清掉 supabase-config 的快取 */
export function resetRestConfigCache(): void {
    cachedConfig = null;
}

export async function resolveRestConfig(opts: RestOptions): Promise<RestConfig> {
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

/** 台北日期（YYYY-MM-DD）；台灣沒有日光節約，固定 +8。與後端 snapshot.taipeiDate 同規則 */
export function taipeiDate(now: number): string {
    return new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
}

/** 合作關係在 today（台北日期）是否進行中：已開始（since 空或已到）且未結束（until 空或未到） */
export function isCollabActive(since: string | null | undefined, until: string | null | undefined, today: string): boolean {
    return (!since || since <= today) && (!until || until >= today);
}

/** GET /rest/v1/<path>，回傳陣列；非 2xx 或格式不對丟 SnapshotError */
export async function restGet<T>(cfg: RestConfig, path: string, opts: RestOptions): Promise<T> {
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
