/**
 * 播放佇列狀態機：歌曲播放器的「現在播哪首、下一首是誰」全由這裡決定。
 *
 * - 純 reducer、零 DOM：不改動傳入的 state；亂數由 action.random 注入（預設 Math.random），測試可重現。
 * - order 是播放順序（items 索引），cursor 是 order 內的位置；未隨機時 order 為 0..n-1。
 * - playToken 每次「目前項目要從頭開始播」就 +1（換首、重播同首都算），播放器靠它偵測要重新載入／seek。
 * - 不可播處理以 videoId 為單位：同一支影片出錯，其餘片段一併跳過；next/error 都會略過 unplayable。
 * - 隨機 + 全部循環繞回時整批重洗 order，新的第一首不得等於剛播完那首（除非只有一首）；
 *   剛播完那首記在 wrapFrom，繞回後第一首按「上一首」會回到它，任何其他轉換都把 wrapFrom 清掉。
 * - setShuffle 不動 playToken：切換隨機不該讓目前這首重播。
 */
export type RepeatMode = 'off' | 'all' | 'one';

export interface QueueItem {
    code: string;
    videoId: string;
    start: number;
    end: number;
}

export interface QueueState {
    items: QueueItem[];
    /** 播放順序（items 的索引）；未隨機時為 0..n-1 */
    order: number[];
    /** order 中的位置 */
    cursor: number;
    repeat: RepeatMode;
    shuffle: boolean;
    status: 'idle' | 'playing' | 'stopped';
    /** 不可播的 videoId */
    unplayable: string[];
    /** 全部項目都不可播 */
    allFailed: boolean;
    /** 每次「目前項目要從頭開始播」就 +1 */
    playToken: number;
    /** 隨機循環剛繞回時，繞回前最後播的那首（items 索引）；「上一首」從 cursor 0 回到它。其餘轉換清為 null */
    wrapFrom: number | null;
}

type Random = () => number;

export type QueueAction =
    | { type: 'ended'; random?: Random }
    | { type: 'next'; random?: Random }
    | { type: 'prev'; elapsed: number }
    | { type: 'error'; random?: Random }
    | { type: 'jump'; index: number } // index 為 order 中的位置
    | { type: 'setRepeat'; mode: RepeatMode }
    | { type: 'setShuffle'; on: boolean; random?: Random };

/** 播放超過這個秒數時，「上一首」改為重播本首 */
const PREV_RESTART_SECONDS = 3;

export function createQueue(items: QueueItem[], opts?: { startIndex?: number; repeat?: RepeatMode }): QueueState {
    const startIndex = opts?.startIndex ?? 0;
    return {
        items,
        order: items.map((_, i) => i),
        cursor: Math.min(Math.max(startIndex, 0), Math.max(items.length - 1, 0)),
        repeat: opts?.repeat ?? 'off',
        shuffle: false,
        status: 'idle',
        unplayable: [],
        allFailed: false,
        playToken: 0,
        wrapFrom: null,
    };
}

export function currentItem(state: QueueState): QueueItem | null {
    const idx = state.order[state.cursor];
    return idx === undefined ? null : (state.items[idx] ?? null);
}

function isPlayableAt(state: QueueState, pos: number): boolean {
    const item = state.items[state.order[pos]];
    return item !== undefined && !state.unplayable.includes(item.videoId);
}

/** Fisher–Yates 洗牌（回傳新陣列） */
function shuffled(values: number[], random: Random): number[] {
    const out = [...values];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/** 開始播放 order 中第 cursor 個項目（playToken+1） */
function playAt(
    state: QueueState,
    cursor: number,
    order: number[] = state.order,
    wrapFrom: number | null = null,
): QueueState {
    return { ...state, order, cursor, status: 'playing', playToken: state.playToken + 1, wrapFrom };
}

/**
 * 找下一個可播項目並開始播放；找不到回 status 'stopped'（cursor 不變）。
 * repeat='all' 到尾端會繞回開頭（隨機時重洗，剛播完那首放新 order 尾端）。
 */
function advance(state: QueueState, random: Random): QueueState {
    for (let pos = state.cursor + 1; pos < state.order.length; pos++) {
        if (isPlayableAt(state, pos)) return playAt(state, pos);
    }

    if (state.repeat === 'all' && state.items.length > 0) {
        let order = state.order;
        const lastIdx = state.order[state.cursor];
        if (state.shuffle) {
            order = shuffled(state.items.map((_, i) => i), random);
            // 新第一首不得是剛播完那首：和隨機一個非 0 的位置互換
            if (order.length > 1 && order[0] === lastIdx) {
                const j = 1 + Math.floor(random() * (order.length - 1));
                [order[0], order[j]] = [order[j], order[0]];
            }
        }
        const wrapped = { ...state, order };
        for (let pos = 0; pos < order.length; pos++) {
            if (isPlayableAt(wrapped, pos)) return playAt(state, pos, order, state.shuffle ? lastIdx : null);
        }
    }

    return { ...state, status: 'stopped' };
}

function previous(state: QueueState, elapsed: number): QueueState {
    if (elapsed > PREV_RESTART_SECONDS) return playAt(state, state.cursor);

    // 隨機循環剛繞回：第一首按「上一首」回到繞回前最後播的那首
    if (state.cursor === 0 && state.wrapFrom !== null) {
        const pos = state.order.indexOf(state.wrapFrom);
        if (pos >= 0 && isPlayableAt(state, pos)) return playAt(state, pos);
    }

    for (let pos = state.cursor - 1; pos >= 0; pos--) {
        if (isPlayableAt(state, pos)) return playAt(state, pos);
    }
    if (state.repeat === 'all') {
        for (let pos = state.order.length - 1; pos > state.cursor; pos--) {
            if (isPlayableAt(state, pos)) return playAt(state, pos);
        }
    }
    // 前面沒有可播項目：停在原位並重播
    return playAt(state, state.cursor);
}

function setShuffle(state: QueueState, on: boolean, random: Random): QueueState {
    const n = state.items.length;
    if (n === 0) return { ...state, shuffle: on, wrapFrom: null };

    const currentIdx = state.order[state.cursor] ?? 0;
    if (on) {
        const rest = shuffled(
            state.items.map((_, i) => i).filter((i) => i !== currentIdx),
            random,
        );
        return { ...state, shuffle: true, order: [currentIdx, ...rest], cursor: 0, wrapFrom: null };
    }
    return { ...state, shuffle: false, order: state.items.map((_, i) => i), cursor: currentIdx, wrapFrom: null };
}

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
    switch (action.type) {
        case 'ended':
            if (state.repeat === 'one') return playAt(state, state.cursor);
            return advance(state, action.random ?? Math.random);
        case 'next':
            return advance(state, action.random ?? Math.random);
        case 'prev':
            return previous(state, action.elapsed);
        case 'error': {
            const item = currentItem(state);
            if (!item) return state;
            const unplayable = state.unplayable.includes(item.videoId)
                ? state.unplayable
                : [...state.unplayable, item.videoId];
            const marked = { ...state, unplayable };
            if (state.items.every((it) => unplayable.includes(it.videoId))) {
                return { ...marked, status: 'stopped', allFailed: true, wrapFrom: null };
            }
            return advance(marked, action.random ?? Math.random);
        }
        case 'jump':
            return playAt(state, Math.min(Math.max(action.index, 0), Math.max(state.order.length - 1, 0)));
        case 'setRepeat':
            return { ...state, repeat: action.mode };
        case 'setShuffle':
            return setShuffle(state, action.on, action.random ?? Math.random);
    }
}
