// 嵌入小工具的「誰在用」彙總（embed_usage：anon 只讀得到 sites 數量，讀不到宿主站清單）。
// 讀不到（網路錯、格式錯）一律回 null：顯示端把 null 當「沒有統計」，不擋住產生器。
import { resolveRestConfig, restGet, type RestOptions } from './restClient';

export interface EmbedUsage {
    sites: number;
    lastSeen: string | null;
}

export async function fetchEmbedUsage(kind: 'person' | 'group', slug: string, opts: RestOptions = {}): Promise<EmbedUsage | null> {
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(slug)) return null;
    try {
        const cfg = await resolveRestConfig(opts);
        const rows = await restGet<Array<{ sites?: unknown; last_seen?: unknown }>>(cfg, `embed_usage?select=sites,last_seen&kind=eq.${kind}&slug=eq.${encodeURIComponent(slug.toLowerCase())}&limit=1`, opts);
        const row = rows[0];
        if (!row) return { sites: 0, lastSeen: null };
        const sites = Number(row.sites);
        return { sites: Number.isFinite(sites) ? sites : 0, lastSeen: typeof row.last_seen === 'string' ? row.last_seen : null };
    } catch {
        return null;
    }
}

/** 全站總數：有幾個網站、嵌了幾份週表（教學文用） */
export async function fetchEmbedUsageTotal(opts: RestOptions = {}): Promise<{ sites: number; schedules: number } | null> {
    try {
        const cfg = await resolveRestConfig(opts);
        const rows = await restGet<Array<{ sites?: unknown }>>(cfg, 'embed_usage?select=sites&limit=1000', opts);
        let sites = 0;
        for (const r of rows) sites += Number(r.sites) || 0;
        return { sites, schedules: rows.length };
    } catch {
        return null;
    }
}

export const EMBED_BANNER_DISMISSED_KEY = 'embed_banner_dismissed';
