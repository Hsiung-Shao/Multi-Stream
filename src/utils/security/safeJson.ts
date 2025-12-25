/**
 * 安全的 JSON 解析（帶錯誤處理）
 * 對應 legacy: js/security.js - safeJSONParse
 */
export function safeJSONParse<T>(str: string | null | undefined, defaultValue: T): T {
    if (!str || typeof str !== 'string') {
        return defaultValue;
    }
    try {
        return JSON.parse(str);
    } catch (e) {
        // JSON parse error，靜默處理
        return defaultValue;
    }
}
