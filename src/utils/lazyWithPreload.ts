import { lazy, createElement, type ComponentProps, type ComponentType, type ReactElement } from 'react';

type Loader<T> = () => Promise<{ default: T }>;

export type PreloadableComponent<T extends ComponentType<any>> = ((props: ComponentProps<T>) => ReactElement) & {
    /** 先把 chunk 載好；之後 render 直接用已解析的元件，不再經過 React.lazy（不會 suspend） */
    preload: () => Promise<void>;
    /** preload() 已完成 → render 不會 suspend，呼叫端可以不包 Suspense（App.tsx ChunkSuspense） */
    isLoaded: () => boolean;
};

/**
 * React.lazy 的替身，多一個 preload()。
 *
 * 為什麼需要：hydrate 預渲染 HTML（main.tsx）時，若頁面元件仍是 lazy，第一輪 hydration 會 suspend、
 * 留下 dehydrated 的 Suspense 邊界；緊接著 zustand 的 client snapshot ≠ server snapshot 觸發同步更新，
 * React 會放棄 hydrate 那個邊界改走 client render（Minified React error #421）→ 閃 Loading。
 * 只要在 hydrateRoot 之前 await preload()，render 時就走已解析的元件，整棵樹一輪 hydrate 完。
 *
 * 沒 preload 的情況（一般 CSR 切頁）行為與 React.lazy 完全相同。
 */
export function lazyWithPreload<T extends ComponentType<any>>(loader: Loader<T>): PreloadableComponent<T> {
    let resolved: T | null = null;
    let pending: Promise<void> | null = null;
    const Lazy = lazy(loader);
    const Component = ((props: ComponentProps<T>) =>
        createElement((resolved ?? Lazy) as ComponentType<any>, props)) as PreloadableComponent<T>;
    Component.preload = () => {
        pending ??= loader().then((m) => {
            resolved = m.default;
        });
        return pending;
    };
    Component.isLoaded = () => resolved !== null;
    return Component;
}
