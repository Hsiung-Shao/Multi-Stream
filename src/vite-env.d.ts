/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
/** 教學內容（InstructionsPage + tutorial 文案）的 git 最後修改日 YYYY-MM-DD，vite.config define 注入 */
declare const __GUIDES_DATE_MODIFIED__: string;

/**
 * 全域 Window 擴充：GA4 / gtag.js + GTM dataLayer。
 *
 * 配合 src/utils/analytics.ts 使用。boot stub 在 index.html 中已初始化
 * window.dataLayer 與 window.gtag，這裡只是讓 TypeScript 知道型別。
 *
 * 放在 vite-env.d.ts(ambient script，非 module)是為了讓宣告自動全域可見，
 * 無需任何 import。不要在本檔加 `export {}`，否則會破壞 ambient 行為。
 */
interface Window {
    /**
     * gtag.js 全域函式。Boot stub 在 index.html 中設為 dataLayer.push 包裝；
     * mock 模式下會被 analytics.ts 的 installMockGtag() 改寫為 console.info。
     */
    gtag: (...args: unknown[]) => void;

    /**
     * GTM / GA4 共用的事件佇列。在 boot stub 中初始化為 []。
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer: any[];

}
