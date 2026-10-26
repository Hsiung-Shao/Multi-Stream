// 編輯用的 YouTube 嵌入播放器（後台歌回編輯器、社群投稿頁共用）：給「設為目前時間」「從這裡播」用。
//
// - 只依 videoId 建立；卸載時下一個 tick 才 destroy（同 useSegmentPlayer）。呼叫端負責「看不見時不要掛載」
//   （後台分頁 forceMount，隱藏的播放器繼續播違反 YouTube 嵌入政策）。
// - 最小 200×200（YouTube 嵌入政策），外框 1px 邊框另外算，所以最小高度寫 202；容器內只有播放器，不疊任何元素。

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ensureYT, type YTPlayerLike } from '../hooks/useSegmentPlayer';

export interface PreviewApi {
    getCurrentTime(): number;
    seekTo(sec: number): void;
}

export function PreviewPlayer({ videoId, onApi, onDuration }: {
    videoId: string;
    onApi: (api: PreviewApi | null) => void;
    onDuration: (sec: number) => void;
}) {
    const { t } = useTranslation('songs');
    const containerRef = useRef<HTMLDivElement>(null);
    const [failed, setFailed] = useState(false);
    // callback 用 ref 取最新值：播放器只依 videoId 重建
    const cbRef = useRef({ onApi, onDuration });
    useEffect(() => { cbRef.current = { onApi, onDuration }; }, [onApi, onDuration]);

    useEffect(() => {
        let cancelled = false;
        let player: YTPlayerLike | null = null;
        const container = containerRef.current;
        setFailed(false);
        void (async () => {
            if (!container) return;
            try {
                const YT = await ensureYT();
                if (cancelled) return;
                container.innerHTML = '';
                const target = document.createElement('div');
                target.style.width = '100%';
                target.style.height = '100%';
                container.appendChild(target);
                player = new YT.Player(target, {
                    width: '100%',
                    height: '100%',
                    videoId,
                    playerVars: { autoplay: 0, rel: 0, playsinline: 1, modestbranding: 1, enablejsapi: 1, origin: window.location.origin },
                    events: {
                        onReady: (e) => {
                            if (cancelled) return;
                            player = e.target;
                            const p = e.target;
                            cbRef.current.onApi({
                                getCurrentTime: () => { try { return p.getCurrentTime(); } catch { return 0; } },
                                seekTo: (sec) => { try { p.seekTo(sec, true); p.playVideo(); } catch { /* 已銷毀 */ } },
                            });
                            try {
                                const d = p.getDuration();
                                if (d > 0) cbRef.current.onDuration(d);
                            } catch { /* 直播中或尚未取得 */ }
                        },
                        onStateChange: (e) => {
                            // 部分影片 onReady 時還拿不到長度，開始播放後再補一次
                            if (cancelled || e.data !== 1) return;
                            try {
                                const d = e.target.getDuration();
                                if (d > 0) cbRef.current.onDuration(d);
                            } catch { /* ignore */ }
                        },
                        onError: () => { if (!cancelled) setFailed(true); },
                    },
                });
            } catch {
                if (!cancelled) setFailed(true);
            }
        })();
        return () => {
            cancelled = true;
            cbRef.current.onApi(null);
            const p = player;
            player = null;
            if (p) setTimeout(() => { try { p.destroy(); } catch { /* 已銷毀 */ } }, 0);
            if (container) container.innerHTML = '';
        };
    }, [videoId]);

    return (
        <div>
            <div className="relative aspect-video min-h-[202px] w-full min-w-[202px] overflow-hidden rounded-lg border border-border bg-black">
                <div ref={containerRef} className="absolute inset-0" />
            </div>
            {failed && <p role="alert" className="mt-1.5 text-[12px] text-destructive">{t('editor.playerFailed')}</p>}
        </div>
    );
}
