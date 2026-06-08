// System logger：寫入 public.system_logs（取代 console）
// 純 fire-and-forget，不阻塞主流程；本身失敗就 swallow（避免無限循環）

import { insert } from './supabase-server.js';

/**
 * 寫一筆系統 log
 * @param {Object} env - Cloudflare Function env
 * @param {'info'|'warn'|'error'} level
 * @param {string} source - 例：'review-contribution'
 * @param {string} message
 * @param {Object} [opts]
 * @param {Object} [opts.metadata]
 * @param {string} [opts.requestIp]
 * @param {string} [opts.userId]
 * @returns {Promise<void>}
 */
export async function log(env, level, source, message, opts = {}) {
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return;
    try {
        await insert(env, 'system_logs', {
            level,
            source: String(source).slice(0, 100),
            message: String(message).slice(0, 1000),
            metadata: opts.metadata || null,
            request_ip: opts.requestIp ? String(opts.requestIp).slice(0, 64) : null,
            user_id: opts.userId || null,
        });
    } catch {
        // 寫 log 本身失敗不可拋，否則會干擾主流程或無限循環
    }
}

export const logInfo = (env, source, message, opts) => log(env, 'info', source, message, opts);
export const logWarn = (env, source, message, opts) => log(env, 'warn', source, message, opts);
export const logError = (env, source, message, opts) => log(env, 'error', source, message, opts);
