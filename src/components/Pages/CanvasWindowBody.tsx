/**
 * CanvasWindowBody —— 單一畫布視窗的內容。
 *
 * 存在的理由是效能：上層若要自己從 streams 陣列撈出對應的 stream 再傳下來，
 * renderContent 就得依賴整個 streams；任何一路的音量／靜音／開台狀態變動都會讓
 * renderContent 換身分，進而重繪畫布上所有視窗的內容（含每個播放器容器）。
 * 改由這裡自己訂閱自己那一路——useStreamStore.updateStream 是 map 出新陣列但只替換
 * 目標項目，其餘 stream 回傳同一個參考，所以不相干的視窗 selector 結果不變、不重繪。
 *
 * props 全部是原始值（windowId / contentId / type）而非整個 window 物件：
 * 視窗只是被拖到別的格子時，物件身分會換但這些值不變，memo 就能擋掉重繪。
 */

import { memo } from 'react';
import type { WindowRenderProps } from '../Canvas';
import { EmptyWindowContent } from '../Canvas/EmptyWindowContent';
import { CanvasStreamContent } from './CanvasStreamContent';
import { useStreamStore } from '../../store/useStreamStore';
import type { CanvasItem } from '../../types/canvas';

interface CanvasWindowBodyProps {
    windowId: string;
    contentId?: number;
    type: 'stream' | 'chat';
    renderProps: WindowRenderProps;
}

// 模組層級的穩定函式：EmptyWindowContent 只在使用者操作時才呼叫，不需要反應式訂閱
const updateWindow = (id: string, updates: Partial<CanvasItem>) => {
    useStreamStore.getState().updateCanvasItem(id, updates);
};

export const CanvasWindowBody = memo(function CanvasWindowBody({
    windowId,
    contentId,
    type,
    renderProps,
}: CanvasWindowBodyProps) {
    // hook 不能條件呼叫；沒有 contentId 時 selector 恆回 undefined（穩定值）
    const stream = useStreamStore(s =>
        contentId === undefined ? undefined : s.streams.find(x => x.id === contentId)
    );

    if (contentId === undefined) {
        return (
            <EmptyWindowContent
                windowId={windowId}
                type={type}
                onUpdateWindow={updateWindow}
                renderProps={renderProps}
            />
        );
    }

    if (!stream) {
        // 有 contentId 但找不到串流：資料不一致，明講比靜默空白好除錯
        return (
            <div className="w-full h-full flex items-center justify-center text-white/50 text-sm bg-slate-900 border border-white/10 rounded-lg">
                串流未找到 (ID: {contentId})
            </div>
        );
    }

    return (
        <CanvasStreamContent
            stream={stream}
            windowType={type}
            renderProps={renderProps}
            windowId={windowId}
        />
    );
});
