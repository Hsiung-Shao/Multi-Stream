/**
 * 各類型視窗的格線尺寸限制。使用者拖出來的尺寸、縮放過程中的跟手預覽、推擠時能壓縮到的下限、
 * 版型產生器（layoutPresets）與聊天室調寬（canvasItemOps）都以這裡為準——
 * 幾處若各寫一份會逐漸漂移：預覽能拉到的尺寸落地時又被夾成另一個值，放開滑鼠視窗就「彈回去」。
 * 這個檔案只能 import 型別：layoutPresets 從這裡取常數，反過來 import 會形成循環相依。
 */
import type { CanvasWindow } from './DraggableWindow';

/** 串流視窗的最小邊長（格）：推擠與縮放都不會讓串流小於 6×6 */
export const MIN_STREAM_CELLS = 6;
/** 聊天室視窗的最小高度（格） */
export const MIN_CHAT_ROWS = 6;
/** 右側聊天室欄的可調範圍（格）；0 = 收合，不經過這組限制（見 canvasItemOps.collapseChats） */
export const MIN_CHAT_COLS = 3;
export const MAX_CHAT_COLS = 8;

export interface WindowSizeLimits {
    minW: number;
    minH: number;
    maxW: number;
}

const SIZE_LIMITS: Record<CanvasWindow['type'], WindowSizeLimits> = {
    stream: { minW: MIN_STREAM_CELLS, minH: MIN_STREAM_CELLS, maxW: Infinity },
    chat: { minW: MIN_CHAT_COLS, minH: MIN_CHAT_ROWS, maxW: MAX_CHAT_COLS },
};

export const limitsOf = (w: Pick<CanvasWindow, 'type'>): WindowSizeLimits => SIZE_LIMITS[w.type] ?? SIZE_LIMITS.stream;

/**
 * 縮放時實際允許的最大寬度：上限只擋「放大超過上限」，本來就比上限寬的視窗（舊版型、連鎖填補留下的）
 * 不在縮放時被硬夾回去，否則點一下縮放角聊天室就自己變窄（2026-09-24 使用者錄影回報）。
 * 比上限寬的聊天室縮放時一律走一般推擠（見 SimpleCanvas.isChatColumnResize 的寬度條件），
 * 預覽與落地都以這個值為上限，不會預覽 9 欄、落地被聊天室欄寬偏好夾回 8 而彈回。
 */
export const effectiveMaxW = (w: Pick<CanvasWindow, 'type' | 'gridW'>): number => Math.max(limitsOf(w).maxW, w.gridW);

/**
 * 縮放（跟手預覽、落地夾限、推擠鄰居）實際使用的限制，三處都從這裡取，預覽與落地同源。
 * 下限取「類型下限」與「視窗目前尺寸」的較小者：版型在塞不下 6×6 時會排出比下限小的格子
 * （layoutPresets.bestGridRects 的退回策略，例如 13 路＋聊天室欄的 5×6），這種視窗輕拖一下
 * 不能被強制放大到 6×6——那會推動整張畫布、讓畫布長出 24 列。它可以放大，只是不會被硬撐。
 * 上限同 effectiveMaxW。
 */
export const resizeLimitsOf = (w: Pick<CanvasWindow, 'type' | 'gridW' | 'gridH'>): WindowSizeLimits => {
    const { minW, minH } = limitsOf(w);
    return {
        minW: Math.max(1, Math.min(minW, w.gridW)),
        minH: Math.max(1, Math.min(minH, w.gridH)),
        maxW: effectiveMaxW(w),
    };
};
