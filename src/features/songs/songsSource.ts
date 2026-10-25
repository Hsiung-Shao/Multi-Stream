/**
 * 歌曲目錄來源：GET /api/songs/catalog（edge 快取 10 分鐘）→ 前端型別。
 *
 * - 回應是 RPC get_song_catalog 的短 key 結構：[{ v, t, d, vt:{i,n,img}|null, s:[[code,start,end,title,artist|null,plays]] }]。
 *   plays（v1.1 第 6 欄）缺欄或不是非負數一律當 0，舊快取格式也能讀。
 * - 轉換時逐筆防呆：格式不對的影片或片段直接丟棄，不讓一筆壞資料拖垮整個目錄。
 * - client fetch 一律 15 秒逾時（memory error_client_fetch_needs_timeout），並跟 TanStack Query 的取消訊號連動。
 * - SSR（entry-server）的 QueryClient 是 enabled:false，預渲染只會輸出載入中的殼層。
 */
import { useQuery } from '@tanstack/react-query';
import type { QueueItem } from './lib/queue';

export interface SongVtuber {
    id: string;
    name: string;
    img: string | null;
}

export interface SongSegment {
    code: string;
    videoId: string;
    start: number;
    end: number;
    title: string;
    artist: string | null;
    /** 累計播放次數（聽滿門檻才算一次） */
    plays: number;
}

export interface SongVideo {
    videoId: string;
    title: string;
    streamedAt: string | null;
    vtuber: SongVtuber | null;
    segments: SongSegment[];
}

export interface SongEntry {
    segment: SongSegment;
    video: SongVideo;
}

export interface SongCatalog {
    videos: SongVideo[];
    /** code → 片段與所屬影片 */
    byCode: Map<string, SongEntry>;
}

export const CATALOG_URL = '/api/songs/catalog';
export const CATALOG_TIMEOUT_MS = 15_000;

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const CODE_RE = /^[0-9a-z]{8}$/;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isSec = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function toVtuber(raw: unknown): SongVtuber | null {
    if (!isObj(raw) || typeof raw.n !== 'string' || !raw.n) return null;
    return {
        id: typeof raw.i === 'string' ? raw.i : '',
        name: raw.n,
        img: typeof raw.img === 'string' && raw.img ? raw.img : null,
    };
}

function toSegment(raw: unknown, videoId: string): SongSegment | null {
    if (!Array.isArray(raw)) return null;
    const [code, start, end, title, artist, plays] = raw as unknown[];
    if (typeof code !== 'string' || !CODE_RE.test(code)) return null;
    if (!isSec(start) || !isSec(end) || end <= start) return null;
    if (typeof title !== 'string' || !title.trim()) return null;
    return {
        code,
        videoId,
        start,
        end,
        title,
        artist: typeof artist === 'string' && artist.trim() ? artist : null,
        plays: isSec(plays) ? Math.floor(plays) : 0,
    };
}

/** 目錄原始 JSON → 前端型別；不是陣列時回 []（呼叫端視為格式錯誤自行處理） */
export function parseSongCatalog(raw: unknown): SongVideo[] {
    if (!Array.isArray(raw)) return [];
    const videos: SongVideo[] = [];
    for (const item of raw) {
        if (!isObj(item) || typeof item.v !== 'string' || !VIDEO_ID_RE.test(item.v)) continue;
        const videoId = item.v;
        const segments = Array.isArray(item.s)
            ? item.s.map((s) => toSegment(s, videoId)).filter((s): s is SongSegment => s !== null)
            : [];
        videos.push({
            videoId,
            title: typeof item.t === 'string' ? item.t : '',
            streamedAt: typeof item.d === 'string' && item.d ? item.d : null,
            vtuber: toVtuber(item.vt),
            segments,
        });
    }
    return videos;
}

/** 建 code → 片段查表（code 全站唯一；重複時保留第一筆） */
export function buildCodeIndex(videos: SongVideo[]): Map<string, SongEntry> {
    const map = new Map<string, SongEntry>();
    for (const video of videos) {
        for (const segment of video.segments) {
            if (!map.has(segment.code)) map.set(segment.code, { segment, video });
        }
    }
    return map;
}

/** 依 code 清單取出片段（保序）；找不到的 code 計入 missing */
export function resolveCodes(index: Map<string, SongEntry>, codes: string[]): { found: SongEntry[]; missing: number } {
    const found: SongEntry[] = [];
    let missing = 0;
    for (const code of codes) {
        const hit = index.get(code);
        if (hit) found.push(hit);
        else missing++;
    }
    return { found, missing };
}

export function toQueueItem(segment: SongSegment): QueueItem {
    return { code: segment.code, videoId: segment.videoId, start: segment.start, end: segment.end };
}

export async function fetchSongCatalog(signal?: AbortSignal, fetchFn: typeof fetch = fetch): Promise<SongCatalog> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CATALOG_TIMEOUT_MS);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort);
    try {
        const res = await fetchFn(CATALOG_URL, { credentials: 'same-origin', signal: ctrl.signal });
        if (!res.ok) throw new Error(`catalog ${res.status}`);
        const raw: unknown = await res.json();
        if (!Array.isArray(raw)) throw new Error('catalog bad payload');
        const videos = parseSongCatalog(raw);
        return { videos, byCode: buildCodeIndex(videos) };
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}

/** 目錄 5 分鐘內視為新鮮（edge 快取 10 分鐘，再常抓也是同一份） */
export function useSongCatalog() {
    return useQuery({
        queryKey: ['song-catalog', 'v1'],
        queryFn: ({ signal }) => fetchSongCatalog(signal),
        staleTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}
