/**
 * 播放次數回報：聽滿門檻 → reporter.record（30 分鐘內同首不重複）→ 每 60 秒與關頁時批次送出。
 * reporter 在 mount 後才建立（render 本體不碰 window／localStorage，預渲染安全）。
 * 回傳穩定的 onPlayCredited，直接交給 useSegmentPlayer。
 */
import { useCallback, useEffect, useRef } from 'react';
import { createPlayReporter } from '../playReporter';

const PLAYS_ENDPOINT = '/api/songs/plays';
/** 播放次數批次回報間隔（另在 pagehide 時送出） */
const PLAYS_FLUSH_MS = 60_000;

/** 送出播放次數：優先 sendBeacon（關頁也送得出去），不支援或被拒時退回 fetch keepalive */
function sendPlays(codes: string[]): void {
    const body = JSON.stringify({ codes });
    try {
        if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(PLAYS_ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
    } catch { /* 改走 fetch */ }
    void fetch(PLAYS_ENDPOINT, { method: 'POST', body, keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } })
        .catch(() => { /* 計次失敗不影響播放 */ });
}

/** localStorage 包一層：隱私模式或配額滿時不丟例外 */
const safeStorage: Pick<Storage, 'getItem' | 'setItem'> = {
    getItem: (key) => {
        try { return window.localStorage.getItem(key); } catch { return null; }
    },
    setItem: (key, value) => {
        try { window.localStorage.setItem(key, value); } catch { /* 放棄持久化 */ }
    },
};

export function usePlayReporter(): (code: string) => void {
    const reporterRef = useRef<ReturnType<typeof createPlayReporter> | null>(null);
    useEffect(() => {
        const reporter = createPlayReporter({ send: sendPlays, now: () => Date.now(), storage: safeStorage });
        reporterRef.current = reporter;
        const flush = () => reporter.flush();
        const timer = setInterval(flush, PLAYS_FLUSH_MS);
        window.addEventListener('pagehide', flush);
        return () => {
            clearInterval(timer);
            window.removeEventListener('pagehide', flush);
            flush();
            reporterRef.current = null;
        };
    }, []);
    return useCallback((code: string) => reporterRef.current?.record(code), []);
}
