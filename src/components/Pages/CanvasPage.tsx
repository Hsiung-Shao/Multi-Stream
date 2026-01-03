

import { DynamicIsland } from '../Navigation/DynamicIsland';
import { CanvasContainer } from '../Canvas/CanvasContainer';

export const CanvasPage = () => {
    return (
        <div className="w-full h-screen bg-black overflow-hidden relative">
            {/* Canvas Layer */}
            <div className="absolute inset-0 z-0">
                <CanvasContainer />
            </div>

            {/* UI Layer (Dynamic Island) */}
            <div className="pointer-events-none absolute inset-0 z-50">
                {/* Dynamic Island handles its own pointer events and fixed positioning */}
                <DynamicIsland />
            </div>
        </div>
    );
};
