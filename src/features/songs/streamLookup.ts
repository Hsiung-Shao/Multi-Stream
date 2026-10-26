/**
 * 歌回相關的公開資料查詢（anon PostgREST，沿用週表的 restClient；不載 supabase-js）＋ YouTube oEmbed。
 *
 * 後台編輯器與社群投稿頁共用：VTuber 搜尋／取名、用影片 ID 找週表裡的同一場直播、影片標題。
 * client fetch 一律有逾時（restClient 預設 10 秒；oEmbed 15 秒）。
 */
import { useQuery } from '@tanstack/react-query';
import { resolveRestConfig, restGet } from '../schedule/restClient';

// ---------- VTuber 查詢（vtubers 公開可讀；沿用週表的 anon PostgREST 連線，不載 supabase-js） ----------

export interface VtuberOption {
    id: string;
    name: string;
    img_url: string | null;
}

const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const VTUBER_COLS = 'id,name,img_url';

/** 依名稱模糊搜尋（PostgREST 的萬用字元與分隔符先拿掉，避免使用者輸入改到查詢語法） */
export async function searchVtubers(query: string, signal?: AbortSignal): Promise<VtuberOption[]> {
    const q = query.replace(/[*%,()"\\]/g, ' ').trim();
    if (!q) return [];
    const cfg = await resolveRestConfig({ signal });
    return restGet<VtuberOption[]>(cfg, `vtubers?select=${VTUBER_COLS}&name=ilike.*${encodeURIComponent(q)}*&order=name.asc&limit=8`, { signal });
}

/** 依 id 批次取名稱（列表與編輯器顯示用）；不合法的 id 略過 */
export async function fetchVtubersByIds(ids: string[], signal?: AbortSignal): Promise<VtuberOption[]> {
    const valid = [...new Set(ids.filter((id) => UUID_RE.test(id)))];
    if (valid.length === 0) return [];
    const cfg = await resolveRestConfig({ signal });
    return restGet<VtuberOption[]>(cfg, `vtubers?select=${VTUBER_COLS}&id=in.(${valid.join(',')})`, { signal });
}

export function useVtuberNames(ids: string[]) {
    const key = [...new Set(ids)].sort();
    return useQuery({
        queryKey: ['song-vtuber-names', key],
        enabled: key.length > 0,
        queryFn: async ({ signal }) => {
            const rows = await fetchVtubersByIds(key, signal);
            return new Map(rows.map((r) => [r.id, r]));
        },
        staleTime: 5 * 60_000,
        retry: 1,
    });
}

// ---------- 週表場次帶入（新增歌回時，用影片 ID 找週表裡的同一場，補 VTuber／標題／開台時間） ----------

export interface StreamPrefill {
    title: string | null;
    vtuberId: string | null;
    streamedAt: string | null;
}

interface StreamRow {
    vtuber_id: string | null;
    title: string | null;
    actual_start: string | null;
    scheduled_start: string | null;
}

/** 週表 streams 公開可讀；找不到回 null。開台時間取實際開台，沒有就用預定時間 */
export async function fetchStreamByVideoId(videoId: string, signal?: AbortSignal): Promise<StreamPrefill | null> {
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
    const cfg = await resolveRestConfig({ signal });
    const rows = await restGet<StreamRow[]>(
        cfg,
        `streams?select=vtuber_id,title,actual_start,scheduled_start&platform=eq.youtube&external_id=eq.${encodeURIComponent(videoId)}&limit=1`,
        { signal },
    );
    const row = rows[0];
    if (!row) return null;
    return {
        title: row.title || null,
        vtuberId: row.vtuber_id || null,
        streamedAt: row.actual_start ?? row.scheduled_start ?? null,
    };
}

// ---------- YouTube oEmbed（影片標題；不需要 API key） ----------

export const OEMBED_TIMEOUT_MS = 15_000;

/** 取影片標題；找不到、私人影片或逾時回 null（呼叫端改讓使用者手填） */
export async function fetchOEmbedTitle(videoId: string, signal?: AbortSignal, fetchFn: typeof fetch = fetch): Promise<string | null> {
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OEMBED_TIMEOUT_MS);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort);
    try {
        const target = `https://www.youtube.com/watch?v=${videoId}`;
        const res = await fetchFn(`https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`, { signal: ctrl.signal, credentials: 'omit' });
        if (!res.ok) return null;
        const data = (await res.json().catch(() => null)) as { title?: unknown } | null;
        return typeof data?.title === 'string' && data.title.trim() ? data.title.trim().slice(0, 200) : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}
