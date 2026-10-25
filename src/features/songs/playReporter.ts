/**
 * 播放次數回報器：把「聽夠久」的片段 code 累積起來，定時批次送出（實際送出由呼叫端以 sendBeacon 注入）。
 *
 * - record(code)：30 分鐘內記過的 code 直接忽略（seen 存在 storage 的 'song-play-seen'，重新整理後仍有效）；
 *   否則加入待送清單並寫入 seen。
 * - flush()：待送清單非空才呼叫 send，每批最多 PLAY_BATCH_MAX（20）個、可多批，送完清空。
 *   SongsPage 每 60 秒與 pagehide 時呼叫。
 * - storage 讀寫失敗（隱私模式、容量滿、內容損毀）一律吞掉不拋錯；每次寫入前順便清掉超過視窗的舊項，避免無限長大。
 */
import { DEDUPE_WINDOW_MS } from './lib/playCredit';

export const SEEN_STORAGE_KEY = 'song-play-seen';
/** 與伺服端 SONG_PLAYS_MAX 一致 */
export const PLAY_BATCH_MAX = 20;

export interface PlayReporterDeps {
    send: (codes: string[]) => void;
    now: () => number;
    storage: Pick<Storage, 'getItem' | 'setItem'>;
}

type SeenMap = Record<string, number>;

function readSeen(storage: PlayReporterDeps['storage'], now: number): SeenMap {
    const seen: SeenMap = {};
    try {
        const raw = storage.getItem(SEEN_STORAGE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            for (const [code, at] of Object.entries(parsed)) {
                // 只留視窗內且時間合法的項目（順便清掉舊項）
                if (typeof at === 'number' && Number.isFinite(at) && now - at < DEDUPE_WINDOW_MS) seen[code] = at;
            }
        }
    } catch {
        // 讀取或解析失敗：當作沒看過
    }
    return seen;
}

export function createPlayReporter(deps: PlayReporterDeps) {
    const pending: string[] = [];

    return {
        record(code: string): void {
            const now = deps.now();
            const seen = readSeen(deps.storage, now);
            if (code in seen || pending.includes(code)) return;
            pending.push(code);
            seen[code] = now;
            try {
                deps.storage.setItem(SEEN_STORAGE_KEY, JSON.stringify(seen));
            } catch {
                // 寫入失敗：本次仍會送出，只是重新整理後無法去重
            }
        },

        flush(): void {
            while (pending.length > 0) {
                deps.send(pending.splice(0, PLAY_BATCH_MAX));
            }
        },
    };
}
