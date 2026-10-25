/**
 * 歌曲片段播放器：YouTube IFrame Player ＋ 佇列狀態機（lib/queue.ts）。
 *
 * 播放規則（計畫「播放引擎規則」）：
 * - 建立播放器時不自動播；第一首由使用者按播放。瀏覽器擋自動播放（onAutoplayBlocked）時 needsGesture=true，
 *   畫面要在播放器「外面」顯示「點此播放」（播放器本體不能被任何元素覆蓋）。
 * - 換影片 loadVideoById({videoId,startSeconds})；同一支影片的下一首只 seekTo（planLoad）。
 * - 刻意不帶 endSeconds：seek 之後舊的 endSeconds 仍會觸發 ENDED，造成每首都重新緩衝閃一下（實測）。
 *   片段結束一律靠 PLAYING 時每 250ms 輪詢 shouldAdvance；ENDED 只會在整支影片播完時發生，直接推進。
 *   兩條路以「code＋playToken」防重複觸發；換首後要先看到 currentTime < end 才「上膛」，避免讀到舊時間連跳。
 * - onError 100/101/150/2/5：顯示「即將跳過」，1.5 秒後 dispatch error（整支影片標為不可播）。
 *   期間使用者自己換首就作廢，不能把新的那首誤標。
 * - 上一首帶 elapsed = currentTime - start（播超過 3 秒回本首開頭，交給 reducer 判斷）。
 * - 卸載：停輪詢、清計時器、下一個 tick 才 destroy（同 StreamIframe 的 safeDestroy，避開 React render 期衝突）。
 *
 * 只在瀏覽器 effect 內碰 window / YT：預渲染（SSR）時這個 hook 只回傳初始狀態。
 */
import { useCallback, useEffect, useReducer, useRef, useState, type RefObject } from 'react';
import { apiLoader } from '../../../utils/apiLoader';
import { createQueue, currentItem, queueReducer, type QueueAction, type QueueItem, type QueueState, type RepeatMode } from '../lib/queue';
import { planLoad, shouldAdvance, END_EPSILON } from '../lib/advance';

// ---------- YouTube IFrame API 最小型別（只宣告用到的部分） ----------

export interface YTPlayerLike {
    loadVideoById(opts: { videoId: string; startSeconds?: number; endSeconds?: number }): void;
    cueVideoById(opts: { videoId: string; startSeconds?: number; endSeconds?: number }): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    playVideo(): void;
    pauseVideo(): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    destroy(): void;
}

interface YTEvent<T = unknown> {
    target: YTPlayerLike;
    data: T;
}

export interface YTPlayerOptions {
    width?: string | number;
    height?: string | number;
    videoId?: string;
    playerVars?: Record<string, string | number>;
    events?: {
        onReady?: (e: YTEvent) => void;
        onStateChange?: (e: YTEvent<number>) => void;
        onError?: (e: YTEvent<number>) => void;
        onAutoplayBlocked?: (e: YTEvent) => void;
    };
}

export interface YTNamespace {
    Player: new (target: HTMLElement, opts: YTPlayerOptions) => YTPlayerLike;
}

/** YT.PlayerState */
export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

/** 這些錯誤碼代表影片本身不能在嵌入播放器播（已刪、私人、禁止嵌入、參數錯、HTML5 錯） */
export const SKIPPABLE_ERRORS = new Set([2, 5, 100, 101, 150]);
export const ERROR_SKIP_DELAY_MS = 1500;
export const POLL_INTERVAL_MS = 250;

export function getYT(): YTNamespace | undefined {
    if (typeof window === 'undefined') return undefined;
    return (window as unknown as { YT?: Partial<YTNamespace> }).YT?.Player
        ? ((window as unknown as { YT: YTNamespace }).YT)
        : undefined;
}

/** 載入 YouTube IFrame API（已載入就直接回傳） */
export async function ensureYT(): Promise<YTNamespace> {
    const ready = getYT();
    if (ready) return ready;
    await apiLoader.loadYouTubePlayerApi();
    const loaded = getYT();
    if (!loaded) throw new Error('YouTube IFrame API unavailable');
    return loaded;
}

// ---------- 佇列的額外操作（lib/queue.ts 之外，hook 專用） ----------

export type PlayerQueueAction =
    | QueueAction
    | { type: 'load'; items: QueueItem[]; startIndex: number; play: boolean; random?: () => number }
    | { type: 'append'; items: QueueItem[] }
    | { type: 'remove'; pos: number }
    | { type: 'clear' };

/** 播放佇列 reducer：lib 的 queueReducer ＋ 載入／附加／移除／清空。純函式。 */
export function playerQueueReducer(state: QueueState, action: PlayerQueueAction): QueueState {
    switch (action.type) {
        case 'load': {
            const startIndex = Math.min(Math.max(action.startIndex, 0), Math.max(action.items.length - 1, 0));
            let next = createQueue(action.items, { startIndex, repeat: state.repeat });
            if (action.play && action.items.length > 0) next = queueReducer(next, { type: 'jump', index: startIndex });
            if (state.shuffle) next = queueReducer(next, { type: 'setShuffle', on: true, random: action.random });
            // playToken 必須比舊佇列大：播放器以 token 變化偵測「要重新載入」
            return { ...next, playToken: state.playToken + (action.play && action.items.length > 0 ? 1 : 0) };
        }
        case 'append': {
            const existing = new Set(state.items.map((it) => it.code));
            const added = action.items.filter((it) => {
                if (existing.has(it.code)) return false;
                existing.add(it.code);
                return true;
            });
            if (added.length === 0) return state;
            const base = state.items.length;
            // 佇列已播完（或整輪都不可播）才加歌：目前這首指向第一首新歌，按播放就從它開始
            const resume = state.status === 'stopped' || state.allFailed;
            return {
                ...state,
                items: [...state.items, ...added],
                order: [...state.order, ...added.map((_, i) => base + i)],
                cursor: resume ? state.order.length : state.cursor,
                allFailed: false,
            };
        }
        case 'remove': {
            // 只能移除「不是目前這首」的項目（移除目前這首會讓播放器與佇列對不上）
            if (action.pos === state.cursor) return state;
            const removedIdx = state.order[action.pos];
            if (removedIdx === undefined) return state;
            const items = state.items.filter((_, i) => i !== removedIdx);
            const order = state.order
                .filter((_, p) => p !== action.pos)
                .map((i) => (i > removedIdx ? i - 1 : i));
            const cursor = action.pos < state.cursor ? state.cursor - 1 : state.cursor;
            return { ...state, items, order, cursor, wrapFrom: null };
        }
        case 'clear':
            return { ...createQueue([], { repeat: state.repeat }), shuffle: state.shuffle, playToken: state.playToken };
        default:
            return queueReducer(state, action);
    }
}

// ---------- hook ----------

export type PlayerStatus = 'loading' | 'ready' | 'error';

export interface SegmentPlayer {
    /** 播放器掛載點：放在 16:9 容器裡，不可被其他元素覆蓋 */
    containerRef: RefObject<HTMLDivElement | null>;
    queue: QueueState;
    current: QueueItem | null;
    playerStatus: PlayerStatus;
    /** YouTube 目前是否在播放 */
    isPlaying: boolean;
    /** 瀏覽器擋下自動播放，需要使用者點一下 */
    needsGesture: boolean;
    /** 目前這支影片無法播放，1.5 秒後跳過 */
    skipping: boolean;
    load(items: QueueItem[], opts?: { startIndex?: number; play?: boolean }): void;
    append(items: QueueItem[]): void;
    remove(pos: number): void;
    clear(): void;
    togglePlay(): void;
    /** 使用者手勢觸發的播放（「點此播放」） */
    resume(): void;
    next(): void;
    prev(): void;
    jump(pos: number): void;
    setRepeat(mode: RepeatMode): void;
    setShuffle(on: boolean): void;
}

export function useSegmentPlayer(): SegmentPlayer {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YTPlayerLike | null>(null);
    const [queue, dispatch] = useReducer(playerQueueReducer, undefined, () => createQueue([]));
    const [playerStatus, setPlayerStatus] = useState<PlayerStatus>('loading');
    const [ytState, setYtState] = useState<number>(YT_STATE.UNSTARTED);
    const [needsGesture, setNeedsGesture] = useState(false);
    const [skipping, setSkipping] = useState(false);

    // 事件 callback 與輪詢讀的是 ref（YT 事件 closure 只建立一次）
    const queueRef = useRef(queue);
    /** 播放器上目前載入的項目（planLoad 用） */
    const loadedItemRef = useRef<QueueItem | null>(null);
    /** 已送進播放器的 playToken：同一個 token 只載入一次 */
    const appliedTokenRef = useRef(0);
    /** 已觸發過推進的 `${code}:${playToken}` */
    const firedKeyRef = useRef<string | null>(null);
    /** 換首後要先看到 currentTime < end 才開始判斷結束 */
    const armedRef = useRef(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        queueRef.current = queue;
    }, [queue]);

    const cancelPendingError = useCallback(() => {
        if (errorTimerRef.current) {
            clearTimeout(errorTimerRef.current);
            errorTimerRef.current = null;
        }
        setSkipping(false);
    }, []);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    /** 目前片段播到結束（輪詢或 ENDED），每個 code＋token 只推進一次 */
    const fireEnded = useCallback(() => {
        const state = queueRef.current;
        const item = currentItem(state);
        if (!item || state.status !== 'playing') return;
        const key = `${item.code}:${state.playToken}`;
        if (firedKeyRef.current === key) return;
        firedKeyRef.current = key;
        dispatch({ type: 'ended' });
    }, []);

    const tick = useCallback(() => {
        const player = playerRef.current;
        const state = queueRef.current;
        const item = currentItem(state);
        if (!player || !item || state.status !== 'playing') return;
        let t: number;
        try {
            t = player.getCurrentTime();
        } catch {
            return;
        }
        if (!Number.isFinite(t)) return;
        if (!armedRef.current) {
            if (t < item.end - END_EPSILON) armedRef.current = true;
            return;
        }
        if (shouldAdvance(t, item.end)) fireEnded();
    }, [fireEnded]);

    // 建立／銷毀播放器（只在 mount 時一次）
    useEffect(() => {
        let cancelled = false;
        const container = containerRef.current;

        const create = async () => {
            if (!container) return;
            try {
                const YT = await ensureYT();
                if (cancelled) return;
                container.innerHTML = '';
                // 播放器會「取代」這個 target；與 React 管理的 DOM 隔開
                const target = document.createElement('div');
                target.style.width = '100%';
                target.style.height = '100%';
                container.appendChild(target);
                playerRef.current = new YT.Player(target, {
                    width: '100%',
                    height: '100%',
                    playerVars: {
                        autoplay: 0,
                        rel: 0,
                        playsinline: 1,
                        modestbranding: 1,
                        enablejsapi: 1,
                        origin: window.location.origin,
                    },
                    events: {
                        onReady: (e) => {
                            if (cancelled) {
                                try { e.target.destroy(); } catch { /* 已銷毀 */ }
                                return;
                            }
                            playerRef.current = e.target;
                            setPlayerStatus('ready');
                        },
                        onStateChange: (e) => {
                            if (cancelled) return;
                            setYtState(e.data);
                            if (e.data === YT_STATE.PLAYING) {
                                setNeedsGesture(false);
                                if (!pollRef.current) pollRef.current = setInterval(tick, POLL_INTERVAL_MS);
                            } else {
                                stopPolling();
                            }
                            if (e.data === YT_STATE.ENDED) handleEnded();
                        },
                        onError: (e) => {
                            if (cancelled || !SKIPPABLE_ERRORS.has(e.data)) return;
                            scheduleSkip();
                        },
                        onAutoplayBlocked: () => {
                            if (!cancelled) setNeedsGesture(true);
                        },
                    },
                });
            } catch {
                if (!cancelled) setPlayerStatus('error');
            }
        };

        /** ENDED：沒帶 endSeconds，只有整支影片播完才會發生（片段結尾超過影片長度的資料）→ 直接推進 */
        const handleEnded = () => fireEnded();

        const scheduleSkip = () => {
            // 只處理「播放中」的錯誤：預覽（cue）階段出錯不自動開播，等使用者按播放再判斷
            if (errorTimerRef.current || queueRef.current.status !== 'playing') return;
            const tokenAtError = queueRef.current.playToken;
            setSkipping(true);
            errorTimerRef.current = setTimeout(() => {
                errorTimerRef.current = null;
                setSkipping(false);
                // 等待期間使用者換了首：這個錯誤不屬於新的那首
                if (queueRef.current.playToken !== tokenAtError) return;
                dispatch({ type: 'error' });
            }, ERROR_SKIP_DELAY_MS);
        };

        void create();

        return () => {
            cancelled = true;
            stopPolling();
            if (errorTimerRef.current) {
                clearTimeout(errorTimerRef.current);
                errorTimerRef.current = null;
            }
            const player = playerRef.current;
            playerRef.current = null;
            if (player) {
                // 下一個 tick 才 destroy，避開 React render 期間的 DOM 衝突（同 StreamIframe.safeDestroy）
                setTimeout(() => {
                    try { player.destroy(); } catch { /* 已銷毀 */ }
                }, 0);
            }
            if (container) container.innerHTML = '';
        };
        // tick / fireEnded / stopPolling 都是穩定 callback；播放器只建一次
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // playToken 變化 → 把目前項目送進播放器（同影片 seek、不同影片 load）
    useEffect(() => {
        const player = playerRef.current;
        if (playerStatus !== 'ready' || !player) return;
        const item = currentItem(queue);
        if (queue.status !== 'playing' || !item) return;
        if (appliedTokenRef.current === queue.playToken) return;
        appliedTokenRef.current = queue.playToken;
        armedRef.current = false;
        firedKeyRef.current = null;
        cancelPendingError();

        if (planLoad(loadedItemRef.current, item) === 'seek') {
            player.seekTo(item.start, true);
            player.playVideo();
        } else {
            player.loadVideoById({ videoId: item.videoId, startSeconds: item.start });
        }
        loadedItemRef.current = item;
    }, [playerStatus, queue, cancelPendingError]);

    // 尚未開始播放：把目前這首 cue 進播放器當預覽（不播放、不算載入）
    const cuedCodeRef = useRef<string | null>(null);
    useEffect(() => {
        const player = playerRef.current;
        if (playerStatus !== 'ready' || !player || queue.status !== 'idle') return;
        const item = currentItem(queue);
        if (!item || cuedCodeRef.current === item.code) return;
        cuedCodeRef.current = item.code;
        loadedItemRef.current = null;
        try {
            player.cueVideoById({ videoId: item.videoId, startSeconds: item.start });
        } catch { /* 尚未就緒 */ }
    }, [playerStatus, queue]);

    // 佇列播完／整輪都不可播：停下來
    useEffect(() => {
        if (queue.status !== 'stopped') return;
        stopPolling();
        try { playerRef.current?.pauseVideo(); } catch { /* 播放器尚未就緒 */ }
    }, [queue.status, queue.playToken, stopPolling]);

    const load = useCallback((items: QueueItem[], opts?: { startIndex?: number; play?: boolean }) => {
        dispatch({ type: 'load', items, startIndex: opts?.startIndex ?? 0, play: opts?.play ?? true });
    }, []);
    const append = useCallback((items: QueueItem[]) => dispatch({ type: 'append', items }), []);
    const remove = useCallback((pos: number) => dispatch({ type: 'remove', pos }), []);
    const clear = useCallback(() => {
        cancelPendingError();
        stopPolling();
        try { playerRef.current?.pauseVideo(); } catch { /* 尚未就緒 */ }
        dispatch({ type: 'clear' });
    }, [cancelPendingError, stopPolling]);

    const next = useCallback(() => dispatch({ type: 'next' }), []);
    const jump = useCallback((pos: number) => dispatch({ type: 'jump', index: pos }), []);
    const prev = useCallback(() => {
        const item = currentItem(queueRef.current);
        let elapsed = 0;
        try {
            const t = playerRef.current?.getCurrentTime() ?? 0;
            if (item && Number.isFinite(t)) elapsed = t - item.start;
        } catch { /* 讀不到時間：當作剛開始 */ }
        dispatch({ type: 'prev', elapsed });
    }, []);

    const resume = useCallback(() => {
        setNeedsGesture(false);
        try { playerRef.current?.playVideo(); } catch { /* 尚未就緒 */ }
    }, []);

    const togglePlay = useCallback(() => {
        const state = queueRef.current;
        if (state.items.length === 0 || state.allFailed) return;
        // 還沒開始或已播完：從目前這首開始播
        if (state.status !== 'playing') {
            dispatch({ type: 'jump', index: state.cursor });
            return;
        }
        const player = playerRef.current;
        if (!player) return;
        try {
            if (player.getPlayerState() === YT_STATE.PLAYING) player.pauseVideo();
            else {
                setNeedsGesture(false);
                player.playVideo();
            }
        } catch { /* 尚未就緒 */ }
    }, []);

    const setRepeat = useCallback((mode: RepeatMode) => dispatch({ type: 'setRepeat', mode }), []);
    const setShuffle = useCallback((on: boolean) => dispatch({ type: 'setShuffle', on }), []);

    return {
        containerRef,
        queue,
        current: currentItem(queue),
        playerStatus,
        isPlaying: ytState === YT_STATE.PLAYING && queue.status === 'playing',
        needsGesture,
        skipping,
        load,
        append,
        remove,
        clear,
        togglePlay,
        resume,
        next,
        prev,
        jump,
        setRepeat,
        setShuffle,
    };
}
