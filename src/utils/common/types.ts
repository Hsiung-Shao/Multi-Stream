/**
 * Common Utilities Contract
 * 
 * 定義 js/utils.js 遷移至 TypeScript 的介面規範。
 * 包含全域狀態管理與 DOM 輔助函式。
 */

export interface ICommonUtils {
    /**
     * 獲取有效的 parent 域名（用於 Twitch/YouTube 嵌入）
     * 處理 localhost, file:// 與實際域名。
     */
    getParentDomain(): string;

    /**
     * 獲取 Twitch parent 陣列
     * 回傳符合 Twitch CSP 的 parent 列表。
     */
    getTwitchParents(): string[];
}

/**
 * 全域狀態契約
 * 這些狀態目前由 legacy js/utils.js 維護，
 * 遷移後必須暴露在 window 上以供舊版程式碼存取。
 */
export interface ILegacyGlobalState {
    /**
     * 拖曳狀態標誌
     * 當使用者正在拖曳視窗時為 true，防止觸發其他布局更新。
     * 原 js/utils.js: let isDraggingStreamBox
     * 引用者: layout.js, drag-resize.js
     */
    isDraggingStreamBox: boolean;

    /**
     * YouTube API 準備就緒標誌
     * 原 js/utils.js: let ytApiReady
     * 註：經盤點此變數似乎未被讀取，建議棄用。
     * @deprecated
     */
    ytApiReady: boolean;
}

// 擴充 Window 介面以包含傳統全域變數
declare global {
    interface Window {
        // Security functions usually exposed globally for settings.js
        escapeHtml?: (text: any) => string;
        safeJSONParse?: <T>(str: string | null | undefined, defaultValue: T) => T;

        // Utils functions
        getParentDomain?: () => string;
        getTwitchParents?: () => string[];

        // Global State (Legacy)
        // 注意：原始 js/utils.js 使用 top-level let 宣告，不一定掛載在 window 上，
        // 但若要從模組化系統 polyfill 回去，必須掛載到 window 並確保 legacy code 能讀取。
        // 若 legacy code 依賴 script 共享 scope，則 window 掛載是唯一解法。
        isDraggingStreamBox?: boolean;
    }
}
