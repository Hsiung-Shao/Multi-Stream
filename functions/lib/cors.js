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
 * @param {{ methods?: string }} [opts] - 覆寫允許的 methods（預設 'GET, POST, OPTIONS'）
 * @returns {Object} headers 物件
 */
export function getCorsHeaders(request, opts = {}) {
    const origin = request?.headers?.get('Origin') || '';
    const isAllowed = isAllowedOrigin(origin);

    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_EXACT_ORIGINS[0],
        'Access-Control-Allow-Methods': opts.methods || 'GET, POST, OPTIONS',
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
 * @param {{ methods?: string }} [corsOpts] - 覆寫 CORS Allow-Methods
 * @returns {Response}
 */
export function jsonResponse(data, status, request, extraHeaders = {}, corsOpts = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(request, corsOpts),
            ...extraHeaders,
        },
    });
}

/**
 * 處理 OPTIONS 預檢請求
 * @param {Request} request
 * @param {{ methods?: string }} [opts] - 覆寫 CORS Allow-Methods（admin endpoints 需要 PUT/DELETE）
 * @returns {Response}
 */
export function handleOptions(request, opts = {}) {
    return new Response(null, {
        status: 204,
        headers: {
            ...getCorsHeaders(request, opts),
            'Access-Control-Max-Age': '86400',
        },
    });
}

/**
 * JSON body 守門:Content-Type 檢查 + Content-Length 上限 + parse
 * @param {Request} request
 * @param {number} maxBytes - body 大小上限
 * @returns {Promise<{ ok: true, body: any } | { ok: false, response: Response }>}
 */
export async function readJsonBody(request, maxBytes) {
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
        return { ok: false, response: jsonResponse({ ok: false, error: 'invalid_content_type' }, 400, request) };
    }
    const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (contentLength > maxBytes) {
        return { ok: false, response: jsonResponse({ ok: false, error: 'body_too_large' }, 413, request) };
    }
    try {
        const body = await request.json();
        return { ok: true, body };
    } catch {
        return { ok: false, response: jsonResponse({ ok: false, error: 'invalid_json' }, 400, request) };
    }
}
