/**
 * NewCanvasPage - High Performance Canvas Page
 * Uses SimpleCanvas instead of react-grid-layout
 */

import { useEffect, useCallback, useMemo } from 'react';
import { DynamicIsland } from '../Navigation/DynamicIsland';
import { DynamicIslandEdgeDock } from '../Navigation/DynamicIslandEdgeDock';
import { SimpleCanvas, CanvasWindow, WindowRenderProps } from '../Canvas';
import { limitsOf } from '../Canvas/SimpleCanvas';
import { resolveChainFill } from '../Canvas/pushResize';
import { GRID_COLS } from '../Canvas/gridConfig';
import { useStreamStore } from '../../store/useStreamStore';
import { useUIStore } from '../../store/useUIStore';
import { CanvasStreamContent } from './CanvasStreamContent';
import { EmptyWindowContent } from '../Canvas/EmptyWindowContent';
import { CanvasEmptyState } from '../Canvas/CanvasEmptyState';
import { useTranslation } from 'react-i18next';
import { SEO } from '../SEO';
import { SEO_CANVAS } from '../../seo/defaults';

export const NewCanvasPage = () => {
    const { t } = useTranslation();
    const setLayoutMode = useStreamStore(s => s.setLayoutMode);
    const islandStyle = useUIStore(s => s.islandStyle);
    const streams = useStreamStore(s => s.streams);
    const canvasItems = useStreamStore(s => s.canvasItems);
    const updateCanvasLayout = useStreamStore(s => s.updateCanvasLayout);
    const removeCanvasItem = useStreamStore(s => s.removeCanvasItem);

    useEffect(() => {
        setLayoutMode('canvas');
    }, [setLayoutMode]);

    // 進入 canvas 時觸發一次本地收藏直播查詢:交給常駐的 GlobalLiveStatusChecker 處理
    // (checkNow 內有 isRefreshing 去重,不會與 5 分鐘背景輪詢重複,也不額外打未快取的 API)
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('refreshFavoritesStatus'));
    }, []);

    // Optimize: Preload Player APIs based on current streams
    useEffect(() => {
        if (streams.length > 0) {
            import('../../utils/apiLoader').then(({ apiLoader }) => {
                const urls = streams.map(s => s.originalUrl);
                apiLoader.preloadPlayerApisForUrls(urls);
            });
        }
    }, [streams]);

    // Convert canvasItems to SimpleCanvas windows format
    const windows: CanvasWindow[] = useMemo(() => {
        return canvasItems.map(item => ({
            id: item.i,
            gridX: item.layout.x,
            gridY: item.layout.y,
            gridW: item.layout.w,
            gridH: item.layout.h,
            contentId: item.contentId ?? undefined,
            type: item.type as 'stream' | 'chat',
            title: (() => {
                if (!item.contentId) return undefined;
                const stream = streams.find(s => s.id === item.contentId);
                return stream?.displayName || stream?.channelId;
            })()
        }));
    }, [canvasItems, streams]);

    // Handle window update
    const handleWindowUpdate = useCallback((updatedWindows: CanvasWindow[]) => {
        // Convert back to canvasItems layout format
        const layout = updatedWindows.map(w => ({
            i: w.id,
            x: w.gridX,
            y: w.gridY,
            w: w.gridW,
            h: w.gridH
        }));
        updateCanvasLayout(layout);
    }, [updateCanvasLayout]);

    // Handle window remove
    const handleWindowRemove = useCallback((id: string) => {
        const before = useStreamStore.getState().canvasItems;
        const removed = before.find(item => item.i === id);

        // removeCanvasItem handles stream removal internally based on closeWindowMode
        // DO NOT call removeStream separately - it causes duplicate removal and React Error #301
        removeCanvasItem(id);

        // 「保留空視窗」模式下視窗還在、畫布沒有洞，只有真的少一個才需要補。
        const after = useStreamStore.getState().canvasItems;
        if (!removed || after.length >= before.length) return;

        const rest: CanvasWindow[] = after.map(item => ({
            id: item.i,
            gridX: item.layout.x,
            gridY: item.layout.y,
            gridW: item.layout.w,
            gridH: item.layout.h,
            type: item.type as 'stream' | 'chat',
        }));

        // 直接掃描整張畫布把空白補掉——不必特別指定洞在哪，關掉視窗留下的洞會被掃到，
        // 順帶也會把先前補不動而殘留的空白一併消化。
        const filled = resolveChainFill(rest, {
            gridCols: GRID_COLS,
            limitsOf,
            // 多個方向都補得滿時，優先把空間讓給直播畫面——聊天室變寬沒有意義，
            // 而且它本來就有寬度上限
            prefer: w => (w.type === 'stream' ? 1 : 0),
        });

        // 完全補不動時 resolveChainFill 原樣回傳，這時不必多寫一次
        if (filled.some((w, i) => w !== rest[i])) {
            updateCanvasLayout(filled.map(w => ({
                i: w.id, x: w.gridX, y: w.gridY, w: w.gridW, h: w.gridH,
            })));
        }
    }, [removeCanvasItem, updateCanvasLayout]);

    // Render content for each window - now receives WindowRenderProps
    const renderContent = useCallback((window: CanvasWindow, renderProps: WindowRenderProps) => {
        // Callback to update window content (passed to EmptyWindow)
        const handleUpdateWindow = (id: string, updates: any) => {
            // DEBUG: trace canvas item update flow

            // We need a way to update the specific canvas item by its ID (window.id is the item.i)
            // useStreamStore's updateCanvasItem takes (itemId, updates)
            useStreamStore.getState().updateCanvasItem(id, updates);
        };

        if (!window.contentId) {
            return (
                <EmptyWindowContent
                    windowId={window.id}
                    type={window.type}
                    onUpdateWindow={handleUpdateWindow}
                    renderProps={renderProps}
                />
            );
        }

        const stream = streams.find(s => s.id === window.contentId);

        if (!stream) {
            // If stream not found but we have an ID, maybe render empty or error
            // Fallback to empty for now but keep ID just in case? 
            // Better to show "Stream Not Found" or reset.
            // Let's render EmptyWindowContent but maybe with a warning? 
            // Or just the placeholder text as before but cleaner.
            return (
                <div className="w-full h-full flex items-center justify-center text-white/50 text-sm bg-slate-900 border border-white/10 rounded-lg">
                    串流未找到 (ID: {window.contentId})
                </div>
            );
        }

        return (
            <CanvasStreamContent
                stream={stream}
                windowType={window.type}
                renderProps={renderProps}
                windowId={window.id} // Pass window ID for updates if needed
            />
        );
    }, [streams]);

    return (
        <div className="w-full h-screen bg-black overflow-hidden relative">
            <SEO title={t('seo:canvas.title')} description={t('seo:canvas.description')} url={SEO_CANVAS.url} />
            {/* Canvas Layer */}
            <div className="absolute inset-0 z-0">
                {windows.length === 0 && <CanvasEmptyState />}
                <SimpleCanvas
                    windows={windows}
                    onWindowUpdate={handleWindowUpdate}
                    onWindowRemove={handleWindowRemove}
                    renderContent={renderContent}
                />
            </div>

            {/* UI Layer (Dynamic Island) */}
            <div className="pointer-events-none absolute inset-0 z-50">
                {islandStyle === 'edgeDock' ? <DynamicIslandEdgeDock /> : <DynamicIsland />}
            </div>
        </div>
    );
};
