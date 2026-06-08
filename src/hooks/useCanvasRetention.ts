/**
 * Canvas 留存時間追蹤 Hook
 *
 * 精確計算使用者在 /canvas 頁面的活躍停留時間：
 * - 進入 canvas 時開始計時
 * - 頁面隱藏時暫停、顯示時恢復
 * - 離開 canvas 或頁面關閉時發送 canvas-session 事件
 */

import { useEffect, useRef, useCallback } from 'react';
import { useUIStore } from '../store/useUIStore';
import { useStreamStore } from '../store/useStreamStore';
import { trackEvent } from '../utils/umami';
import { isTrackingEnabled } from '../utils/analytics';

const MIN_SESSION_DURATION = 5; // 最少 5 秒才發送事件

export function useCanvasRetention() {
    const page = useUIStore(s => s.page);
    const streams = useStreamStore(s => s.streams);
    const touchLastActive = useStreamStore(s => s.touchLastActive);

    const startTimeRef = useRef<number>(0);
    const accumulatedRef = useRef<number>(0);
    const isActiveRef = useRef<boolean>(false);

    /**
     * 發送 canvas-session 事件
     */
    const sendSession = useCallback(() => {
        if (!isActiveRef.current && accumulatedRef.current === 0) return;

        // 加上目前活躍段的時間
        let totalMs = accumulatedRef.current;
        if (isActiveRef.current && startTimeRef.current > 0) {
            totalMs += Date.now() - startTimeRef.current;
        }

        const durationSec = Math.floor(totalMs / 1000);
        if (durationSec < MIN_SESSION_DURATION) return;

        trackEvent('canvas-session', {
            duration: durationSec,
            streams: streams.length,
        });

        // 重置
        accumulatedRef.current = 0;
        startTimeRef.current = Date.now();
    }, [streams.length]);

    // 進入/離開 canvas 時的追蹤
    useEffect(() => {
        if (page === 'canvas') {
            // 進入 canvas
            startTimeRef.current = Date.now();
            accumulatedRef.current = 0;
            isActiveRef.current = !document.hidden;
        }

        return () => {
            // 離開 canvas 時發送
            if (page === 'canvas' && isTrackingEnabled()) {
                sendSession();
            }
            isActiveRef.current = false;
        };
    }, [page, sendSession]);

    // 頁面可見性變化：暫停/恢復計時
    useEffect(() => {
        if (page !== 'canvas') return;

        const handleVisibility = () => {
            if (document.hidden) {
                // 暫停：累積目前活躍時間
                if (isActiveRef.current && startTimeRef.current > 0) {
                    accumulatedRef.current += Date.now() - startTimeRef.current;
                }
                isActiveRef.current = false;
            } else {
                // 恢復：重新開始計時
                startTimeRef.current = Date.now();
                isActiveRef.current = true;
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [page]);

    // 頁面關閉時發送
    useEffect(() => {
        if (page !== 'canvas') return;

        const handleUnload = () => {
            if (!isTrackingEnabled()) return;
            sendSession();
        };

        window.addEventListener('beforeunload', handleUnload);
        return () => window.removeEventListener('beforeunload', handleUnload);
    }, [page, sendSession]);

    // 短暫播放回復:canvas 頁有串流時,持續記錄「最後觀看活動時間」
    // (進入即記一次 + 每 30s + 切走/隱藏 + 關閉/重整),供啟動時判斷是否在 10 分鐘回復時限內
    useEffect(() => {
        if (page !== 'canvas' || streams.length === 0) return;
        touchLastActive();
        const id = window.setInterval(touchLastActive, 30_000);
        const onHide = () => { if (document.hidden) touchLastActive(); };
        const onUnload = () => touchLastActive();
        document.addEventListener('visibilitychange', onHide);
        window.addEventListener('beforeunload', onUnload);
        return () => {
            window.clearInterval(id);
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('beforeunload', onUnload);
        };
    }, [page, streams.length, touchLastActive]);
}

export default useCanvasRetention;
