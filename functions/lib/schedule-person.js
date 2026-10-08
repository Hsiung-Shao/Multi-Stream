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
// v2：found 多了 youtube／twitch／streams（舊格式的快取不會被讀到，最多 300 秒後自然過期）
const CACHE_ORIGIN = 'https://multistreaming.org/__edge-cache/schedule-person/v2/';
/** 與頁面一致的時間範圍（src/features/schedule/personSource.ts、filters.ts；migration refresh_schedule_indexable 也用同一組） */
export const PERSON_RECENT_DAYS = 90;
export const PERSON_UPCOMING_DAYS = 7;
export const UPCOMING_GRACE_MS = 15 * 60 * 1000;
/** body 內文最多列幾場（接下來／最近各自） */
export const PERSON_BODY_LIST_LIMIT = 10;
/** 直播中＋排程最多取幾列（與頁面 personSource.ts 的 ACTIVE_LIMIT 一致） */
export const PERSON_ACTIVE_LIMIT = 100;
/** 可索引但場次資料拿不到時的快取秒數：短一點，別讓暫時失敗的薄內容掛 5 分鐘 */
export const PERSON_DEGRADED_CACHE_TTL_S = 30;
const DAY_MS = 86_400_000;
const YT_CHANNEL_RE = /^UC[A-Za-z0-9_-]{22}$/;
const TWITCH_LOGIN_RE = /^[A-Za-z0-9_]{3,25}$/;
const STREAM_COLS = 'title,status,platform,scheduled_start,actual_start,actual_end';

/**
 * 預設查詢：anon key 走 PostgREST（vtubers 與 streams 本來就公開可讀，不需要 service_role）＋逾時。
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

/**
 * 一支查詢拿齊本人資料與內文要的場次（嵌入三個 streams 別名：直播中／排程、近 90 天結束、近 90 天結束的總數），
 * 查無此人、不可索引的頁也只花這一支 subrequest。場次條件與頁面 personSource.ts 相同（週表框、被合併的列不列）；
 * active 上限與頁面 ACTIVE_LIMIT 一致，最近只取內文要列的 10 筆，總數另外 count。
 */
export function personQuery(slug, now) {
    const since = encodeURIComponent(new Date(now - PERSON_RECENT_DAYS * DAY_MS).toISOString());
    const visible = (alias) => `&${alias}.is_schedule_frame=eq.false&${alias}.merged_with=is.null`;
    const ended = (alias) => `${visible(alias)}&${alias}.status=eq.ended&${alias}.actual_end=gte.${since}`;
    return `vtubers?select=name,img_url,schedule_indexable,youtube_channel_id,twitch_channel_id,`
        + `active:streams(${STREAM_COLS}),recent:streams(${STREAM_COLS}),recent_count:streams(count)`
        + `&slug=eq.${encodeURIComponent(slug)}&limit=1`
        + `${visible('active')}&active.status=in.(scheduled,live)&active.order=scheduled_start.asc.nullsfirst&active.limit=${PERSON_ACTIVE_LIMIT}`
        + `${ended('recent')}&recent.order=actual_end.desc&recent.limit=${PERSON_BODY_LIST_LIMIT}`
        + ended('recent_count');
}

/**
 * 從 personQuery 的那一列整理出內文要的場次：{ live, upcoming, recent, recentTotal, upcomingTotal }；
 * 嵌入資料形狀不對（理論上不會）回 null，呼叫端只輸出基本資訊。
 */
export function personStreamsFromRow(row, now) {
    if (!Array.isArray(row?.active) || !Array.isArray(row?.recent)) return null;
    const until = now + PERSON_UPCOMING_DAYS * DAY_MS;
    const live = [];
    const upcoming = [];
    for (const s of row.active) {
        if (!s || typeof s !== 'object') continue;
        if (s.status === 'live') live.push(pickStream(s));
        else if (s.status === 'scheduled') {
            const t = Date.parse(s.scheduled_start);
            if (Number.isFinite(t) && t + UPCOMING_GRACE_MS >= now && t <= until) upcoming.push(pickStream(s));
        }
    }
    const recent = row.recent.filter((s) => s && typeof s === 'object' && s.actual_end).map(pickStream);
    const total = Number(row.recent_count?.[0]?.count);
    return {
        live: live.slice(0, PERSON_BODY_LIST_LIMIT),
        upcoming: upcoming.slice(0, PERSON_BODY_LIST_LIMIT),
        recent,
        recentTotal: Number.isFinite(total) ? total : recent.length,
        upcomingTotal: upcoming.length,
    };
}

function pickStream(s) {
    return {
        title: typeof s.title === 'string' ? s.title.slice(0, 300) : '',
        platform: s.platform === 'twitch' ? 'twitch' : 'youtube',
        start: s.actual_start ?? s.scheduled_start ?? null,
    };
}

export const SCHEDULE_PERSON_SEO = {
    'zh-TW': {
        title: '{{name}} 開台時間與直播週表 - MultiStream Hub',
        description: '{{name}} 的開台週表：正在直播、接下來 7 天的待機室與 Twitch 週表，以及最近 90 天的直播紀錄。',
    },
    en: {
        title: '{{name}} stream schedule and live times - MultiStream Hub',
        description: '{{name}}’s stream schedule: live now, YouTube waiting rooms and Twitch schedule for the next 7 days, and streams from the last 90 days.',
    },
};

/**
 * YouTube 頭像（yt3.ggpht.com／yt3.googleusercontent.com）網址帶尺寸參數 =s88-…，
 * 當 og:image 或大頭像太小；改成 400px。其他來源原樣回傳。與 src/features/schedule/streamLinks.ts 的 largerAvatar 相同。
 */
export function largerAvatar(url) {
    return /^https:\/\/yt3\.(ggpht|googleusercontent)\.com\//.test(url) ? url.replace(/=s\d+-/, '=s400-') : url;
}

/**
 * 個人頁 body 內文的文案。與 src/i18n/locales/{zh-TW,en}/schedule.ts 同 key 的值一致（測試鎖）：
 * schedule＝title、live＝person.live、upcoming＝person.upcoming、recent＝person.recent、
 * youtube／twitch＝person.openYouTube／person.openTwitch、summary＝person.seo.summary。
 * tz 只有 edge 用（前端依裝置時區顯示，不需要標）。
 */
export const SCHEDULE_PERSON_BODY = {
    'zh-TW': {
        schedule: '開台週表',
        live: '正在直播',
        upcoming: '接下來 7 天',
        recent: '最近 90 天',
        youtube: 'YouTube 頻道',
        twitch: 'Twitch 頻道',
        summary: '{{name}}：近 90 天開台 {{recent}} 次，接下來 7 天有 {{upcoming}} 場排程。',
        tz: '時間為台北時間（UTC+8）',
        locale: 'zh-TW',
    },
    en: {
        schedule: 'Stream Schedule',
        live: 'Live now',
        upcoming: 'Next 7 days',
        recent: 'Last 90 days',
        youtube: 'YouTube channel',
        twitch: 'Twitch channel',
        summary: '{{name}} — streams in the last 90 days: {{recent}}; scheduled in the next 7 days: {{upcoming}}.',
        tz: 'Times are in Taipei time (UTC+8)',
        locale: 'en-US',
    },
};

const fillVars = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));

/** 依語言產生個人頁的 title／description；有場次資料時 description 最前面放一句場次摘要（每頁內容不同） */
export function schedulePersonMeta(lang, name, streams = null) {
    const tpl = SCHEDULE_PERSON_SEO[lang] ?? SCHEDULE_PERSON_SEO.en;
    const fill = (s) => s.split('{{name}}').join(name);
    // 摘要句放最前面：搜尋結果約 155 字就截斷，每頁不同的那句不能被截掉
    const description = streams ? `${personSummary(lang, name, streams)} ${fill(tpl.description)}` : fill(tpl.description);
    return { title: fill(tpl.title), description };
}

/** 場次摘要句：近 90 天開台 N 次，接下來 7 天有 K 場排程 */
export function personSummary(lang, name, streams) {
    const t = SCHEDULE_PERSON_BODY[lang] ?? SCHEDULE_PERSON_BODY.en;
    return fillVars(t.summary, { name, recent: streams.recentTotal ?? streams.recent.length, upcoming: streams.upcomingTotal ?? streams.upcoming.length });
}

export function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// 台北時間（台灣沒有日光節約）；formatter 依語言各建一次
const TIME_FMT = {
    'zh-TW': new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }),
    en: new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }),
};

function streamItem(lang, s) {
    const fmt = TIME_FMT[lang] ?? TIME_FMT.en;
    const t = s.start ? Date.parse(s.start) : NaN;
    const when = Number.isFinite(t) ? `<time datetime="${escapeHtml(new Date(t).toISOString())}">${escapeHtml(fmt.format(t))}</time> ` : '';
    const platform = s.platform === 'twitch' ? 'Twitch' : 'YouTube';
    return `<li>${when}${escapeHtml(s.title || platform)}（${platform}）</li>`;
}

function streamSection(heading, items) {
    if (!items.length) return '';
    return `<section class="mt-8"><h2 class="text-lg font-semibold">${escapeHtml(heading)}</h2><ul class="mt-2 space-y-1 text-sm">${items.join('')}</ul></section>`;
}

/**
 * 個人頁的 body 內文（放進 <div id="root">，讓不跑 JS 的爬蟲與第一波索引看得到這一頁獨有的內容）。
 * 前端掛載時 #root 會被 replaceChildren() 清掉再 createRoot（src/main.tsx 的 canHydrate：shell 沒有 data-prerender-lang），
 * 所以這段不必和 React 輸出一致；外層 min-h-svh 讓 React 接手前後頁尾位置不跳。
 * 所有資料庫字串都經 escapeHtml。
 */
export function renderPersonBodyHtml(lang, person, slug) {
    const t = SCHEDULE_PERSON_BODY[lang] ?? SCHEDULE_PERSON_BODY.en;
    const name = escapeHtml(person.name);
    const parts = [
        `<nav aria-label="breadcrumb" class="text-sm text-muted-foreground"><a href="/">MultiStream Hub</a> › <a href="/schedule">${escapeHtml(t.schedule)}</a> › <a href="/schedule/${escapeHtml(slug)}" aria-current="page">${name}</a></nav>`,
        `<h1 class="mt-4 text-3xl font-bold">${name}</h1>`,
    ];
    const s = person.streams;
    if (s) {
        parts.push(`<p class="mt-2 text-muted-foreground">${escapeHtml(personSummary(lang, person.name, s))}</p>`);
        parts.push(streamSection(t.live, s.live.map((x) => streamItem(lang, x))));
        parts.push(streamSection(t.upcoming, s.upcoming.map((x) => streamItem(lang, x))));
        parts.push(streamSection(t.recent, s.recent.map((x) => streamItem(lang, x))));
        if (s.live.length || s.upcoming.length || s.recent.length) parts.push(`<p><small>${escapeHtml(t.tz)}</small></p>`);
    }
    const links = [];
    if (person.youtube) links.push(`<a href="https://www.youtube.com/channel/${escapeHtml(person.youtube)}" rel="noopener" target="_blank">${escapeHtml(t.youtube)}</a>`);
    if (person.twitch) links.push(`<a href="https://www.twitch.tv/${escapeHtml(person.twitch)}" rel="noopener" target="_blank">${escapeHtml(t.twitch)}</a>`);
    if (links.length) parts.push(`<p class="mt-8 text-sm">${links.join(' · ')}</p>`);
    return `<div class="min-h-svh"><main class="mx-auto max-w-5xl px-4 py-8">${parts.filter(Boolean).join('')}</main></div>`;
}

/**
 * 解析 /schedule/<slug>：
 *   - { kind: 'none' }：不是個人頁網址（交回原本的白名單流程）
 *   - { kind: 'redirect', location }：大小寫或百分比編碼和正規網址不同 → 301（canonical 只有一個）
 *   - { kind: 'notfound' }：slug 不合規則或查無此人 → 真 404
 *   - { kind: 'found', name, image, indexable, youtube, twitch, streams }（streams 見 personStreamsFromRow；不可索引或嵌入資料異常為 null；查詢失敗整個回 error）
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

    const now = Date.now();
    const res = await queryFn(env, personQuery(slug, now));
    if (!res.ok || !Array.isArray(res.data)) return { kind: 'error' };
    const row = res.data[0];
    let result = { kind: 'notfound' };
    if (row) {
        const indexable = row.schedule_indexable === true;
        result = {
            kind: 'found',
            name: String(row.name),
            image: typeof row.img_url === 'string' && /^https:\/\//.test(row.img_url) ? largerAvatar(row.img_url) : null,
            indexable,
            youtube: typeof row.youtube_channel_id === 'string' && YT_CHANNEL_RE.test(row.youtube_channel_id) ? row.youtube_channel_id : null,
            twitch: typeof row.twitch_channel_id === 'string' && TWITCH_LOGIN_RE.test(row.twitch_channel_id) ? row.twitch_channel_id.toLowerCase() : null,
            // 內文是給搜尋引擎的：noindex 頁不放場次
            streams: indexable ? personStreamsFromRow(row, now) : null,
        };
    }
    if (cache) {
        // 可索引卻沒拿到場次（嵌入資料異常）時短暫快取，別讓暫時的薄內容掛滿 5 分鐘
        const ttl = result.kind === 'found' && result.indexable && !result.streams ? PERSON_DEGRADED_CACHE_TTL_S : PERSON_CACHE_TTL_S;
        const body = new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` },
        });
        await cache.put(cacheKey, body).catch(() => {});
    }
    return result;
}
