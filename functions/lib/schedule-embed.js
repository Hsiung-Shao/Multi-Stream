// 直播班表小工具（嵌入）的共用渲染：functions/embed/schedule/* 的 HTML 嵌入頁與 SVG 週表圖。
//
// 設計原則：
//   - 純 HTML＋inline CSS、無 JS：宿主站的 CSP 不會擋、Workers CPU 只有字串拼接。
//   - 每一份嵌入都有指回 multistreaming.org 的可見連結（外鏈來源，不加 nofollow）；嵌入頁本身 noindex。
//   - 不設 frame-ancestors／X-Frame-Options（_headers 的 /* 區塊也刻意沒設）：任何網站都能 iframe。
//   - 週表圖裡的頭像內嵌成 data URI：SVG 引用外部圖片會讓瀏覽器 canvas 被污染（tainted），產生器轉 PNG 會失敗。
//   - 字型用觀看端系統字型；SVG 沒有自動換行，標題以「全形 2、半形 1」估寬截斷。
// 資料形狀 subject：{ name, image: string|null, streams: { live: Stream[], upcoming: Stream[] } | null, pagePath }
//   Stream = { title, platform: 'youtube'|'twitch', start: ISO|null, tbd?: true, member?: string }（member：團體嵌入列成員名）
import { escapeHtml, largerAvatar } from './schedule-person.js';

/** SVG 是嚴格 XML：先去掉 XML 不允許的控制字元（一個標題就能讓整張圖解析失敗、PNG 下載 onerror），再做 HTML 逃脫 */
export function escapeXml(s) {
    return escapeHtml(String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, ''));
}
/** 週表圖頁尾網址最長寬度（全形 2、半形 1） */
export const CARD_URL_UNITS = 60;
import { withLang } from './locale.js';

export const ORIGIN = 'https://multistreaming.org';
export const EMBED_CACHE_TTL_S = 300;
/** 查詢失敗（503）的快取秒數：短，別讓暫時故障掛滿 5 分鐘 */
export const EMBED_ERROR_TTL_S = 30;
export const EMBED_MAX_DAYS = 7;
export const CARD_W = 1200;
export const CARD_H = 675;
/** 週表圖最多列幾場（超過寫「還有 N 場」） */
export const CARD_MAX_ROWS = 5;
/** 週表圖標題截斷寬度（全形 2、半形 1） */
export const CARD_TITLE_UNITS = 44;
export const AVATAR_MAX_BYTES = 200 * 1024;
export const AVATAR_TIMEOUT_MS = 2000;
const DAY_MS = 86_400_000;

export const EMBED_TEXT = {
    'zh-TW': {
        schedule: '開台週表',
        live: '正在直播',
        upcoming: '接下來 {{days}} 天',
        none: '接下來 {{days}} 天沒有排程',
        timeTbd: '時間未定',
        tz: '台北時間',
        more: '完整週表',
        powered: '開台週表由 MultiStream Hub 提供',
        notFound: '找不到這位實況主',
        error: '週表暫時無法載入',
        moreRows: '…還有 {{n}} 場',
        liveLabel: '直播中',
        updated: '每 5 分鐘更新',
        liveForH: '已開播 {{n}} 小時',
        liveForM: '已開播 {{n}} 分鐘',
    },
    en: {
        schedule: 'Stream schedule',
        live: 'Live now',
        upcoming: 'Next {{days}} days',
        none: 'No streams scheduled in the next {{days}} days',
        timeTbd: 'Time TBD',
        tz: 'Taipei time',
        more: 'Full schedule',
        powered: 'Stream schedule by MultiStream Hub',
        notFound: 'Streamer not found',
        error: 'Schedule temporarily unavailable',
        moreRows: '…and {{n}} more',
        liveLabel: 'LIVE',
        updated: 'updates every 5 min',
        liveForH: 'live for {{n}}h',
        liveForM: 'live for {{n}} min',
    },
};
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));
const text = (lang) => EMBED_TEXT[lang] ?? EMBED_TEXT.en;

/** 查詢參數正規化：壞值一律退回預設，不回 400（嵌入碼手改錯了也要能顯示） */
export function parseEmbedOptions(searchParams) {
    const lang = searchParams.get('lang') === 'zh-TW' ? 'zh-TW' : 'en';
    const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
    const d = Number.parseInt(searchParams.get('days') ?? '', 10);
    const days = Number.isInteger(d) && d >= 1 && d <= EMBED_MAX_DAYS ? d : EMBED_MAX_DAYS;
    return { lang, theme, days };
}

/** 以「全形算 2、半形算 1」估寬截斷（SVG 無法自動換行） */
export function clip(s, maxUnits) {
    let units = 0;
    let out = '';
    for (const ch of String(s)) {
        const u = ch.codePointAt(0) > 0x2e7f ? 2 : 1;
        if (units + u > maxUnits) return out.replace(/\s+$/, '') + '…';
        units += u;
        out += ch;
    }
    return out;
}
function textWidth(s, half, full) {
    let w = 0;
    for (const ch of String(s)) w += ch.codePointAt(0) > 0x2e7f ? full : half;
    return w;
}

/** 嵌入回應共用標頭：noindex、公開快取、最小 CSP（刻意沒有 frame-ancestors／X-Frame-Options） */
export function embedResponseHeaders(ttl, contentType = 'text/html; charset=utf-8') {
    return {
        'Content-Type': contentType,
        'Cache-Control': `public, max-age=${ttl}`,
        'X-Robots-Tag': 'noindex',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    };
}

/** 依 days 篩出要列的場次：直播中全列、排程只到 now + days 天 */
export function pickStreams(streams, days, now) {
    if (!streams) return { live: [], upcoming: [] };
    const until = now + days * DAY_MS;
    const upcoming = (streams.upcoming ?? []).filter((x) => {
        const t = Date.parse(x.start);
        return !Number.isFinite(t) || t <= until;
    });
    return { live: streams.live ?? [], upcoming };
}

// ---------- 嵌入頁（HTML） ----------

const WEEKDAY_FMT = {
    'zh-TW': new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', weekday: 'short' }),
    en: new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', weekday: 'short' }),
};
const DATE_FMT = {
    'zh-TW': new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' }),
    en: new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', month: 'short', day: 'numeric' }),
};
const DATE_WD_FMT = {
    'zh-TW': new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', weekday: 'short' }),
    en: new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', month: 'short', day: 'numeric', weekday: 'short' }),
};
const TIME_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });
const TAIPEI_DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' });

const HTML_THEMES = {
    light: { bg: '#ffffff', fg: '#111827', muted: '#6b7280', line: '#e5e7eb', card: '#f9fafb', live: '#e5173f', liveTint: 'rgba(229,23,63,0.08)', link: '#2563eb', yt: '#d92d20', tw: '#7c3aed' },
    dark: { bg: '#0e1118', fg: '#f4f5f7', muted: '#8d93a1', line: '#262b36', card: '#151925', live: '#e5173f', liveTint: 'rgba(229,23,63,0.12)', link: '#c4b5fd', yt: '#ff3b3b', tw: '#a970ff' },
};

function htmlCss(theme) {
    const c = HTML_THEMES[theme] ?? HTML_THEMES.light;
    return `*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${c.bg};color:${c.fg};font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans TC","Noto Sans",sans-serif}
a{color:${c.link};text-decoration:none}a:hover{text-decoration:underline}
.wrap{padding:14px 16px;display:flex;flex-direction:column;gap:12px;min-height:100vh}
.head{display:flex;align-items:center;gap:12px}
.avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;background:${c.card};flex:none;display:block}
.avatar.live{box-shadow:0 0 0 2px ${c.bg},0 0 0 4px ${c.live}}
.name{font-size:17px;font-weight:700;line-height:1.2}
.name a{color:inherit}
.badge{display:inline-block;margin-left:8px;padding:1px 6px;border-radius:4px;background:${c.live};color:#fff;font-size:11px;font-weight:700;letter-spacing:.04em;vertical-align:middle}
.sub{color:${c.muted};font-size:12px;margin-top:2px}
h2{font-size:11px;font-weight:700;color:${c.muted};text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
section.live h2{color:${c.live}}
ul{list-style:none;display:flex;flex-direction:column;gap:6px}
li{display:grid;grid-template-columns:64px minmax(0,1fr);gap:12px;align-items:start;padding:10px 12px;border:1px solid ${c.line};border-radius:10px;background:${c.card}}
li.live{border-color:${c.live};background:linear-gradient(90deg,${c.liveTint},${c.card})}
li.tbd{border-style:dashed;background:transparent}
li.tbd .title{color:${c.muted}}
.when{font-variant-numeric:tabular-nums;white-space:nowrap}
.when b{display:block;font-size:16px;font-weight:700}
.when span{color:${c.muted};font-size:11px}
.member{display:block;font-size:12px;color:${c.muted}}
.title{min-width:0;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.pf{color:${c.muted};font-size:11px;margin-left:6px;white-space:nowrap}
.pf.yt{color:${c.yt};font-weight:600}.pf.tw{color:${c.tw};font-weight:600}
.since{display:block;font-size:11px;color:${c.live};font-weight:600;margin-top:2px}
.empty{color:${c.muted};padding:10px;border:1px dashed ${c.line};border-radius:8px;text-align:center}
.foot{margin-top:auto;display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid ${c.line};padding-top:10px;font-size:12px;color:${c.muted}}
.foot .more{font-weight:600}`;
}

function whenCell(lang, s, tz) {
    const t = s.start ? Date.parse(s.start) : NaN;
    if (!Number.isFinite(t)) return '<div class="when"><b>—</b></div>';
    const date = (DATE_FMT[lang] ?? DATE_FMT.en).format(t);
    const wd = (WEEKDAY_FMT[lang] ?? WEEKDAY_FMT.en).format(t);
    if (s.tbd) {
        return `<div class="when"><b><time datetime="${escapeHtml(TAIPEI_DAY_FMT.format(t))}">${escapeHtml(date)}</time></b><span>${escapeHtml(wd)} · ${escapeHtml(tz)}</span></div>`;
    }
    return `<div class="when"><b><time datetime="${escapeHtml(new Date(t).toISOString())}">${escapeHtml(TIME_FMT.format(t))}</time></b><span>${escapeHtml(`${date} ${wd}`)}</span></div>`;
}

/** 直播列的「已開播 N 小時／分鐘」；start 不可解析或在未來就不寫 */
function liveSince(s, t, now) {
    const start = s.start ? Date.parse(s.start) : NaN;
    if (!Number.isFinite(start) || start > now) return '';
    const mins = Math.floor((now - start) / 60_000);
    const label = mins >= 60 ? fill(t.liveForH, { n: Math.floor(mins / 60) }) : fill(t.liveForM, { n: mins });
    return `<span class="since">${escapeHtml(label)}</span>`;
}

function htmlItem(lang, s, t, live, now) {
    const platform = s.platform === 'twitch' ? 'Twitch' : 'YouTube';
    const pfClass = s.platform === 'twitch' ? 'pf tw' : 'pf yt';
    const member = s.member ? `<span class="member">${escapeHtml(s.member)}</span>` : '';
    const tbd = s.tbd ? ` <span class="pf">${escapeHtml(t.timeTbd)}</span>` : '';
    const cls = live ? ' class="live"' : s.tbd ? ' class="tbd"' : '';
    return `<li${cls}>${whenCell(lang, s, t.tz)}<div>${member}<span class="title">${escapeHtml(s.title || platform)}</span>${tbd}<span class="${pfClass}">${platform}</span>${live ? liveSince(s, t, now) : ''}</div></li>`;
}

/** 整份嵌入 HTML */
export function renderEmbedHtml(subject, { lang, theme, days }, now = Date.now()) {
    const t = text(lang);
    const pageUrl = ORIGIN + withLang(lang, subject.pagePath);
    const name = escapeHtml(subject.name);
    const { live, upcoming } = pickStreams(subject.streams, days, now);
    const sections = [];
    if (live.length) sections.push(`<section class="live"><h2>${escapeHtml(t.live)}</h2><ul>${live.map((x) => htmlItem(lang, x, t, true, now)).join('')}</ul></section>`);
    if (upcoming.length) sections.push(`<section><h2>${escapeHtml(fill(t.upcoming, { days }))}</h2><ul>${upcoming.map((x) => htmlItem(lang, x, t, false, now)).join('')}</ul></section>`);
    if (!live.length && !upcoming.length) sections.push(`<p class="empty">${escapeHtml(fill(t.none, { days }))}</p>`);
    // 資料層有上限（團體 RPC 100 列、個人 upcoming 10 列）：超過的只能寫「還有 N 場」；truncated 是以 7 天算的，選較少天數時不標（數字會偏大）
    if (days === EMBED_MAX_DAYS && Number(subject.truncated) > 0) sections.push(`<p class="empty">${escapeHtml(fill(t.moreRows, { n: Number(subject.truncated) }))}</p>`);
    const avatar = subject.image
        ? `<img class="avatar${live.length ? ' live' : ''}" src="${escapeHtml(largerAvatar(subject.image))}" alt="" referrerpolicy="no-referrer" width="48" height="48">`
        : '<span class="avatar" aria-hidden="true"></span>';
    return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${name}</title><style>${htmlCss(theme)}</style></head><body><div class="wrap">
<header class="head">${avatar}<div><div class="name"><a href="${escapeHtml(pageUrl)}" target="_blank" rel="noopener">${name}</a>${live.length ? '<span class="badge">LIVE</span>' : ''}</div><div class="sub">${escapeHtml(t.tz)} · UTC+8 · ${escapeHtml(t.updated)}</div></div></header>
${sections.join('\n')}
<footer class="foot"><a class="more" href="${escapeHtml(pageUrl)}" target="_blank" rel="noopener">${escapeHtml(t.more)} →</a><a href="${escapeHtml(ORIGIN + withLang(lang, '/schedule'))}" target="_blank" rel="noopener">${escapeHtml(t.powered)}</a></footer>
</div></body></html>`;
}

/** 404／503 用的訊息頁（同樣的主題與頁尾） */
export function renderMessageHtml(lang, theme, message) {
    const t = text(lang);
    return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${escapeHtml(message)}</title><style>${htmlCss(theme)}</style></head><body><div class="wrap"><p class="empty">${escapeHtml(message)}</p><footer class="foot"><span></span><a href="${ORIGIN}${withLang(lang, '/schedule')}" target="_blank" rel="noopener">${escapeHtml(t.powered)}</a></footer></div></body></html>`;
}

// ---------- 週表圖（SVG） ----------

const SVG_THEMES = {
    light: { bg: '#ffffff', bg2: '#f3f4f6', fg: '#111827', muted: '#6b7280', row: '#f9fafb', line: '#e5e7eb', live: '#e5173f', brand: '#2563eb' },
    dark: { bg: '#161022', bg2: '#2a1b3d', fg: '#ffffff', muted: '#c9b8d6', row: '#ffffff14', line: '#ffffff22', live: '#ff3b5c', brand: '#c4b5fd' },
};
const SVG_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif";

/** 頭像轉 data URI；任何失敗（非 2xx、非圖片、太大、逾時）都回 null，呼叫端畫純色圓 */
export async function avatarDataUri(url, fetchFn = fetch) {
    if (!url) return null;
    try {
        const res = await fetchFn(largerAvatar(url), { signal: AbortSignal.timeout(AVATAR_TIMEOUT_MS) });
        if (!res.ok) return null;
        const type = (res.headers.get('content-type') || '').split(';')[0].trim();
        if (!/^image\/(png|jpeg|webp)$/.test(type)) return null;
        // 先看標頭：太大的就不讀 body（省記憶體與 CPU）
        const declared = Number(res.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > AVATAR_MAX_BYTES) return null;
        const buf = await res.arrayBuffer();
        if (buf.byteLength > AVATAR_MAX_BYTES) return null;
        let bin = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return `data:${type};base64,${btoa(bin)}`;
    } catch {
        return null;
    }
}

/** 整張週表圖 SVG（1200×675，16:9）；avatar 為 data URI 或 null */
export function renderCardSvg(subject, { lang, theme, days }, avatar, now = Date.now()) {
    const t = text(lang);
    const c = SVG_THEMES[theme] ?? SVG_THEMES.light;
    const { live, upcoming } = pickStreams(subject.streams, days, now);
    const rows = [...live.map((x) => ({ ...x, live: true })), ...upcoming];
    const shown = rows.slice(0, CARD_MAX_ROWS);
    const more = rows.length - shown.length + (days === EMBED_MAX_DAYS && Number(subject.truncated) > 0 ? Number(subject.truncated) : 0);
    // 頁尾只寫人看得懂的網址：去掉錨點（團體回連結帶 #directory-group-<uuid>）、太長就截斷，別壓到右側品牌字
    const pageUrl = clip(`multistreaming.org${withLang(lang, String(subject.pagePath).split('#')[0])}`, CARD_URL_UNITS);
    const nameShown = clip(subject.name, 36);
    // 40px 粗體：半形約 24px、全形約 40px（之前用 20 會讓 LIVE 徽章蓋到英文長名）
    const nameEnd = 180 + textWidth(nameShown, 24, 40);

    const p = [];
    p.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" font-family="${SVG_FONT}">`);
    p.push(`<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg}"/><stop offset="1" stop-color="${c.bg2}"/></linearGradient><clipPath id="av"><circle cx="100" cy="96" r="52"/></clipPath></defs>`);
    p.push(`<rect width="${CARD_W}" height="${CARD_H}" rx="32" fill="url(#g)"/>`);
    if (avatar) p.push(`<image href="${avatar}" x="48" y="44" width="104" height="104" clip-path="url(#av)" preserveAspectRatio="xMidYMid slice"/>`);
    else p.push(`<circle cx="100" cy="96" r="52" fill="${c.row}"/>`);
    p.push(`<circle cx="100" cy="96" r="52" fill="none" stroke="${c.line}" stroke-width="2"/>`);
    p.push(`<text x="180" y="92" font-size="40" font-weight="700" fill="${c.fg}">${escapeXml(nameShown)}</text>`);
    if (live.length) p.push(`<rect x="${nameEnd + 16}" y="60" width="78" height="36" rx="8" fill="${c.live}"/><text x="${nameEnd + 55}" y="86" font-size="22" font-weight="800" fill="#fff" text-anchor="middle">LIVE</text>`);
    p.push(`<text x="180" y="128" font-size="22" fill="${c.muted}">${escapeXml(`${t.schedule} · ${fill(t.upcoming, { days })} · ${t.tz} (UTC+8)`)}</text>`);
    let y = 184;
    const rowH = 76;
    if (!shown.length) {
        p.push(`<rect x="48" y="${y}" width="1104" height="${rowH}" rx="16" fill="none" stroke="${c.line}" stroke-dasharray="8 8"/>`);
        p.push(`<text x="600" y="${y + 47}" font-size="24" fill="${c.muted}" text-anchor="middle">${escapeXml(fill(t.none, { days }))}</text>`);
    }
    for (const x of shown) {
        const ts = x.start ? Date.parse(x.start) : NaN;
        const time = Number.isFinite(ts) ? (x.tbd ? t.timeTbd : TIME_FMT.format(ts)) : '—';
        const date = Number.isFinite(ts) ? (DATE_WD_FMT[lang] ?? DATE_WD_FMT.en).format(ts) : '';
        const platform = x.platform === 'twitch' ? 'Twitch' : 'YouTube';
        const title = x.member ? `${x.member}：${x.title || platform}` : x.title || platform;
        p.push(`<rect x="48" y="${y}" width="1104" height="${rowH - 10}" rx="16" fill="${c.row}" stroke="${x.live ? c.live : c.line}" stroke-width="${x.live ? 3 : 1}"/>`);
        p.push(`<text x="72" y="${y + 36}" font-size="${x.tbd || x.live ? 22 : 30}" font-weight="700" fill="${x.live ? c.live : c.fg}">${escapeXml(x.live ? t.liveLabel : time)}</text>`);
        p.push(`<text x="72" y="${y + 58}" font-size="17" fill="${c.muted}">${escapeXml(date)}</text>`);
        p.push(`<text x="260" y="${y + 41}" font-size="26" fill="${c.fg}">${escapeXml(clip(title, CARD_TITLE_UNITS))}</text>`);
        p.push(`<text x="1128" y="${y + 41}" font-size="18" fill="${c.muted}" text-anchor="end">${platform}</text>`);
        y += rowH;
    }
    if (more > 0) p.push(`<text x="72" y="${y + 24}" font-size="20" fill="${c.muted}">${escapeXml(fill(t.moreRows, { n: more }))}</text>`);
    p.push(`<line x1="48" y1="612" x2="1152" y2="612" stroke="${c.line}"/>`);
    p.push(`<text x="48" y="648" font-size="22" fill="${c.brand}">${escapeXml(`${t.more}：${pageUrl}`)}</text>`);
    p.push(`<text x="1152" y="648" font-size="20" fill="${c.muted}" text-anchor="end">MultiStream Hub</text>`);
    p.push('</svg>');
    return p.join('');
}

/** 404／503 用的訊息圖 */
export function renderMessageSvg(theme, message) {
    const c = SVG_THEMES[theme] ?? SVG_THEMES.light;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}"><rect width="${CARD_W}" height="${CARD_H}" rx="32" fill="${c.bg}"/><text x="600" y="350" font-size="32" fill="${c.muted}" text-anchor="middle" font-family="${SVG_FONT}">${escapeXml(message)}</text></svg>`;
}

/** 把 resolveSchedulePerson 的 found 結果轉成 subject */
export function personSubject(person, slug) {
    const s = person.streams;
    // upcoming 在資料層只取 PERSON_BODY_LIST_LIMIT 筆（schedule-person.js），總數在 upcomingTotal：超過的寫「還有 N 場」
    const truncated = s && Number.isFinite(Number(s.upcomingTotal)) ? Math.max(0, Number(s.upcomingTotal) - s.upcoming.length) : 0;
    return { name: person.name, image: person.image, streams: s ? { live: s.live, upcoming: s.upcoming } : null, pagePath: `/schedule/${slug}`, truncated };
}
