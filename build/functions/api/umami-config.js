// Cloudflare Pages Function: Umami 配置端點
// 此函數用於返回 Umami 追蹤設定
//
// 環境變數設定（在 Cloudflare Pages 的 Variables & Secrets 中設定）：
// - UMAMI_SCRIPT_URL: Umami script.js 的完整 URL
// - UMAMI_WEBSITE_ID: Umami 的 Website ID

/**
 * 處理 Umami 配置請求
 * @param {Object} context - 上下文對象
 * @returns {Promise<Response>} - JSON 回應
 */
export async function onRequestGet(context) {
    const { env } = context;

    try {
        const scriptUrl = env.UMAMI_SCRIPT_URL || null;
        const websiteId = env.UMAMI_WEBSITE_ID || null;

        return new Response(
            JSON.stringify({
                scriptUrl,
                websiteId,
            }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Cache-Control': 'public, max-age=3600'
                }
            }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({
                error: '伺服器錯誤',
                message: error.message || '處理請求時發生未知錯誤'
            }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            }
        );
    }
}

// 處理 OPTIONS 請求（CORS 預檢請求）
export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400'
        }
    });
}
