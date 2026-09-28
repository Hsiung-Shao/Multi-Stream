// 週表勾選 → 一次加入畫布。
// 逐一 await addStream（與 loadFavoritesToCanvas 相同理由：addStream 會依畫布現況排版，並行加入會互相覆蓋）。

import { canvasInput } from './streamLinks';
import type { ScheduleChannel, ScheduleStream } from './types';

/** 與 useStreamStore.addStream 的上限（16 路）一致 */
export const CANVAS_MAX_STREAMS = 16;

export interface OpenTarget {
    input: string;
    displayName: string;
}

type AddStream = (
    url: string,
    opts: { withChat?: boolean; withStream?: boolean; displayName?: string },
) => Promise<{ success: boolean; message?: string } | undefined | void>;

/** 選取的場次 → 可加入的清單（去掉拿不到輸入的；同一實況主同平台只加一次） */
export function toOpenTargets(
    selected: readonly ScheduleStream[],
    channels: Record<string, ScheduleChannel>,
): OpenTarget[] {
    const seen = new Set<string>();
    const out: OpenTarget[] = [];
    for (const s of selected) {
        const ch = channels[s.vtuber_id];
        const input = canvasInput(s, ch);
        if (!input || seen.has(input)) continue;
        seen.add(input);
        out.push({ input, displayName: ch?.name ?? input });
    }
    return out;
}

export interface OpenResult {
    added: number;
    failed: number;
    /** 因為畫布已滿而沒有嘗試的數量 */
    skipped: number;
}

/**
 * 依序加入畫布，最多加到剩餘路數為止。
 * currentCount：目前畫布上的直播路數（useStreamStore.getState().streams.length）。
 */
export async function openOnCanvas(
    targets: readonly OpenTarget[],
    currentCount: number,
    addStream: AddStream,
): Promise<OpenResult> {
    const room = Math.max(0, CANVAS_MAX_STREAMS - currentCount);
    const toAdd = targets.slice(0, room);
    let added = 0;
    let failed = 0;
    for (const t of toAdd) {
        try {
            const res = await addStream(t.input, { withChat: true, withStream: true, displayName: t.displayName });
            if (res && res.success === false) failed++;
            else added++;
        } catch {
            failed++;
        }
    }
    return { added, failed, skipped: targets.length - toAdd.length };
}
