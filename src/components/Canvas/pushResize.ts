/**
 * 推擠讓位（push-resize）— 純格線運算，不依賴 React 或 DOM。
 *
 * 問題：舊行為在 useResize 內偵測到碰撞就直接 return，視窗完全不動也沒有任何回饋。
 * 由於模板產生的佈局是滿版 24×24、格子彼此緊貼，**任何放大都必然碰撞**，
 * 結果就是使用者只能縮小、永遠拉不大（問卷中最高票的抱怨）。
 *
 * 新行為：拉大某個視窗時，該方向上的鄰居依序讓位——先吃掉空白，不夠就由近而遠
 * 壓縮鄰居到各自的最小尺寸。全部壓到底仍不夠時，把擴張量夾在做得到的範圍，
 * 使用者感受到的是「阻力」而不是「壞掉」。
 *
 * 不變式（由單元測試把關）：
 *   - 任兩視窗不重疊
 *   - 所有視窗維持在 [0, gridCols] 之內
 *   - 沒有視窗被壓到小於自己的最小尺寸
 */

export interface PushRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** 推擠只需要這些欄位，刻意用結構型別以免和 CanvasWindow 耦合 */
export interface PushableWindow {
    id: string;
    gridX: number;
    gridY: number;
    gridW: number;
    gridH: number;
}

export interface SizeLimits {
    minW: number;
    minH: number;
    /** 回填擴張時的上限（例如 chat 視窗寬度不得超過 4）。省略代表不限制 */
    maxW?: number;
    maxH?: number;
}

/** @deprecated 保留舊名以免呼叫端一次改太多；等同 SizeLimits */
export type MinSize = SizeLimits;

export interface PushOptions<T> {
    gridCols: number;
    minSize: (window: T) => SizeLimits;
    /** 垂直下界。容器列數可動態增長，故預設不限制（往下推永遠推得動） */
    maxRows?: number;
    /** 縮小後連鎖填補時，分數高者優先被選來吸收空白（例如優先放大直播畫面） */
    prefer?: (window: T) => number;
}

export interface PushResult<T> {
    windows: T[];
    /** 實際套用到 moving 視窗的矩形。空間不足時會小於 desired */
    applied: PushRect;
}

const rectOf = (w: PushableWindow): PushRect => ({ x: w.gridX, y: w.gridY, w: w.gridW, h: w.gridH });

/** 兩個一維區間是否重疊（僅相鄰不算） */
const spansOverlap = (aStart: number, aSize: number, bStart: number, bSize: number): boolean =>
    aStart < bStart + bSize && aStart + aSize > bStart;

interface Axis {
    /** 推擠軸上的起點 */
    pos: (r: PushRect) => number;
    /** 推擠軸上的長度 */
    size: (r: PushRect) => number;
    /** 垂直於推擠軸的起點（用來判斷是否「同一排」） */
    crossPos: (r: PushRect) => number;
    crossSize: (r: PushRect) => number;
    minSize: (m: SizeLimits) => number;
    /** 該軸的尺寸上限，未指定時為 Infinity */
    maxSize: (m: SizeLimits) => number;
    write: (r: PushRect, pos: number, size: number) => PushRect;
}

const X_AXIS: Axis = {
    pos: r => r.x,
    size: r => r.w,
    crossPos: r => r.y,
    crossSize: r => r.h,
    minSize: m => m.minW,
    maxSize: m => m.maxW ?? Number.POSITIVE_INFINITY,
    write: (r, pos, size) => ({ ...r, x: pos, w: size }),
};

const Y_AXIS: Axis = {
    pos: r => r.y,
    size: r => r.h,
    crossPos: r => r.x,
    crossSize: r => r.w,
    minSize: m => m.minH,
    maxSize: m => m.maxH ?? Number.POSITIVE_INFINITY,
    write: (r, pos, size) => ({ ...r, y: pos, h: size }),
};

/**
 * 沿單一方向推擠。
 *
 * 為了讓四個方向共用同一套邏輯，sign === -1（往左／往上）時先把座標鏡射到正向空間，
 * 算完再鏡射回來。鏡射軸取 `mirrorAt`，區間 [p, p+s] 鏡射後為 [mirrorAt-(p+s), s]。
 *
 * @returns 實際達成的擴張量，以及被推動後的鄰居
 */
function pushAlong(
    axis: Axis,
    sign: 1 | -1,
    movingOrigin: PushRect,
    movingTarget: PushRect,
    neighbours: Array<{ rect: PushRect; min: MinSize }>,
    lowerBound: number,
    upperBound: number,
): { actualDelta: number; neighbours: PushRect[] } {
    // 鏡射軸。垂直方向的 upperBound 可能是 Infinity（容器往下可無限長高），
    // 直接相加會讓所有座標變成 NaN，因此改取一個有限常數——鏡射只需自我對合，
    // 而下方 span 的計算只和 lowerBound 有關，與這個常數無關。
    const mirrorAt = Number.isFinite(upperBound) ? upperBound + lowerBound : lowerBound + 1e6;

    // 鏡射一個區間到正向空間（sign === 1 時是恆等變換）
    const toLocal = (r: PushRect): { start: number; length: number } => {
        const p = axis.pos(r);
        const s = axis.size(r);
        return sign === 1 ? { start: p, length: s } : { start: mirrorAt - (p + s), length: s };
    };
    const fromLocal = (r: PushRect, start: number, length: number): PushRect =>
        sign === 1
            ? axis.write(r, start, length)
            : axis.write(r, mirrorAt - (start + length), length);

    const localUpper = sign === 1 ? upperBound : mirrorAt - lowerBound;

    const origin = toLocal(movingOrigin);
    const target = toLocal(movingTarget);

    // 這個方向上的推進量：moving 的「前緣」往前走了多少
    const delta = (target.start + target.length) - (origin.start + origin.length);
    if (delta <= 0) return { actualDelta: 0, neighbours: neighbours.map(n => n.rect) };

    const frontier = origin.start + origin.length;
    const crossOverlap = (a: PushRect, b: PushRect) =>
        spansOverlap(axis.crossPos(a), axis.crossSize(a), axis.crossPos(b), axis.crossSize(b));

    const all = neighbours.map((n, index) => ({ index, min: n.min, rect: n.rect, local: toLocal(n.rect) }));

    // 受影響的集合要取傳遞閉包：被推的鄰居自己也會撞上更前方的視窗，
    // 而那些視窗未必和 moving 同排。只算第一層會漏掉它們，造成重疊。
    const affectedSet = new Set<number>();
    const queue = all.filter(n => crossOverlap(movingTarget, n.rect) && n.local.start >= frontier);
    while (queue.length) {
        const n = queue.pop()!;
        if (affectedSet.has(n.index)) continue;
        affectedSet.add(n.index);

        // 原佈局不重疊，所以同排的鄰居要嘛完全在前、要嘛完全在後；只有前方的會被波及
        const nEnd = n.local.start + n.local.length;
        for (const m of all) {
            if (!affectedSet.has(m.index) && crossOverlap(n.rect, m.rect) && m.local.start >= nEnd) {
                queue.push(m);
            }
        }
    }

    const affected = all
        .filter(n => affectedSet.has(n.index))
        .sort((a, b) => a.local.start - b.local.start);

    if (affected.length === 0) {
        return { actualDelta: delta, neighbours: neighbours.map(n => n.rect) };
    }

    /**
     * 嘗試把 moving 擴張 d 格，逐一替被擋住的鄰居定位。
     *
     * 讓位是有傳遞性的（A 推 B、B 再推 C），但只在「垂直軸真的重疊」時才成立——
     * 上下並排的兩個鄰居互不阻擋，各自獨立定位。這裡逐一比對阻擋關係而不是串成
     * 一條鏈，否則並排的視窗會被接到彼此後面而擠出畫布。
     *
     * @param allowShrink 允許鄰居就地壓縮（終點不動、起點被推走）。false 時只能整體平移。
     */
    const tryPush = (d: number, allowShrink: boolean): Array<{ start: number; length: number }> | null => {
        const movingFront = frontier + d;
        const placed = affected.map(n => ({ ...n.local }));

        for (let i = 0; i < affected.length; i++) {
            const self = affected[i];
            // 由近而遠處理，所以 j < i 的鄰居都已經定位完畢
            let front = crossOverlap(movingTarget, self.rect) ? movingFront : -Infinity;
            for (let j = 0; j < i; j++) {
                if (crossOverlap(affected[j].rect, self.rect)) {
                    front = Math.max(front, placed[j].start + placed[j].length);
                }
            }

            if (front <= placed[i].start) continue;

            const end = placed[i].start + placed[i].length;
            const length = allowShrink
                ? Math.max(axis.minSize(self.min), end - front) // 壓到最小仍不夠時自然退化為平移
                : placed[i].length;

            if (front + length > localUpper) return null;
            placed[i] = { start: front, length };
        }

        return placed;
    };

    // 座標是 0~24 的小整數，由大到小找出做得到的最大擴張量即可（最多 24 次）。
    for (let d = delta; d > 0; d--) {
        const shrunk = tryPush(d, true);
        if (!shrunk) continue;

        // 同一個 d 下，若鄰居光靠平移就讓得出空間，就不要壓縮它們——尺寸能保留就保留。
        // （例如垂直往下推時容器可以長高，鄰居沒有理由被壓扁。）
        const placed = tryPush(d, false) ?? shrunk;

        const result = neighbours.map(n => n.rect);
        affected.forEach((n, i) => {
            result[n.index] = fromLocal(n.rect, placed[i].start, placed[i].length);
        });
        return { actualDelta: d, neighbours: result };
    }

    return { actualDelta: 0, neighbours: neighbours.map(n => n.rect) };
}

/** 回填時鄰居移動的方向。'left' 代表空隙右側的鄰居往左長，其餘依此類推。 */
export type FillDirection = 'left' | 'right' | 'up' | 'down';

const FILL_AXIS: Record<FillDirection, { axis: Axis; sign: 1 | -1 }> = {
    right: { axis: X_AXIS, sign: 1 },
    left: { axis: X_AXIS, sign: -1 },
    down: { axis: Y_AXIS, sign: 1 },
    up: { axis: Y_AXIS, sign: -1 },
};

/**
 * 掃出畫布上所有空白，切成一組互不重疊的矩形。
 *
 * 有效範圍是 x ∈ [0, gridCols)、y ∈ [0, 最大下緣)——底部以下是容器可以自然延伸的區域，
 * 不算空洞，否則每次都會偵測到一塊永遠填不滿的無限空白。
 */
export function findEmptyRects<T extends PushableWindow>(windows: T[], gridCols: number): PushRect[] {
    const bottom = windows.reduce((max, w) => Math.max(max, w.gridY + w.gridH), 0);
    if (bottom <= 0) return [];

    const occupied: boolean[][] = Array.from({ length: bottom }, () => new Array<boolean>(gridCols).fill(false));
    for (const w of windows) {
        for (let y = Math.max(0, w.gridY); y < Math.min(bottom, w.gridY + w.gridH); y++) {
            for (let x = Math.max(0, w.gridX); x < Math.min(gridCols, w.gridX + w.gridW); x++) {
                occupied[y][x] = true;
            }
        }
    }

    // 貪婪合併：先往右吃滿，再往下吃到某一列破格為止
    const rects: PushRect[] = [];
    for (let y = 0; y < bottom; y++) {
        for (let x = 0; x < gridCols; x++) {
            if (occupied[y][x]) continue;

            let w = 0;
            while (x + w < gridCols && !occupied[y][x + w]) w++;

            let h = 1;
            while (y + h < bottom) {
                let rowClear = true;
                for (let i = 0; i < w; i++) {
                    if (occupied[y + h][x + i]) { rowClear = false; break; }
                }
                if (!rowClear) break;
                h++;
            }

            for (let dy = 0; dy < h; dy++) {
                for (let dx = 0; dx < w; dx++) occupied[y + dy][x + dx] = true;
            }
            rects.push({ x, y, w, h });
            x += w - 1;
        }
    }
    return rects;
}

export interface ChainFillOptions<T> {
    gridCols: number;
    maxRows?: number;
    limitsOf: (window: T) => SizeLimits;
    /** 分數高者優先被選來吸收空白。用來表達「寧可讓直播畫面變大」 */
    prefer?: (window: T) => number;
    /** 使用者剛剛調整過的視窗，不可以被自動改回去 */
    exclude?: string;
}

/**
 * 沿單一方向連鎖填補一塊空白。
 *
 * 緊鄰的視窗若還有餘裕就直接吸收；已達尺寸上限（例如聊天室寬度上限 4）就讓它**整體平移**，
 * 把空白推給更外面的視窗，如此傳遞下去直到有人吸收得了。
 *
 * 整條鏈要嘛全部成立、要嘛完全不動：這樣每次成功都嚴格減少空白總面積，
 * 外層的迭代才保證收斂，不會出現「填了 A 冒出 B、填了 B 又冒出 A」的來回震盪。
 *
 * @returns 套用後的視窗，或 null 表示這個方向填不了
 */
function tryChainFill<T extends PushableWindow>(
    windows: T[],
    gap: PushRect,
    direction: FillDirection,
    opts: ChainFillOptions<T>,
): T[] | null {
    const { axis, sign } = FILL_AXIS[direction];
    const amount = axis.size(gap);
    const gapCrossStart = axis.crossPos(gap);
    const gapCrossSize = axis.crossSize(gap);
    const gapCrossEnd = gapCrossStart + gapCrossSize;
    const upper = axis === X_AXIS ? opts.gridCols : (opts.maxRows ?? Number.POSITIVE_INFINITY);

    let current = windows;
    let cursorStart = axis.pos(gap);

    // 最多傳遞到每個視窗一次；超過就是有環，直接放棄
    for (let guard = 0; guard <= windows.length; guard++) {
        const cursorEnd = cursorStart + amount;

        const candidates = current.filter(w => {
            if (w.id === opts.exclude) return false;
            const r = rectOf(w);
            const pos = axis.pos(r);
            const size = axis.size(r);
            const adjacent = sign === 1 ? pos + size === cursorStart : pos === cursorEnd;
            if (!adjacent) return false;
            const cs = axis.crossPos(r);
            return cs >= gapCrossStart && cs + axis.crossSize(r) <= gapCrossEnd;
        });
        if (candidates.length === 0) return null;

        // 候選要合起來完整覆蓋空白的寬度，否則補完會留下更碎的形狀
        const covered = candidates.reduce((sum, w) => sum + axis.crossSize(rectOf(w)), 0);
        if (covered !== gapCrossSize) return null;

        const canAbsorb = candidates.every(w =>
            axis.size(rectOf(w)) + amount <= axis.maxSize(opts.limitsOf(w)));

        if (canAbsorb) {
            const grown = new Map(candidates.map(w => {
                const r = rectOf(w);
                const size = axis.size(r) + amount;
                const pos = sign === 1 ? axis.pos(r) : axis.pos(r) - amount;
                return [w.id, axis.write(r, pos, size)] as const;
            }));
            return current.map(w => {
                const r = grown.get(w.id);
                return r ? { ...w, gridX: r.x, gridY: r.y, gridW: r.w, gridH: r.h } : w;
            });
        }

        // 吸收不了就往外傳。多個候選一起平移會讓騰出的空白變成非矩形，
        // 追蹤成本高又罕見，因此只在單一候選時繼續傳遞。
        if (candidates.length !== 1) return null;

        const only = candidates[0];
        const r = rectOf(only);
        const size = axis.size(r);
        const newPos = sign === 1 ? axis.pos(r) + amount : axis.pos(r) - amount;
        if (newPos < 0 || newPos + size > upper) return null;

        const moved = axis.write(r, newPos, size);
        current = current.map(w =>
            w.id === only.id ? { ...w, gridX: moved.x, gridY: moved.y, gridW: moved.w, gridH: moved.h } : w);
        // 空白轉移到它原本的位置
        cursorStart = sign === 1 ? axis.pos(r) : axis.pos(r) + size - amount;
    }

    return null;
}

/** 這次填補讓誰變大了？取其中最低的偏好分數，避免「順便把不想放大的也拉大」 */
function growthScore<T extends PushableWindow>(before: T[], after: T[], prefer: (w: T) => number): number {
    const byId = new Map(before.map(w => [w.id, w]));
    const grown = after.filter(w => {
        const b = byId.get(w.id);
        return b !== undefined && w.gridW * w.gridH > b.gridW * b.gridH;
    });
    return grown.length === 0 ? 0 : Math.min(...grown.map(prefer));
}

/**
 * 反覆掃描畫布並填補空白，直到補不動為止。
 *
 * 每一輪重新偵測空洞（填補會改變其他空洞的形狀，必須重掃而不是沿用舊清單），
 * 對每塊空白試四個方向，挑「讓直播畫面變大」的那個。
 *
 * 收斂性由 tryChainFill 的原子性保證：每次成功都讓空白總面積嚴格減少。
 * 仍有數學上填不了的空洞——例如鄰居橫跨的範圍比空洞寬，往空洞長必然壓到第三者——
 * 這種只能留白，除非允許全域重排。
 */
export function resolveChainFill<T extends PushableWindow>(
    windows: T[],
    opts: ChainFillOptions<T>,
): T[] {
    const ORDER = ['right', 'left', 'down', 'up'] as const;
    let current = windows;

    // 空白面積每輪嚴格遞減，輪數上限只是防呆
    for (let round = 0; round < 64; round++) {
        const gaps = findEmptyRects(current, opts.gridCols);
        if (gaps.length === 0) break;

        let progressed = false;
        for (const gap of gaps) {
            let best: T[] | null = null;
            let bestScore = -Infinity;

            for (const direction of ORDER) {
                const filled = tryChainFill(current, gap, direction, opts);
                if (!filled) continue;
                const score = opts.prefer ? growthScore(current, filled, opts.prefer) : 0;
                if (score > bestScore) {
                    bestScore = score;
                    best = filled;
                }
            }

            if (best) {
                current = best;
                progressed = true;
                break; // 佈局變了，重新掃描空洞
            }
        }

        if (!progressed) break;
    }

    return current;
}

/**
 * 把一塊空隙交給緊貼它的鄰居填補（單層版本，連鎖填補的基礎操作）。
 *
 * 候選必須同時滿足兩個條件，否則維持原狀讓那塊留白：
 *   1. 緊貼空隙的對側（中間不能有間隔，否則等於跨過別的空白搬家）
 *   2. **垂直於填補方向的區間完全落在空隙範圍內** —— 若鄰居比空隙寬，
 *      擴張就會壓到第三者。
 */
export function resolveBackfill<T extends PushableWindow>(
    windows: T[],
    gap: PushRect,
    direction: FillDirection,
    limitsOf: (window: T) => SizeLimits,
    excludeId?: string,
): T[] {
    if (gap.w <= 0 || gap.h <= 0) return windows;

    const { axis, sign } = FILL_AXIS[direction];
    const gapStart = axis.pos(gap);
    const gapEnd = gapStart + axis.size(gap);
    const gapCrossStart = axis.crossPos(gap);
    const gapCrossEnd = gapCrossStart + axis.crossSize(gap);

    return windows.map(w => {
        if (w.id === excludeId) return w;

        const rect = rectOf(w);
        const pos = axis.pos(rect);
        const size = axis.size(rect);

        const adjacent = sign === 1 ? pos + size === gapStart : pos === gapEnd;
        if (!adjacent) return w;

        const crossStart = axis.crossPos(rect);
        const crossEnd = crossStart + axis.crossSize(rect);
        if (crossStart < gapCrossStart || crossEnd > gapCrossEnd) return w;

        // 受各類型的尺寸上限約束（例如 chat 寬度不得超過 4），補不完的部分留白
        const newSize = Math.min(size + axis.size(gap), axis.maxSize(limitsOf(w)));
        if (newSize <= size) return w;

        // 往正方向長時近端不動；往負方向長時遠端不動
        const newPos = sign === 1 ? pos : (pos + size) - newSize;
        const next = axis.write(rect, newPos, newSize);
        return { ...w, gridX: next.x, gridY: next.y, gridW: next.w, gridH: next.h };
    });
}

/**
 * 解算一次 resize：把 desired 套到 movingId，擋路的鄰居依序讓位。
 *
 * 水平與垂直分兩階段獨立處理（角落拖曳時先水平、再垂直），
 * 兩階段各自呼叫 pushAlong，行為可預測也好測試。
 *
 * 放大時推擠鄰居讓位；縮小時反過來讓緊鄰的鄰居回填空隙，兩者是對稱操作。
 */
export function resolvePushResize<T extends PushableWindow>(
    windows: T[],
    movingId: string,
    desired: PushRect,
    options: PushOptions<T>,
): PushResult<T> {
    const { gridCols, minSize, maxRows = Number.POSITIVE_INFINITY } = options;

    const moving = windows.find(w => w.id === movingId);
    if (!moving) return { windows, applied: desired };

    const movingMin = minSize(moving);
    const origin = rectOf(moving);

    // 先夾到自身的硬約束：不小於最小尺寸、不超出畫布
    const clamped: PushRect = {
        x: Math.max(0, desired.x),
        y: Math.max(0, desired.y),
        w: Math.max(movingMin.minW, desired.w),
        h: Math.max(movingMin.minH, desired.h),
    };
    clamped.w = Math.min(clamped.w, gridCols - clamped.x);
    if (Number.isFinite(maxRows)) clamped.h = Math.min(clamped.h, maxRows - clamped.y);

    let others = windows
        .filter(w => w.id !== movingId)
        .map(w => ({ id: w.id, rect: rectOf(w), min: minSize(w) }));

    const applyPush = (
        axis: Axis,
        sign: 1 | -1,
        current: PushRect,
        target: PushRect,
        lower: number,
        upper: number,
    ): number => {
        const { actualDelta, neighbours } = pushAlong(axis, sign, current, target, others, lower, upper);
        others = others.map((o, i) => ({ ...o, rect: neighbours[i] }));
        return actualDelta;
    };

    // --- 水平：左右兩緣分開判斷。往外擴張才需要推擠鄰居，往內縮不影響任何人。---
    let left = origin.x;
    let right = origin.x + origin.w;
    const clampedRight = clamped.x + clamped.w;

    // 判斷「同一排」用的是當前高度而非目標高度：水平拖曳只該影響水平方向的鄰居，
    // 高度的擴張留給下面的垂直階段處理，否則角落拖曳會提前把下一排的視窗也捲進來。
    if (clampedRight > right) {
        const current = { x: left, y: origin.y, w: right - left, h: origin.h };
        const target = { ...current, w: clampedRight - left };
        right += applyPush(X_AXIS, 1, current, target, 0, gridCols);
    } else {
        right = clampedRight;
    }

    if (clamped.x < left) {
        const current = { x: left, y: origin.y, w: right - left, h: origin.h };
        const target = { x: clamped.x, y: origin.y, w: right - clamped.x, h: origin.h };
        left -= applyPush(X_AXIS, -1, current, target, 0, gridCols);
    } else {
        left = clamped.x;
    }

    // 一邊擴張被鄰居擋住、另一邊卻往內縮時（角落拖曳），兩者夾出來的尺寸可能跌破最小值。
    // 把往內縮的那一邊退回去補足——最多退回原始邊界，而原始位置必定合法，
    // 且鄰居在推擠中只會遠離 moving，所以退回去不可能造成重疊。
    // 必須在這裡就修正：垂直階段要用水平的結果來判斷「同一排」，寬度為 0 會讓整個垂直推擠被跳過。
    if (right - left < movingMin.minW) {
        if (left > origin.x) left = Math.max(origin.x, right - movingMin.minW);
        else right = Math.min(origin.x + origin.w, left + movingMin.minW);
    }

    // --- 垂直：同樣的兩緣處理。下界通常是無限（容器可長高），上界固定為 0。---
    let top = origin.y;
    let bottom = origin.y + origin.h;
    const clampedBottom = clamped.y + clamped.h;

    if (clampedBottom > bottom) {
        const current = { x: left, y: top, w: right - left, h: bottom - top };
        const target = { ...current, h: clampedBottom - top };
        bottom += applyPush(Y_AXIS, 1, current, target, 0, maxRows);
    } else {
        bottom = clampedBottom;
    }

    if (clamped.y < top) {
        const current = { x: left, y: top, w: right - left, h: bottom - top };
        const target = { x: left, y: clamped.y, w: right - left, h: bottom - clamped.y };
        top -= applyPush(Y_AXIS, -1, current, target, 0, maxRows);
    } else {
        top = clamped.y;
    }

    if (bottom - top < movingMin.minH) {
        if (top > origin.y) top = Math.max(origin.y, bottom - movingMin.minH);
        else bottom = Math.min(origin.y + origin.h, top + movingMin.minH);
    }

    const applied: PushRect = { x: left, y: top, w: right - left, h: bottom - top };

    const byId = new Map(others.map(o => [o.id, o.rect]));
    let nextWindows = windows.map(w => {
        if (w.id === movingId) {
            return { ...w, gridX: applied.x, gridY: applied.y, gridW: applied.w, gridH: applied.h };
        }
        const r = byId.get(w.id);
        return r ? { ...w, gridX: r.x, gridY: r.y, gridW: r.w, gridH: r.h } : w;
    });

    // 縮小會在原位留下空白，交給連鎖填補消化。放在推擠之後，才會用到鄰居讓位後的最終位置。
    // moving 本身必須排除：它緊貼著自己剛讓出的空白，若被選為候選就等於把使用者的操作改回去。
    nextWindows = resolveChainFill(nextWindows, {
        gridCols,
        maxRows,
        limitsOf: minSize,
        prefer: options.prefer,
        exclude: movingId,
    });

    return { windows: nextWindows, applied };
}
