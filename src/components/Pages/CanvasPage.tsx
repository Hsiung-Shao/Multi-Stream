

import { DynamicIsland } from '../Navigation/DynamicIsland';

/**
 * Phase 1: 基礎建設 - CanvasPage
 * 
 * TODO: 
 * - Implement 24x24 grid background
 * - Implement canvas item rendering
 */
export const CanvasPage = () => {
    return (
        <div className="w-full h-screen bg-gray-950 overflow-hidden relative">
            <div className="absolute inset-0 flex items-center justify-center text-white/20 pointer-events-none select-none">
                <h1 className="text-4xl font-bold">Infinite Canvas (Preview)</h1>
            </div>

            {/* 動態島導航 */}
            <DynamicIsland />
        </div>
    );
};
