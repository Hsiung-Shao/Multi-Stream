/**
 * 各類型視窗的格線尺寸限制。使用者拖出來的尺寸、縮放過程中的跟手預覽、推擠時能壓縮到的下限都以此為準——
 * 幾處若各寫一份會逐漸漂移：預覽能拉到的尺寸落地時又被夾成另一個值，放開滑鼠視窗就「彈回去」。
 * 聊天室上限與 layoutPresets 的 MAX_CHAT_COLS 一致。
 */
import type { CanvasWindow } from './DraggableWindow';
import { MAX_CHAT_COLS, MIN_CHAT_COLS } from '../../utils/layoutPresets';

export interface WindowSizeLimits {
    minW: number;
    minH: number;
    maxW: number;
}

const SIZE_LIMITS: Record<CanvasWindow['type'], WindowSizeLimits> = {
    stream: { minW: 6, minH: 6, maxW: Infinity },
    chat: { minW: MIN_CHAT_COLS, minH: 6, maxW: MAX_CHAT_COLS },
};

export const limitsOf = (w: Pick<CanvasWindow, 'type'>): WindowSizeLimits => SIZE_LIMITS[w.type] ?? SIZE_LIMITS.stream;

/**
 * 縮放時實際允許的最大寬度：上限只擋「放大超過上限」，本來就比上限寬的視窗（舊版型、連鎖填補留下的）
 * 不在縮放時被硬夾回去，否則點一下縮放角聊天室就自己變窄（2026-09-24 使用者錄影回報）。
 */
export const effectiveMaxW = (w: Pick<CanvasWindow, 'type' | 'gridW'>): number => Math.max(limitsOf(w).maxW, w.gridW);
