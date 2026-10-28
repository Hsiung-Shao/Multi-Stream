/**
 * 時間軸匯入預覽用：向 /api/songs/lengths 查每首歌的長度（站內人工確認長度或 iTunes 原曲長度）。
 *
 * - 停止輸入 600 毫秒才查；新的輸入會中止進行中的請求。每次請求 15 秒逾時。
 * - 結果記在這個元件的記憶體（同一頁同一首歌不重複查）。
 * - 伺服器每個請求最多查 8 首，沒輪到的回 pending（不帶 retryAfter）：不算失敗，debounce 後接著送下一批，直到全部查完。
 * - 暫時失敗（回應帶 retryAfter、網路錯誤、逾時、非 2xx、回應格式不對、或 pending 一首都沒查到又沒 retryAfter）
 *   才累加該歌的失敗次數，下一輪延遲指數退避 2、4、8、16 秒；累計 5 次就不再查。
 *   retryAfter 超過 30 秒（例如全站配額用完）本頁不再重試；30 秒內的取退避與 retryAfter 較大者。
 * - 失敗一律安靜：查不到就照舊估計，不擋使用者（長度只是讓估計更準的輔助）。
 * - 只在 effect 裡碰 fetch／timer，預渲染安全。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface SongLengthQuery {
    title: string;
    artist: string | null;
}

const DEBOUNCE_MS = 600;
const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 2_000;
const RETRY_AFTER_GIVE_UP_S = 30;
const ITEMS_MAX = 60;

const keyOf = (q: SongLengthQuery) => `${q.title.trim().toLowerCase()}\u0001${(q.artist ?? '').trim().toLowerCase()}`;

interface LengthsResponse {
    ok?: boolean;
    items?: { seconds?: unknown; source?: unknown }[];
    retryAfter?: unknown;
}

export function useSongLengths(queries: SongLengthQuery[]): {
    /** 歌曲長度（秒）；還沒查到或查無為 undefined */
    lengthOf: (q: SongLengthQuery) => number | undefined;
    loading: boolean;
} {
    // key → 秒數（null＝確定查無）；沒有 key＝還沒有結果
    const cache = useRef(new Map<string, number | null>());
    // key → 暫時失敗次數（沒輪到的 pending 不算）
    const attempts = useRef(new Map<string, number>());
    // 下一輪最早可以送的時間（ms 時間戳）；0＝沒有限制
    const notBefore = useRef(0);
    // 每次有新結果或要重試就加一：讓 lengthOf 換身分（呼叫端 useMemo 重算）、讓 effect 重跑
    const [version, setVersion] = useState(0);
    const [loading, setLoading] = useState(false);

    // 要查的歌：還沒有結果、沒失敗滿 5 次；去重、最多 60 首。用字串當 effect 依賴，內容沒變就不重查
    const seen = new Set<string>();
    const list: SongLengthQuery[] = [];
    for (const q of queries) {
        const k = keyOf(q);
        if (!q.title.trim() || seen.has(k) || cache.current.has(k) || (attempts.current.get(k) ?? 0) >= MAX_ATTEMPTS) continue;
        seen.add(k);
        list.push({ title: q.title.trim(), artist: q.artist?.trim() || null });
        if (list.length >= ITEMS_MAX) break;
    }
    const todo = JSON.stringify(list);

    useEffect(() => {
        const items = JSON.parse(todo) as SongLengthQuery[];
        if (items.length === 0) return;

        let cancelled = false;
        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout> | null = null;

        /** 暫時失敗：累加次數、排下一輪的最早時間。retryAfterS 超過 30 秒＝本頁放棄這批 */
        const fail = (batch: SongLengthQuery[], retryAfterS = 0) => {
            let worst = 0;
            for (const q of batch) {
                const k = keyOf(q);
                const n = retryAfterS > RETRY_AFTER_GIVE_UP_S ? MAX_ATTEMPTS : (attempts.current.get(k) ?? 0) + 1;
                attempts.current.set(k, n);
                worst = Math.max(worst, n);
            }
            const backoff = BACKOFF_BASE_MS * 2 ** Math.max(0, worst - 1);
            notBefore.current = Date.now() + Math.max(backoff, retryAfterS * 1000);
        };

        const delay = Math.max(DEBOUNCE_MS, notBefore.current - Date.now());
        const timer = setTimeout(async () => {
            setLoading(true);
            timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
            try {
                const res = await fetch('/api/songs/lengths', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items }),
                    signal: controller.signal,
                });
                const json = (res.ok ? await res.json() : null) as LengthsResponse | null;
                if (cancelled) return;
                if (!json?.ok || !Array.isArray(json.items) || json.items.length !== items.length) {
                    fail(items);
                } else {
                    const retryAfterS = typeof json.retryAfter === 'number' && json.retryAfter > 0 ? json.retryAfter : 0;
                    const pending: SongLengthQuery[] = [];
                    let progressed = false;
                    json.items.forEach((r, i) => {
                        if (r?.source === 'pending') {
                            pending.push(items[i]);
                        } else {
                            progressed = true;
                            cache.current.set(keyOf(items[i]), typeof r?.seconds === 'number' && r.seconds > 0 ? r.seconds : null);
                        }
                    });
                    if (pending.length > 0 && (retryAfterS > 0 || !progressed)) fail(pending, retryAfterS);
                    else notBefore.current = 0;
                }
            } catch {
                if (cancelled) return;
                fail(items);
            } finally {
                if (timeout) clearTimeout(timeout);
                if (!cancelled) {
                    setLoading(false);
                    setVersion((v) => v + 1);
                }
            }
        }, delay);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            if (timeout) clearTimeout(timeout);
            controller.abort();
            setLoading(false);
        };
    }, [todo, version]);

    // version 變動才換身分，呼叫端才會依新結果重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const lengthOf = useCallback((q: SongLengthQuery) => cache.current.get(keyOf(q)) ?? undefined, [version]);
    return { lengthOf, loading };
}
