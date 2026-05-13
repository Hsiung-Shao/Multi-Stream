/**
 * Global type augmentations for GA4 / gtag.js + GTM dataLayer。
 *
 * 配合 src/utils/analytics.ts 使用。boot stub 在 index.html 中已初始化
 * window.dataLayer 與 window.gtag，這裡只是讓 TypeScript 知道型別。
 */

declare global {
    interface Window {
        /**
         * gtag.js 全域函式。Boot stub 在 index.html 中設為 dataLayer.push 包裝；
         * mock 模式下會被 analytics.ts 的 installMockGtag() 改寫為 console.info。
         *
         * 標準呼叫形式：
         *   gtag('js', new Date())
         *   gtag('config', 'G-XXXX', { send_page_view: false })
         *   gtag('event', 'apply_preset', { preset_name, stream_count })
         *   gtag('set', 'user_properties', { visitor_type: 'returning' })
         */
        gtag: (...args: unknown[]) => void;

        /**
         * GTM / GA4 共用的事件佇列。在 boot stub 中初始化為 [].
         */
        dataLayer: unknown[];

        // 既有 IdentityManager 用到的全域（保留）
        __MS_USER_UUID__?: string;
        __MS_LOAD_BACKUP__?: () => Promise<unknown>;
        __MS_RESTORE_BACKUP__?: (backup: unknown) => void;
    }
}

// 必要：讓 .d.ts 被視為 module，否則 declare global 不生效
export {};
