/**
 * 直播觀看 Heartbeat Hook
 *
 * Spec 要求：
 * - 每 60 秒送一個 stream_heartbeat，帶 stream_count / platforms / total_watch_seconds / is_active
 * - Page Visibility API：背景時暫停計時器、不送事件；回前景恢復
 * - visibility 切換時送 session_pause / session_resume
 * - pagehide 時送 session_end，帶 total_watch_seconds + max_concurrent_streams
 * - Heartbeat 計時器單例（同時間只一個）
 * - 頁面重整時從 sessionStorage 恢復累計觀看秒數
 *
 * 取代了原本的 useEngagementTracking（事件命名、業務參數對齊 spec）
 */

import { useEffect, useRef } from 'react';
import { useStreamStore } from '../store/useStreamStore';
import {
    sendStreamHeartbeat,
    sendSessionPause,
    sendSessionResume,
    sendSessionEnd,
    getStoredWatchSeconds,
    setStoredWatchSeconds,
    getStoredMaxStreams,
    setStoredMaxStreams,
    track,
} from '../utils/analytics';
import { userSegmentationManager } from '../utils/userSegmentation';

const HEARTBEAT_INTERVAL_MS = 60_000;
const MAX_TICK_DRIFT_S = Math.ceil(HEARTBEAT_INTERVAL_MS / 1000) + 5;
const MILESTONES_MINUTES = [5, 15, 30, 60];

/**
 * 從 useStreamStore 抓取目前直播狀態快照（非 reactive，timer 回呼用）
 */
function getStreamSnapshot() {
    const streams = useStreamStore.getState().streams;
    const platformSet = new Set<string>();
    for (const s of streams) {
        if (s.platform) platformSet.add(s.platform);
    }
    const platforms = Array.from(platformSet).sort().join(',');
    return { count: streams.length, platforms };
}

export function useStreamHeartbeat(): void {
    const intervalRef = useRef<number | null>(null);
    const totalWatchSecondsRef = useRef<number>(getStoredWatchSeconds());
    const maxStreamsRef = useRef<number>(getStoredMaxStreams());
    const lastTickAtRef = useRef<number>(Date.now());
    const isVisibleRef = useRef<boolean>(!document.hidden);
    const milestonesSent = useRef<Set<number>>(new Set());

    // 從之前累計的觀看秒數，標記已達成的 milestone（避免 reload 後重複送）
    useEffect(() => {
        const minutes = totalWatchSecondsRef.current / 60;
        for (const m of MILESTONES_MINUTES) {
            if (minutes >= m) milestonesSent.current.add(m);
        }
    }, []);

    useEffect(() => {
        const accumulateElapsed = () => {
            const now = Date.now();
            // 限制單次累計上限，避免長時間休眠後一次塞太多秒
            const elapsed = Math.min(
                Math.floor((now - lastTickAtRef.current) / 1000),
                MAX_TICK_DRIFT_S
            );
            lastTickAtRef.current = now;
            if (elapsed > 0) {
                totalWatchSecondsRef.current += elapsed;
                setStoredWatchSeconds(totalWatchSecondsRef.current);
            }
        };

        const updateMaxStreams = (count: number) => {
            if (count > maxStreamsRef.current) {
                maxStreamsRef.current = count;
                setStoredMaxStreams(count);
            }
        };

        const checkMilestones = () => {
            const minutes = Math.floor(totalWatchSecondsRef.current / 60);
            for (const m of MILESTONES_MINUTES) {
                if (minutes >= m && !milestonesSent.current.has(m)) {
                    milestonesSent.current.add(m);
                    track.streamMilestone(m);
                }
            }
        };

        const tick = () => {
            accumulateElapsed();
            const snapshot = getStreamSnapshot();
            updateMaxStreams(snapshot.count);
            sendStreamHeartbeat({
                streamCount: snapshot.count,
                platforms: snapshot.platforms,
                totalWatchSeconds: totalWatchSecondsRef.current,
                isActive: isVisibleRef.current,
            });
            checkMilestones();
            // 隨觀看時間更新 session_length 分群維度(spec:應在 heartbeat 中呼叫)
            userSegmentationManager.updateSessionLength();
        };

        const startTimer = () => {
            if (intervalRef.current !== null) return; // 單例
            lastTickAtRef.current = Date.now();
            intervalRef.current = window.setInterval(tick, HEARTBEAT_INTERVAL_MS);
        };

        const stopTimer = () => {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };

        const onVisibility = () => {
            if (document.hidden) {
                accumulateElapsed();
                isVisibleRef.current = false;
                stopTimer();
                sendSessionPause(totalWatchSecondsRef.current);
            } else {
                isVisibleRef.current = true;
                lastTickAtRef.current = Date.now();
                sendSessionResume();
                startTimer();
            }
        };

        const onEnd = () => {
            // pagehide 在 background 時若尚有未計入時間，補進去
            if (isVisibleRef.current) accumulateElapsed();
            const snapshot = getStreamSnapshot();
            updateMaxStreams(snapshot.count);
            sendSessionEnd(totalWatchSecondsRef.current, maxStreamsRef.current);
        };

        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', onEnd);

        // 初次掛載：若可見則啟動 timer
        if (!document.hidden) startTimer();

        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pagehide', onEnd);
            stopTimer();
        };
    }, []);
}

export default useStreamHeartbeat;
