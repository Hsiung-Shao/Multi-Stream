import { useCallback, useSyncExternalStore } from "react";

/**
 * 第一次 render 就讀 matchMedia 當下結果：若先回 false 再於 effect 改正，
 * 窄橫向視窗的手機殼層會先畫成直向（有 header）再跳成橫向，量到 CLS 0.66。
 * 伺服器端（預渲染）與 hydrate 第一輪固定 false，與預渲染 HTML 一致。
 */
export function useMediaQuery(query: string) {
    const subscribe = useCallback((onChange: () => void) => {
        const result = matchMedia(query);
        result.addEventListener("change", onChange);
        return () => result.removeEventListener("change", onChange);
    }, [query]);

    return useSyncExternalStore(
        subscribe,
        () => matchMedia(query).matches,
        () => false,
    );
}
