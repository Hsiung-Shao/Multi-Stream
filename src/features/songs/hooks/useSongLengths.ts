/**
 * 時間軸匯入預覽用：向 /api/songs/lengths 查每首歌的長度（站內人工確認長度或 iTunes 原曲長度）。
 *
 * - 停止輸入 600 毫秒才查；新的輸入會中止進行中的請求。每次請求 15 秒逾時。
 * - 結果記在這個元件的記憶體（同一頁同一首歌不重複查）。伺服器回 pending（這次沒查）或請求失敗時，
 *   同一首歌最多再試到共 5 次，之後就不查了（避免配額用完時無限重試）。
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
const ITEMS_MAX = 60;

const keyOf = (q: SongLengthQuery) => `${q.title.trim().toLowerCase()}\u0001${(q.artist ?? '').trim().toLowerCase()}`;

interface LengthsResponse {
    ok?: boolean;
    items?: { seconds?: unknown; source?: unknown }[];
}

export function useSongLengths(queries: SongLengthQuery[]): {
    /** 歌曲長度（秒）；還沒查到或查無為 undefined */
    lengthOf: (q: SongLengthQuery) => number | undefined;
    loading: boolean;
} {
    // key → 秒數（null＝確定查無）；沒有 key＝還沒有結果
    const cache = useRef(new Map<string, number | null>());
    // key → 已嘗試次數（pending 或失敗才會累加）
    const attempts = useRef(new Map<string, number>());
    // 每次有新結果或要重試就加一：讓 lengthOf 換身分（呼叫端 useMemo 重算）、讓 effect 重跑
    const [version, setVersion] = useState(0);
    const [loading, setLoading] = useState(false);

    // 要查的歌：還沒有結果、沒試滿 5 次；去重、最多 60 首。用字串當 effect 依賴，內容沒變就不重查
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

        const bump = (q: SongLengthQuery) => attempts.current.set(keyOf(q), (attempts.current.get(keyOf(q)) ?? 0) + 1);

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
                    items.forEach(bump);
                } else {
                    json.items.forEach((r, i) => {
                        if (r?.source === 'pending') bump(items[i]);
                        else cache.current.set(keyOf(items[i]), typeof r?.seconds === 'number' && r.seconds > 0 ? r.seconds : null);
                    });
                }
            } catch {
                if (cancelled) return;
                items.forEach(bump);
            } finally {
                if (timeout) clearTimeout(timeout);
                if (!cancelled) {
                    setLoading(false);
                    setVersion((v) => v + 1);
                }
            }
        }, DEBOUNCE_MS);

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
