// 共用 CORS 工具函式
// 限制 API 只接受來自允許的 origin 的請求

const ALLOWED_ORIGINS = [
    'https://multistreaming.org',
    'https://www.multistreaming.org',
];

// 本地開發時允許 localhost
if (typeof globalThis !== 'undefined') {
    // Cloudflare Workers/Pages 中無法判斷 NODE_ENV，
    // 改以 origin 比對 localhost pattern 處理
}

/**
 * 取得 CORS headers
 * @param {Request} request
 * @returns {Object} headers 物件
 */
export function getCorsHeaders(request) {
    const origin = request?.headers?.get('Origin') || '';
    const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
    const isAllowed = ALLOWED_ORIGINS.includes(origin) || isLocalhost;

    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

/**
 * 產生 JSON Response
 * @param {Object} data - 回應資料
 * @param {number} status - HTTP status code
 * @param {Request} request - 原始請求（用於 CORS）
 * @param {Object} extraHeaders - 額外 headers
 * @returns {Response}
 */
export function jsonResponse(data, status, request, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(request),
            ...extraHeaders,
        },
    });
}

/**
 * 處理 OPTIONS 預檢請求
 * @param {Request} request
 * @returns {Response}
 */
export function handleOptions(request) {
    return new Response(null, {
        status: 204,
        headers: {
            ...getCorsHeaders(request),
            'Access-Control-Max-Age': '86400',
        },
    });
}
