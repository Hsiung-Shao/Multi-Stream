// 個人週表頁 /schedule/<slug> 的 edge 端解析（catch-all functions/[[path]].js 與 sitemap-schedule.xml.js 共用）。
//
// 與 src/config/schedulePerson.ts 同一套規則（slug 字元集＝資料庫 CHECK vtubers_slug_format），
// 文案與 src/i18n/locales/{zh-TW,en}/schedule.ts 的 person.seo.* 同步；tests/functions/schedulePersonEdge.test.ts 鎖住兩邊。
// functions 無法 import src/ 的 TS，所以這裡是複本。
export const SCHEDULE_SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const PERSON_PATH_RE = /^\/schedule\/([^/]+)$/;
/** DB 查詢逾時：超過就當暫時錯誤回 SPA 殼，不讓 HTML 首位元組跟著卡住 */
export const PERSON_QUERY_TIMEOUT_MS = 2000;
/** 查詢結果（含查無此人）在 edge 快取的秒數：擋住重複請求與隨機 slug 掃描放大成 DB 負載 */
export const PERSON_CACHE_TTL_S = 300;
const CACHE_ORIGIN = 'https://multistreaming.org/__edge-cache/schedule-person/';

/**
 * 預設查詢：anon key 走 PostgREST（vtubers 本來就公開可讀，不需要 service_role）＋逾時。
 * 回傳 { ok, data }，失敗或逾時 ok=false。
 */
export async function anonSelect(env, path) {
    if (!env || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return { ok: false, data: null };
    try {
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
            headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(PERSON_QUERY_TIMEOUT_MS),
        });
        if (!res.ok) return { ok: false, data: null };
        return { ok: true, data: await res.json() };
    } catch {
        return { ok: false, data: null };
    }
}

export const SCHEDULE_PERSON_SEO = {
    'zh-TW': {
        title: '{{name}} 開台時間與直播週表 - MultiStream Hub',
        description: '{{name}} 的開台週表：正在直播、接下來 7 天的待機室與 Twitch 週表，以及最近 30 天的直播紀錄。',
    },
    en: {
        title: '{{name}} stream schedule and live times - MultiStream Hub',
        description: '{{name}}’s stream schedule: live now, YouTube waiting rooms and Twitch schedule for the next 7 days, and streams from the last 30 days.',
    },
};

/**
 * YouTube 頭像（yt3.ggpht.com／yt3.googleusercontent.com）網址帶尺寸參數 =s88-…，
 * 當 og:image 或大頭像太小；改成 400px。其他來源原樣回傳。與 src/features/schedule/streamLinks.ts 的 largerAvatar 相同。
 */
export function largerAvatar(url) {
    return /^https:\/\/yt3\.(ggpht|googleusercontent)\.com\//.test(url) ? url.replace(/=s\d+-/, '=s400-') : url;
}

/** 依語言產生個人頁的 title／description */
export function schedulePersonMeta(lang, name) {
    const tpl = SCHEDULE_PERSON_SEO[lang] ?? SCHEDULE_PERSON_SEO.en;
    const fill = (s) => s.split('{{name}}').join(name);
    return { title: fill(tpl.title), description: fill(tpl.description) };
}

/**
 * 解析 /schedule/<slug>：
 *   - { kind: 'none' }：不是個人頁網址（交回原本的白名單流程）
 *   - { kind: 'redirect', location }：大小寫或百分比編碼和正規網址不同 → 301（canonical 只有一個）
 *   - { kind: 'notfound' }：slug 不合規則或查無此人 → 真 404
 *   - { kind: 'found', name, image, indexable }
 *   - { kind: 'error' }：查詢失敗或逾時 → 呼叫端照常回 SPA 殼（不能因暫時性錯誤回 404 或 noindex）
 * found／notfound 會放進 edge 快取（cache 為 caches.default；測試或沒有 Cache API 時傳 null）。
 */
export async function resolveSchedulePerson(env, rawPath, queryFn = anonSelect, cache = globalThis.caches?.default ?? null) {
    const m = PERSON_PATH_RE.exec(rawPath);
    if (!m) return { kind: 'none' };
    let slug;
    try {
        slug = decodeURIComponent(m[1]).toLowerCase();
    } catch {
        return { kind: 'notfound' };
    }
    if (!SCHEDULE_SLUG_RE.test(slug)) return { kind: 'notfound' };
    if (m[1] !== slug) return { kind: 'redirect', location: `/schedule/${slug}` };

    const cacheKey = new Request(CACHE_ORIGIN + slug);
    if (cache) {
        const hit = await cache.match(cacheKey).catch(() => null);
        if (hit) {
            const cached = await hit.json().catch(() => null);
            if (cached && (cached.kind === 'found' || cached.kind === 'notfound')) return cached;
        }
    }

    const res = await queryFn(env, `vtubers?select=name,img_url,schedule_indexable&slug=eq.${encodeURIComponent(slug)}&limit=1`);
    if (!res.ok || !Array.isArray(res.data)) return { kind: 'error' };
    const row = res.data[0];
    const result = row
        ? {
              kind: 'found',
              name: String(row.name),
              image: typeof row.img_url === 'string' && /^https:\/\//.test(row.img_url) ? largerAvatar(row.img_url) : null,
              indexable: row.schedule_indexable === true,
          }
        : { kind: 'notfound' };
    if (cache) {
        const body = new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${PERSON_CACHE_TTL_S}` },
        });
        await cache.put(cacheKey, body).catch(() => {});
    }
    return result;
}
