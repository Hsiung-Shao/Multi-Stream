// 共用 CORS 工具函式
// 限制 API 只接受來自允許的 origin 的請求

const ALLOWED_EXACT_ORIGINS = [
    'https://multistreaming.org',
    'https://www.multistreaming.org',
];

// 允許 Cloudflare Pages preview deploy 的子網域（每個 build hash 不同，用 suffix 比對）
const ALLOWED_SUFFIXES = [
    '.mutli-stream.pages.dev', // 注意：專案名是 mutli-stream（拼寫保留）
];

function isAllowedOrigin(origin) {
    if (!origin) return false;
    if (ALLOWED_EXACT_ORIGINS.includes(origin)) return true;
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return true;
    // https://<hash>.mutli-stream.pages.dev / https://mutli-stream.pages.dev
    try {
        const u = new URL(origin);
        if (u.protocol !== 'https:') return false;
        return ALLOWED_SUFFIXES.some(suffix =>
            u.hostname === suffix.slice(1) || u.hostname.endsWith(suffix)
        );
    } catch {
        return false;
    }
}

/**
 * 取得 CORS headers
 * @param {Request} request
 * @returns {Object} headers 物件
 */
export function getCorsHeaders(request) {
    const origin = request?.headers?.get('Origin') || '';
    const isAllowed = isAllowedOrigin(origin);

    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_EXACT_ORIGINS[0],
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Vary': 'Origin',
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
