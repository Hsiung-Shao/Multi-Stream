import { useEffect } from 'react';
import { useUIStore } from '../store/useUIStore';

/**
 * Hook to manage theme system side effects.
 * Synchonizes the theme state from useUIStore to the document's classList and meta tags.
 */
export function useThemeSystem() {
    const theme = useUIStore((state) => state.theme);

    useEffect(() => {
        const root = window.document.documentElement;

        // Remove both potential classes first to be clean (though usually we just toggle dark)
        root.classList.remove('light', 'dark');

        // Add the current theme class
        root.classList.add(theme);

        // Update meta theme-color for mobile browsers if needed
        // const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        // if (metaThemeColor) {
        //     metaThemeColor.setAttribute('content', theme === 'dark' ? '#030712' : '#ffffff');
        // }
    }, [theme]);
}
