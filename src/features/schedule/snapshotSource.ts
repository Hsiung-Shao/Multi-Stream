// snapshot 的來源網址解析與抓取。
//
// 解析順序：
//   1. VITE_SCHEDULE_SNAPSHOT_URL（本地開發指向本地 Supabase：
//      http://127.0.0.1:57321/storage/v1/object/public/streams/v1/snapshot.json）
//   2. /api/supabase-config 的 url ＋ 固定路徑（正式站；與 getSupabase 同一個設定來源，但不載入 supabase-js）
// client fetch 一律加逾時（memory error_client_fetch_needs_timeout）。

import type { ScheduleSnapshot } from './types';

export const SNAPSHOT_OBJECT_PATH = '/storage/v1/object/public/streams/v1/snapshot.json';
export const SNAPSHOT_TIMEOUT_MS = 10_000;

export class SnapshotError extends Error {
    readonly reason: 'timeout' | 'http' | 'config' | 'format' | 'network';
    constructor(reason: SnapshotError['reason'], message: string) {
        super(message);
        this.name = 'SnapshotError';
        this.reason = reason;
    }
}

export async function fetchWithTimeout(url: string, timeoutMs: number, signal?: AbortSignal, fetchFn: typeof fetch = fetch, headers?: Record<string, string>): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onOuterAbort = () => controller.abort();
    signal?.addEventListener('abort', onOuterAbort);
    try {
        return await fetchFn(url, { signal: controller.signal, headers });
    } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
            throw new SnapshotError(signal?.aborted ? 'network' : 'timeout', 'snapshot request aborted');
        }
        throw new SnapshotError('network', e instanceof Error ? e.message : 'network error');
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onOuterAbort);
    }
}

export interface ResolveOptions {
    envUrl?: string;
    fetchFn?: typeof fetch;
    signal?: AbortSignal;
    timeoutMs?: number;
}

let cachedBase: string | null = null;

/** 測試用：清掉 supabase-config 的快取 */
export function resetSnapshotSourceCache(): void {
    cachedBase = null;
}

export async function resolveSnapshotUrl(opts: ResolveOptions = {}): Promise<string> {
    const envUrl = opts.envUrl ?? (import.meta.env.VITE_SCHEDULE_SNAPSHOT_URL as string | undefined);
    if (envUrl) return envUrl;
    if (!cachedBase) {
        const res = await fetchWithTimeout('/api/supabase-config', opts.timeoutMs ?? SNAPSHOT_TIMEOUT_MS, opts.signal, opts.fetchFn);
        if (!res.ok) throw new SnapshotError('config', `supabase-config HTTP ${res.status}`);
        const cfg = (await res.json().catch(() => null)) as { url?: string } | null;
        if (!cfg?.url) throw new SnapshotError('config', 'supabase-config missing url');
        cachedBase = cfg.url.replace(/\/$/, '');
    }
    return `${cachedBase}${SNAPSHOT_OBJECT_PATH}`;
}

function isSnapshot(v: unknown): v is ScheduleSnapshot {
    if (!v || typeof v !== 'object') return false;
    const o = v as Record<string, unknown>;
    return o.version === 1 && typeof o.generated_at === 'string' && !!o.channels
        && Array.isArray(o.live) && Array.isArray(o.upcoming) && Array.isArray(o.recent);
}

export async function fetchSnapshot(opts: ResolveOptions = {}): Promise<ScheduleSnapshot> {
    const url = await resolveSnapshotUrl(opts);
    const res = await fetchWithTimeout(url, opts.timeoutMs ?? SNAPSHOT_TIMEOUT_MS, opts.signal, opts.fetchFn);
    if (!res.ok) throw new SnapshotError('http', `snapshot HTTP ${res.status}`);
    const data: unknown = await res.json().catch(() => null);
    if (!isSnapshot(data)) throw new SnapshotError('format', 'unexpected snapshot format');
    return data;
}
