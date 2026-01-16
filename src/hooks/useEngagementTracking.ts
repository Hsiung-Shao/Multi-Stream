/**
 * 使用者參與度追蹤 Hook
 * 
 * 功能：
 * 1. 使用 Page Visibility API 偵測頁面活躍狀態
 * 2. 計算總活躍時間
 * 3. 定期發送心跳事件（每 60 秒）
 * 4. 偵測閒置後返回
 */

import { useEffect, useRef, useCallback } from 'react';
import { logEvent, isTrackingEnabled } from '../utils/analytics';
import { userSegmentationManager } from '../utils/userSegmentation';

// ===== 常數定義 =====

const HEARTBEAT_INTERVAL = 60000; // 60 秒
const IDLE_THRESHOLD = 300000;    // 5 分鐘

// ===== Hook 實作 =====

export function useEngagementTracking() {
    const sessionStartRef = useRef<number>(Date.now());
    const lastInteractionRef = useRef<number>(Date.now());
    const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isActiveRef = useRef<boolean>(!document.hidden);

    /**
     * 處理頁面可見性變化
     */
    const handleVisibilityChange = useCallback(() => {
        if (!isTrackingEnabled()) return;

        if (document.hidden) {
            // 頁面隱藏
            const activeTime = Date.now() - sessionStartRef.current;
            isActiveRef.current = false;

            // 停止心跳
            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
                heartbeatIntervalRef.current = null;
            }

            // 發送暫停事件
            logEvent('Engagement', 'session_pause', 'visibility_hidden', Math.floor(activeTime / 1000));

        } else {
            // 頁面顯示
            sessionStartRef.current = Date.now();
            isActiveRef.current = true;

            // 發送恢復事件
            logEvent('Engagement', 'session_resume', 'visibility_visible');

            // 重新啟動心跳
            startHeartbeat();
        }
    }, []);

    /**
     * 發送心跳事件
     */
    const sendHeartbeat = useCallback(() => {
        if (!isTrackingEnabled() || !isActiveRef.current) return;

        const activeTime = Date.now() - sessionStartRef.current;
        logEvent('Engagement', 'heartbeat', 'active', Math.floor(activeTime / 1000));

        // 更新使用者分群的工作階段長度
        userSegmentationManager.updateSessionLength();
    }, []);

    /**
     * 啟動心跳計時器
     */
    const startHeartbeat = useCallback(() => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
        }

        heartbeatIntervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    }, [sendHeartbeat]);

    /**
     * 處理使用者互動（滑鼠、鍵盤、點擊）
     */
    const handleInteraction = useCallback(() => {
        if (!isTrackingEnabled()) return;

        const now = Date.now();
        const timeSinceLastInteraction = now - lastInteractionRef.current;

        // 如果超過閒置閾值，視為新的活躍期
        if (timeSinceLastInteraction > IDLE_THRESHOLD) {
            logEvent('Engagement', 'user_return', 'after_idle');
            sessionStartRef.current = now;
        }

        lastInteractionRef.current = now;
    }, []);

    // ===== Effect: 頁面可見性監聽 =====
    useEffect(() => {
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [handleVisibilityChange]);

    // ===== Effect: 心跳計時器 =====
    useEffect(() => {
        if (isTrackingEnabled() && isActiveRef.current) {
            startHeartbeat();
        }

        return () => {
            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
            }
        };
    }, [startHeartbeat]);

    // ===== Effect: 使用者互動監聽 =====
    useEffect(() => {
        // 使用節流（throttle）避免過度觸發
        let throttleTimeout: NodeJS.Timeout | null = null;

        const throttledInteraction = () => {
            if (throttleTimeout) return;

            throttleTimeout = setTimeout(() => {
                handleInteraction();
                throttleTimeout = null;
            }, 1000); // 1 秒節流
        };

        window.addEventListener('mousemove', throttledInteraction);
        window.addEventListener('keydown', throttledInteraction);
        window.addEventListener('click', throttledInteraction);

        return () => {
            window.removeEventListener('mousemove', throttledInteraction);
            window.removeEventListener('keydown', throttledInteraction);
            window.removeEventListener('click', throttledInteraction);

            if (throttleTimeout) {
                clearTimeout(throttleTimeout);
            }
        };
    }, [handleInteraction]);

    // ===== Effect: 頁面卸載時發送最終事件 =====
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (!isTrackingEnabled()) return;
            // 頁面卸載時，sendBeacon 會確保事件被發送
            // 注意：ReactGA.event 在頁面卸載時可能無法正常運作
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);
}

export default useEngagementTracking;
