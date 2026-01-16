import { useEffect } from 'react';
import { useLiveStatusCheck } from '../useLiveStatusCheck';

/**
 * A headless component that listens for 'refreshFavoritesStatus' events
 * and triggers the global live status check logic.
 * 
 * This should be mounted at a high level (e.g., App.tsx or NewCanvasPage)
 * to ensure background checks work even when ControlPanel is hidden.
 */
export const GlobalLiveStatusChecker = () => {
    const { checkNow } = useLiveStatusCheck();

    useEffect(() => {
        const handleRefresh = () => {

            checkNow();
        };

        window.addEventListener('refreshFavoritesStatus', handleRefresh);

        return () => {
            window.removeEventListener('refreshFavoritesStatus', handleRefresh);
        };
    }, [checkNow]);

    // Optional: Render a tiny indicator if debugging, but mostly headless
    return null;
};
