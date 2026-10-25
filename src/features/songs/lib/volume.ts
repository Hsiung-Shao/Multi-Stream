/**
 * 歌曲播放器的音量／靜音偏好：存在 localStorage['song-player-volume']（已列入 versionCheck 的 PRESERVED_KEYS）。
 *
 * - 純函式、零 DOM；讀寫 localStorage 由呼叫端處理（useSegmentPlayer）。
 * - 資料可能被改壞：null、壞 JSON、非物件 → 預設 { 100, false }；volume 非有限數 → 100；
 *   volume 夾在 0..100 並四捨五入；muted 不是 boolean → false。
 */
export const VOLUME_STORAGE_KEY = 'song-player-volume';
export const DEFAULT_VOLUME = 100;

export interface VolumeState {
    volume: number;
    muted: boolean;
}

/** 夾在 0..100 的整數；非有限數回 DEFAULT_VOLUME */
export function clampVolume(v: number): number {
    if (!Number.isFinite(v)) return DEFAULT_VOLUME;
    return Math.min(100, Math.max(0, Math.round(v)));
}

export function parseStoredVolume(raw: string | null): VolumeState {
    const fallback: VolumeState = { volume: DEFAULT_VOLUME, muted: false };
    if (raw === null) return fallback;
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch {
        return fallback;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fallback;
    const { volume, muted } = data as { volume?: unknown; muted?: unknown };
    return {
        volume: typeof volume === 'number' ? clampVolume(volume) : DEFAULT_VOLUME,
        muted: typeof muted === 'boolean' ? muted : false,
    };
}

export function serializeVolume(s: VolumeState): string {
    return JSON.stringify({ volume: clampVolume(s.volume), muted: s.muted === true });
}
