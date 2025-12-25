import { validateUrl as validateStreamUrl } from '../streamUtils';

/**
 * 驗證頻道 ID/視頻 ID
 * 對應 legacy: js/security.js
 */

/**
 * 驗證頻道 ID（只允許字母、數字、下劃線和連字符）
 * 增強版本：更嚴格的驗證以防止注入攻擊
 */
export function validateChannelId(id: string | null | undefined): boolean {
    if (!id || typeof id !== 'string') {
        return false;
    }
    // 移除前後空白
    const trimmed = id.trim();
    if (trimmed.length === 0 || trimmed.length > 100) {
        return false;
    }
    // 只允許字母、數字、下劃線、連字符
    // 禁止任何可能的注入字符（如 < > " ' / \ 等）
    return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

/**
 * 驗證視頻 ID（YouTube 視頻 ID 格式）
 * 增強版本：更嚴格的驗證以防止注入攻擊
 */
export function validateVideoId(id: string | null | undefined): boolean {
    if (!id || typeof id !== 'string') {
        return false;
    }
    // 移除前後空白
    const trimmed = id.trim();
    if (trimmed.length === 0 || trimmed.length > 100) {
        return false;
    }
    // YouTube 視頻 ID 通常是 11 個字符，但允許更短或更長
    return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

// Re-export validateUrl for convenience and grouping
// Note: legacy validateUrl returns {valid, error, urlObj}, streamUtils returns the same interface.
export const validateUrl = validateStreamUrl;
