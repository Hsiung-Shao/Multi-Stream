/**
 * Canvas 最後活動時間記錄 Hook
 *
 * canvas 頁有串流時持續記錄「最後觀看活動時間」
 * （進入即記一次 + 每 30s + 切走/隱藏 + 關閉/重整），
 * 供啟動時判斷是否在 10 分鐘「短暫播放回復」時限內（App.tsx）。
 */

import { useEffect } from 'react';
import { useUIStore } from '../store/useUIStore';
import { useStreamStore } from '../store/useStreamStore';

export function useCanvasRetention() {
    const page = useUIStore(s => s.page);
    const streams = useStreamStore(s => s.streams);
    const touchLastActive = useStreamStore(s => s.touchLastActive);

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
