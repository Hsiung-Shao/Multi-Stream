// VTuber 投稿與資料回報的共用邏輯（純函式為主，方便測試）：
//   - YouTube 頻道網址解析、頻道頁前段查詢（名稱、頭像、channelId；零 API 配額）
//   - 社群網址正規化（只收 https、限定網域；與 vtubers 的 CHECK 對齊）
//   - 投稿／回報的欄位驗證
// 端點：functions/api/vtuber/channel-lookup.js、vtuber/contribute.js、report.js

export const NATIONALITIES = ['TW', 'HK', 'MY', 'JP', 'KR', 'OTHER'];
export const AFFILIATION_TYPES = ['personal', 'agency', 'circle'];
const UC_RE = /^UC[A-Za-z0-9_-]{22}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LIMITS = {
    name: 100,
    bio: 500,
    note: 500,
    contact: 200,
    url: 2048,
    sourceUrls: 5,
    subscriberClaim: 20,
    groupName: 100,
    reportDescription: 1000,
    reportReasons: 8,
    pageUrl: 500,
};

/** 回報類型與各自可選的原因（與 vtuber_reports.reasons 的 CHECK 白名單一致） */
export const REPORT_REASONS_BY_KIND = {
    vtuber_info: ['name', 'group', 'nationality', 'graduated', 'channel_link', 'not_vtuber', 'add_info', 'other'],
    stream: ['wrong_time', 'cancelled', 'duplicate', 'other'],
    roster: ['missing_member', 'wrong_member', 'graduated', 'other'],
    missing_vtuber: ['other'],
};

const str = (v) => (typeof v === 'string' ? v.trim() : '');

function parseUrlLoose(raw) {
    const s = str(raw);
    if (!s) return null;
    try {
        return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    } catch {
        return null;
    }
}

/** 一般網址：只收 http(s)、長度上限；回正規化後的字串或 null */
export function normalizeHttpUrl(raw) {
    const u = parseUrlLoose(raw);
    if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:')) return null;
    const out = u.toString();
    return out.length <= LIMITS.url ? out : null;
}

/**
 * YouTube 頻道輸入 → { kind: 'id', channelId } | { kind: 'handle', handle } | { error }
 * 支援：UC… ID、@handle、youtube.com/channel/UC…、youtube.com/@handle（含 m.／www.，中文 handle 也可）。
 * /c/、/user/ 舊式網址無法零配額解析，回 unsupported_url。
 */
export function parseYoutubeChannelInput(raw) {
    const s = str(raw);
    if (!s) return { error: 'missing' };
    if (UC_RE.test(s)) return { kind: 'id', channelId: s };
    if (s.startsWith('@')) return handleResult(s.slice(1));

    const u = parseUrlLoose(s);
    if (!u || !/^(www\.|m\.)?youtube\.com$/i.test(u.hostname)) return { error: 'invalid_url' };
    const path = u.pathname;
    const id = path.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})(?:\/|$)/);
    if (id) return { kind: 'id', channelId: id[1] };
    const handle = path.match(/^\/@([^/]+)/);
    if (handle) {
        let decoded = handle[1];
        try {
            decoded = decodeURIComponent(decoded);
        } catch {
            return { error: 'invalid_url' };
        }
        return handleResult(decoded);
    }
    if (/^\/(c|user)\//.test(path)) return { error: 'unsupported_url' };
    return { error: 'invalid_url' };
}

// YouTube handle 的字元：各語言的字母與數字、底線、連字號、句點（日後會拼進網址與 HTML，不收其他符號）
const HANDLE_RE = /^[\p{L}\p{M}\p{N}._-]{3,100}$/u;

function handleResult(h) {
    const handle = h.trim();
    if (!HANDLE_RE.test(handle)) return { error: 'invalid_url' };
    return { kind: 'handle', handle };
}

/**
 * 社群網址正規化。空值回 { value: null }；格式不合回 { error }。
 * 產出的網址格式與 vtubers 的 CHECK（x／facebook／instagram）一致。
 * twitch 回 login（存在 twitch_channel_id）。
 */
export function normalizeSocial(kind, raw) {
    const s = str(raw);
    if (!s) return { value: null };
    if (kind === 'x') {
        const h = s.startsWith('@') ? s.slice(1) : pathHandle(s, /^(www\.|mobile\.)?(x|twitter)\.com$/i);
        return /^[A-Za-z0-9_]{1,15}$/.test(h ?? '') ? { value: `https://x.com/${h}` } : { error: 'invalid_x' };
    }
    if (kind === 'instagram') {
        // Instagram 帳號可以含句點（例如 abc.def），只填帳號時不能當成網址解析
        const bare = /^[A-Za-z0-9_.]{1,30}$/.test(s) && !/instagram\.com/i.test(s);
        // 只填帳號卻像網域（twitter.com、abc.tv…）多半是貼錯欄位
        if (bare && /\.(com|net|org|tv|io|me|gg|tw|jp|hk)$/i.test(s)) return { error: 'invalid_instagram' };
        const h = s.startsWith('@') ? s.slice(1) : bare ? s : pathHandle(s, /^(www\.)?instagram\.com$/i);
        return /^[A-Za-z0-9_.]{1,30}$/.test(h ?? '') ? { value: `https://www.instagram.com/${h}` } : { error: 'invalid_instagram' };
    }
    if (kind === 'facebook') {
        const u = parseUrlLoose(s);
        if (!u || !/^(www\.|m\.)?(facebook|fb)\.com$/i.test(u.hostname) || u.pathname.length < 2) return { error: 'invalid_facebook' };
        // profile.php?id=… 要保留 id；其他一律只留路徑
        const id = u.pathname === '/profile.php' ? u.searchParams.get('id') : null;
        if (u.pathname === '/profile.php' && !/^\d{1,30}$/.test(id ?? '')) return { error: 'invalid_facebook' };
        const out = `https://www.facebook.com${u.pathname.replace(/\/+$/, '')}${id ? `?id=${id}` : ''}`;
        return out.length <= LIMITS.url && !/\s/.test(out) ? { value: out } : { error: 'invalid_facebook' };
    }
    if (kind === 'twitch') {
        const h = /^[A-Za-z0-9_]{3,25}$/.test(s) ? s : pathHandle(s, /^(www\.|m\.)?twitch\.tv$/i);
        return /^[A-Za-z0-9_]{3,25}$/.test(h ?? '') ? { value: h.toLowerCase() } : { error: 'invalid_twitch' };
    }
    return { error: 'unknown_social' };
}

/** 網址第一段路徑（帳號名）；網域不符回 null。也接受只填帳號名 */
function pathHandle(s, hostRe) {
    if (!s.includes('/') && !s.includes('.')) return s;
    const u = parseUrlLoose(s);
    if (!u || !hostRe.test(u.hostname)) return null;
    return u.pathname.split('/').filter(Boolean)[0] ?? null;
}

/** 頭像只收 YouTube 圖床（投稿者不能指定任意圖片；要換其他來源只能經後台 override） */
export const isYoutubeAvatar = (url) => typeof url === 'string' && /^https:\/\/yt3\.(ggpht|googleusercontent)\.com\/[^\s"'<>]+$/.test(url);

// ---------- 頻道查詢（零配額：只讀頻道頁前段） ----------

const SOCIAL_BOT_HEADERS = {
    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
    Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+917;',
};
// 頻道頁的 og:url（/channel/UC…）、og:title、og:image 都在前 5KB；vanityChannelUrl（handle）位置不固定，最多讀到 128KB
const HEAD_CHARS = 64 * 1024;
const MAX_CHARS = 128 * 1024;

function decodeEntities(s) {
    return s
        .replace(/&#(\d+);/g, (_, n) => safeCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeCodePoint(parseInt(n, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}
function safeCodePoint(n) {
    try {
        return String.fromCodePoint(n);
    } catch {
        return '';
    }
}

const metaContent = (html, prop) => {
    const m =
        html.match(new RegExp(`<meta\\s+property=["']${prop}["']\\s+content=(["'])(.*?)\\1`, 'i')) ||
        html.match(new RegExp(`<meta\\s+content=(["'])(.*?)\\1\\s+property=["']${prop}["']`, 'i'));
    return m ? decodeEntities(m[2]) : null;
};

/** 從頻道頁前段 HTML 取出頻道資料；不是頻道頁（沒有 /channel/UC… 的 og:url）回 null */
export function parseChannelHead(html, inputHandle = null) {
    const ogUrl = metaContent(html, 'og:url') || '';
    const channelId = ogUrl.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/)?.[1];
    if (!channelId) return null;
    // 頁面上的正式 handle（vanityChannelUrl）優先；沒有時才用輸入值（已過 HANDLE_RE）
    let handle = null;
    const vanity = html.match(/"vanityChannelUrl":"https?:\/\/(?:www\.)?youtube\.com\/@([^"]+)"/)?.[1];
    if (vanity) {
        try {
            handle = decodeURIComponent(vanity);
        } catch {
            handle = null;
        }
    }
    if (!handle || !HANDLE_RE.test(handle)) handle = inputHandle && HANDLE_RE.test(inputHandle) ? inputHandle : null;
    const title = (metaContent(html, 'og:title') || '').trim().slice(0, LIMITS.name) || null;
    const image = metaContent(html, 'og:image');
    const avatarUrl = image && isYoutubeAvatar(image) ? image.slice(0, LIMITS.url) : null;
    return { channelId, title, avatarUrl, handle: handle ? handle.slice(0, 100) : null };
}

/**
 * 查 YouTube 頻道（名稱、頭像、channelId、handle）。
 * @returns {Promise<{ ok: true, channel: {channelId,title,avatarUrl,handle} } | { ok: false, error: 'not_found'|'fetch_failed' }>}
 */
export async function lookupYoutubeChannel(parsed, opts = {}) {
    const fetchFn = opts.fetch ?? fetch;
    const url = parsed.kind === 'id'
        ? `https://www.youtube.com/channel/${parsed.channelId}?hl=en&gl=US`
        : `https://www.youtube.com/@${encodeURIComponent(parsed.handle)}?hl=en&gl=US`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
    try {
        const res = await fetchFn(url, { headers: SOCIAL_BOT_HEADERS, redirect: 'follow', signal: controller.signal });
        if (res.status === 404) {
            await res.body?.cancel?.().catch(() => {});
            return { ok: false, error: 'not_found' };
        }
        if (!res.ok || !res.body) {
            await res.body?.cancel?.().catch(() => {});
            return { ok: false, error: 'fetch_failed' };
        }
        const html = await readPrefix(res.body, (text) =>
            text.length >= MAX_CHARS || (text.length >= HEAD_CHARS && (parsed.kind === 'handle' || text.includes('"vanityChannelUrl"'))),
        );
        const channel = parseChannelHead(html, parsed.kind === 'handle' ? parsed.handle : null);
        if (!channel) return { ok: false, error: 'not_found' };
        if (parsed.kind === 'id' && channel.channelId !== parsed.channelId) return { ok: false, error: 'not_found' };
        return { ok: true, channel };
    } catch {
        return { ok: false, error: 'fetch_failed' };
    } finally {
        clearTimeout(timer);
    }
}

/** 串流讀取直到 enough(text) 為真或讀完，然後取消下載 */
async function readPrefix(body, enough) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let done = false;
    try {
        while (!done) {
            const r = await reader.read();
            done = r.done;
            text += done ? decoder.decode() : decoder.decode(r.value, { stream: true });
            if (enough(text)) break;
        }
    } finally {
        if (!done) reader.cancel().catch(() => {});
    }
    return text.slice(0, MAX_CHARS);
}

// ---------- 驗證 ----------

function httpsUrlList(list) {
    if (list == null) return { value: [] };
    if (!Array.isArray(list) || list.length > LIMITS.sourceUrls) return { error: 'invalid_source_urls' };
    const out = [];
    for (const raw of list) {
        if (!str(raw)) continue;
        const u = normalizeHttpUrl(raw);
        if (!u) return { error: 'invalid_source_urls' };
        if (!out.includes(u)) out.push(u);
    }
    return { value: out };
}

/**
 * 投稿表單驗證。YouTube 頻道只做格式解析（實際存在與否由端點查詢）。
 * @returns {{ value: object } | { error: string }}
 */
export function validateContribution(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'invalid_body' };
    const parsed = parseYoutubeChannelInput(body.youtubeUrl);
    if (parsed.error) return { error: `youtube_${parsed.error}` };

    const name = str(body.name);
    if (!name || name.length > LIMITS.name) return { error: 'invalid_name' };

    if (!NATIONALITIES.includes(body.nationality)) return { error: 'invalid_nationality' };
    const evidence = str(body.nationalityEvidenceUrl) ? normalizeHttpUrl(body.nationalityEvidenceUrl) : null;
    if (str(body.nationalityEvidenceUrl) && !evidence) return { error: 'invalid_nationality_evidence' };
    // 地區只收本人自稱或所屬公司證據：台灣以外必須附來源
    if (body.nationality !== 'TW' && !evidence) return { error: 'nationality_evidence_required' };

    const aff = body.affiliation && typeof body.affiliation === 'object' ? body.affiliation : { type: 'personal' };
    if (!AFFILIATION_TYPES.includes(aff.type)) return { error: 'invalid_affiliation' };
    const groupId = str(aff.groupId);
    if (groupId && !UUID_RE.test(groupId)) return { error: 'invalid_affiliation' };
    const groupName = str(aff.groupName);
    if (groupName.length > LIMITS.groupName) return { error: 'invalid_affiliation' };
    if (aff.type !== 'personal' && !groupId && !groupName) return { error: 'affiliation_name_required' };

    const bio = str(body.bio);
    if (bio.length > LIMITS.bio) return { error: 'invalid_bio' };

    const avatarRaw = str(body.avatarUrl);
    if (avatarRaw && (avatarRaw.length > LIMITS.url || !isYoutubeAvatar(avatarRaw))) return { error: 'invalid_avatar' };
    const avatarUrl = avatarRaw || null;

    const subscriberClaim = str(String(body.subscriberCount ?? ''));
    if (subscriberClaim.length > LIMITS.subscriberClaim) return { error: 'invalid_subscriber_count' };

    const socialsIn = body.socials && typeof body.socials === 'object' ? body.socials : {};
    const socials = {};
    for (const kind of ['x', 'facebook', 'instagram', 'twitch']) {
        const r = normalizeSocial(kind, socialsIn[kind]);
        if (r.error) return { error: r.error };
        socials[kind] = r.value;
    }

    const sources = httpsUrlList(body.sourceUrls);
    if (sources.error) return sources;
    const sourceUrls = [...new Set([...(evidence ? [evidence] : []), ...sources.value])].slice(0, LIMITS.sourceUrls);

    const note = str(body.note);
    if (note.length > LIMITS.note) return { error: 'invalid_note' };
    const contact = str(body.contact);
    if (contact.length > LIMITS.contact) return { error: 'invalid_contact' };

    return {
        value: {
            channelInput: parsed,
            name,
            nationality: body.nationality,
            nationalityEvidenceUrl: evidence,
            affiliation: { type: aff.type, groupId: groupId || null, groupName: groupName || null },
            bio: bio || null,
            avatarUrl,
            subscriberClaim: subscriberClaim || null,
            socials,
            sourceUrls,
            note: note || null,
            contact: contact || null,
        },
    };
}

/** 「補充資料」可填的欄位（回報與後台套用共用） */
export const SUGGESTED_KEYS = ['x', 'facebook', 'instagram', 'youtube', 'twitch', 'bio'];
// vtuber_reports.suggested 的 CHECK 是 octet_length(suggested::text) <= 4096；jsonb 輸出會在 : 與 , 後加空白，預留餘量
const SUGGESTED_MAX_BYTES = 3900;
// 控制字元（保留換行）：寫進 jsonb 會膨脹成 \u0001，之後也會顯示在公開個人頁
const CONTROL_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;

/**
 * 「補充資料」驗證與正規化：社群沿用 normalizeSocial，YouTube 只解析格式（UC… 或 @handle，實際查詢在後台套用時），
 * 簡介 ≤ LIMITS.bio。只回傳有填的欄位；全部空白回 suggested_required。
 * 產出：{ x?, facebook?, instagram?, twitch?（login）, youtube?（'UC…' 或 '@handle'）, bio? }
 */
export function validateSuggested(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'suggested_required' };
    const out = {};
    for (const kind of ['x', 'facebook', 'instagram', 'twitch']) {
        if (raw[kind] != null && typeof raw[kind] !== 'string') return { error: `invalid_${kind}` };
        const r = normalizeSocial(kind, raw[kind]);
        if (r.error) return { error: r.error };
        if (r.value) out[kind] = r.value;
    }
    if (raw.youtube != null && typeof raw.youtube !== 'string') return { error: 'youtube_invalid_url' };
    if (str(raw.youtube)) {
        const yt = parseYoutubeChannelInput(raw.youtube);
        if (yt.error) return { error: `youtube_${yt.error}` };
        out.youtube = yt.kind === 'id' ? yt.channelId : `@${yt.handle}`;
    }
    if (raw.bio != null && typeof raw.bio !== 'string') return { error: 'invalid_bio' };
    const bio = str(raw.bio).replace(CONTROL_CHARS, '');
    if (bio.length > LIMITS.bio) return { error: 'invalid_bio' };
    if (bio) out.bio = bio;
    if (!Object.keys(out).length) return { error: 'suggested_required' };
    // 各欄個別限長，但總和仍可能超過資料庫上限（例如中文 Facebook 路徑被編碼成每字 9 bytes）
    if (new TextEncoder().encode(JSON.stringify(out)).length > SUGGESTED_MAX_BYTES) return { error: 'invalid_suggested' };
    return { value: out };
}

/**
 * 回報表單驗證。對象是否存在由端點查資料庫確認。
 * @returns {{ value: object } | { error: string }}
 */
export function validateReport(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'invalid_body' };
    const allowed = REPORT_REASONS_BY_KIND[body.kind];
    if (!allowed) return { error: 'invalid_kind' };

    const reasons = Array.isArray(body.reasons) ? [...new Set(body.reasons)] : [];
    if (!reasons.length || reasons.length > LIMITS.reportReasons || !reasons.every((r) => allowed.includes(r))) {
        return { error: 'invalid_reasons' };
    }
    const description = str(body.description);
    if (description.length > LIMITS.reportDescription) return { error: 'invalid_description' };
    if (reasons.includes('other') && !description) return { error: 'description_required' };

    // 補充資料：只有勾了 add_info 才收（其他情況帶來的 suggested 一律忽略）
    let suggested = null;
    if (reasons.includes('add_info')) {
        const s = validateSuggested(body.suggested);
        if (s.error) return s;
        suggested = s.value;
    }

    const value = {
        kind: body.kind,
        reasons,
        description: description || null,
        suggested,
        vtuberId: null,
        groupId: null,
        streamPlatform: null,
        streamExternalId: null,
    };

    const vtuberId = str(body.vtuberId);
    if (vtuberId && !UUID_RE.test(vtuberId)) return { error: 'invalid_target' };
    const groupId = str(body.groupId);
    if (groupId && !UUID_RE.test(groupId)) return { error: 'invalid_target' };
    value.vtuberId = vtuberId || null;
    value.groupId = groupId || null;

    if (body.kind === 'vtuber_info' && !value.vtuberId) return { error: 'invalid_target' };
    if (body.kind === 'roster' && !value.groupId) return { error: 'invalid_target' };
    if (body.kind === 'stream') {
        const platform = body.stream?.platform;
        const externalId = str(body.stream?.externalId);
        if (!['youtube', 'twitch'].includes(platform) || !/^[A-Za-z0-9_-]{1,64}$/.test(externalId)) return { error: 'invalid_target' };
        value.streamPlatform = platform;
        value.streamExternalId = externalId;
    }

    const sources = httpsUrlList(body.sourceUrls);
    if (sources.error) return sources;
    value.sourceUrls = sources.value;

    const contact = str(body.contact);
    if (contact.length > LIMITS.contact) return { error: 'invalid_contact' };
    value.contact = contact || null;

    // 只存站內路徑（例如 /schedule/abc?x=1），不收任意外部網址
    const pageUrl = str(body.pageUrl);
    value.pageUrl = /^\/[^\s]{0,499}$/.test(pageUrl) ? pageUrl : null;
    return { value };
}

export const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s);
