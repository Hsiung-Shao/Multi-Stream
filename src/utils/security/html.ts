/**
 * HTML 轉義函數（防止 XSS）
 * 對應 legacy: js/security.js - escapeHtml
 * 
 * 注意：Legacy 實作使用 DOM (document.createElement)，這裡使用 Regex 實作以支援 Node 環境與提升效能。
 * 行為上對齊標準 HTML Entity 轉換。
 */
export function escapeHtml(text: any): string {
    if (text == null || text === undefined) return '';
    // 確保是字串類型
    const str = String(text);

    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
