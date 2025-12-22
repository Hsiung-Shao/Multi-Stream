/**
 * Security Utilities Contract
 * 
 * 定義 js/security.js 遷移至 TypeScript 的介面規範。
 * 這些函式主要用於防禦 XSS 與安全資料處理。
 */

export interface ISecurityUtils {
    /**
     * HTML 轉義函數（防止 XSS）
     * 將特殊字符轉換為 HTML 實體。
     * @param text 任意輸入（通常為字串）
     * @returns 轉義後的字串
     */
    escapeHtml(text: any): string;

    /**
     * 安全的 JSON 解析（帶錯誤處理）
     * 封裝 JSON.parse，發生錯誤時返回默認值。
     * @param str JSON 字串
     * @param defaultValue 解析失敗時的默認值
     * @returns 解析後的物件或默認值
     */
    safeJSONParse<T>(str: string | null | undefined, defaultValue: T): T;

    /**
     * 驗證頻道 ID
     * 僅允許字母、數字、底線、連字號，防止注入攻擊。
     * @param id 頻道 ID
     */
    validateChannelId(id: string): boolean;

    /**
     * 驗證影片 ID
     * 僅允許字母、數字、底線、連字號，防止注入攻擊。
     * @param id 影片 ID
     */
    validateVideoId(id: string): boolean;
}

// 注意: validateUrl 已經在 src/utils/streamUtils.ts 中定義與實作
// 未來 SecurityUtils 可能會直接引用該實作或重新導出
