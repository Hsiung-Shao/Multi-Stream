// 使用者回報（feedbacks）公開到 /status 的規則：查詢條件、聯絡資訊遮蔽、截斷
//
// 只公開內容、狀態、日期三樣；且只限送出時表單已告知會公開（public_notice=true）、站方看過（已讀以上）、未封存的回報。
// 未讀不公開＝人工把關：避免廣告、辱罵、第三方個資等遮蔽規則抓不到的內容一送出就上正式站（使用者裁定 2026-10-08）。
// 遮蔽是保險，不是唯一防線：變形寫法（「jerry at gmail dot com」等）仍可能漏網，站方要把不適合公開的回報改成「封存」。
//
// 效能：這段在每次 /api/status 快取失效時對最多 30 筆執行，Workers 免費方案 CPU 只有 10 ms。
//   - 先截到 PRE_MASK_LEN 再遮蔽，所有 regex 的量詞都有上限
//   - email 不用 regex 從每個位置往前試（一般中文長文會大量回溯），改成找到 @ 再往左右展開的線性掃描
//   tests 鎖了最壞情況耗時。

/** 會公開的狀態（unread＝站方還沒看過、archived＝下架，都不公開）；processed 是舊後台的值，等同 fixed */
export const PUBLIC_FEEDBACK_STATUSES = ['read', 'processing', 'fixed'];
const LEGACY_STATUS = { processed: 'fixed' };
export const FEEDBACK_PUBLIC_DAYS = 30;
export const FEEDBACK_PUBLIC_LIMIT = 30;
export const FEEDBACK_PUBLIC_MAX_LEN = 300;
/** 遮蔽前先截的長度：比公開長度多留一些 */
const PRE_MASK_LEN = FEEDBACK_PUBLIC_MAX_LEN + 60;
export const MASK = '[•••]';
/** 公開日期一律以台北時區算「哪一天」（站方與多數使用者所在時區；條款只公開到「送出日期」） */
const DATE_TZ = 'Asia/Taipei';

/**
 * 公開頁的 PostgREST 查詢（只 select 公開欄位）
 * @param {number} nowMs
 */
export function publicFeedbackQuery(nowMs) {
    const since = new Date(nowMs - FEEDBACK_PUBLIC_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const statuses = [...PUBLIC_FEEDBACK_STATUSES, ...Object.keys(LEGACY_STATUS)];
    return 'feedbacks?select=id,content,status,created_at'
        + '&public_notice=eq.true'
        + `&status=in.(${statuses.join(',')})`
        + `&created_at=gte.${encodeURIComponent(since)}`
        + `&order=created_at.desc&limit=${FEEDBACK_PUBLIC_LIMIT}`;
}

// 看不見的格式字元：雙向控制（可反轉文字方向偽裝內容）、零寬空白／連接、soft hyphen、word joiner、BOM 等。
// 夾在 email／電話中間會讓比對失敗，畫面上卻看起來完整，所以一律移除。
// U+200D（ZWJ）是 emoji 組合（👨‍👩‍👧）必需的，只在它緊鄰英數或 @ . 時才移除。
const FORMAT_CHARS_RE = /[­᠎​‌‎‏‪-‮⁠-⁤⁦-⁩﻿]/g;
const ZWJ_IN_TEXT_RE = /(?<=[A-Za-z0-9@.])‍|‍(?=[A-Za-z0-9@.])/g;
// 全形英數與聯絡資訊常用符號（＠ ． ＋ － ＿ ＃ ／）→ 半形。不用 NFKC：它會把中文全形標點（，：（）等）一起轉掉。
const FULLWIDTH_RE = /[０-９Ａ-Ｚａ-ｚ＠．＋－＿＃／]/g;
// 夾在英數之間的中文句號當成「.」（「jerry＠gmail。com」）；中文句子裡的句號不受影響
const CJK_DOT_RE = /(?<=[A-Za-z0-9])[。｡](?=[A-Za-z0-9])/g;

// 網址：有協定或 www.；或常見社群／短網址網域（不帶協定也遮）
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'）)】」]{1,500}/giu;
const BARE_DOMAIN_RE = /\b(?:[a-z0-9-]{1,63}\.){1,4}(?:com|net|org|io|gg|me|tv|tw|jp|kr|cn|app|dev|ly|co)(?:\/[^\s<>"'）)】」]{0,300})?(?![\p{L}\p{N}])/giu;
// 帳號：@handle（前面不是英數，避免吃到 email 的一部分；email 已先被遮）、Discord 舊式 name#1234
const HANDLE_RE = /(?<![\p{L}\p{N}])@[A-Za-z0-9_.]{2,30}/gu;
const DISCRIM_RE = /\b[A-Za-z0-9_.]{2,32}#\d{4}\b/g;
// 明寫的社群帳號：「line id: xxx」「IG@xxx」「我的line是 xxx」「discord 用戶名 xxx」「加我 ig xxx」
// 一定要有明確提示才遮，否則英文句子提到平台名稱（「The second line is cut off」「I use discord daily」）會被誤遮：
//   (a) 平台名稱後面接提示詞（id／帳號／用戶名／是…）或分隔符號（: ： @）
//   (b) 前面是中文字時，平台名稱後空一格直接接帳號也算（「加我 ig foo.bar」）
// 只遮英數帳號（不吃中文，避免「Threads：好用」被誤遮）；不收 x、tg 這種太短、容易撞到一般字的名稱
const SOCIAL_KW = '(?:line|ig|instagram|discord|telegram|facebook|fb|twitter|threads)(?![A-Za-z])';
const SOCIAL_HINT = '(?:id|ID|帳號|账号|用戶名|用户名|名稱|名称|是|為|为)';
const SOCIAL_HANDLE = '[A-Za-z0-9_.\\-]{2,40}';
const SOCIAL_ID_RES = [
    new RegExp(`\\b${SOCIAL_KW}\\s{0,2}(?:${SOCIAL_HINT}\\s{0,2}){1,2}[:：@]?\\s{0,2}${SOCIAL_HANDLE}`, 'giu'),
    new RegExp(`\\b${SOCIAL_KW}\\s{0,2}[:：@]\\s{0,2}${SOCIAL_HANDLE}`, 'giu'),
    new RegExp(`(?<=\\p{Script=Han}\\s{0,2})${SOCIAL_KW}\\s{1,2}${SOCIAL_HANDLE}`, 'giu'),
];
// 電話：只認實際格式，不認「任意 8 碼數字」（錯誤碼、VOD 編號、日期不該被遮）
//   台灣手機：09 開頭共 10 碼，數字之間可任意夾空白 . -（含「0912-34-56 78」這種怪分組）
//   市話：區碼後一定要有分隔或括號（(02)2345-6789、02-2345-6789），不認 0 開頭的純數字串（影片 ID、VOD 編號）
//   國際：+886 9xx xxx xxx
const PHONE_RES = [
    /(?<!\d)09(?:[\s.\-]?\d){8}(?!\d)/g,
    /(?<!\d)(?:\(0\d{1,2}\)[\s.\-]?|0\d{1,2}[\s.\-])\d{3,4}[\s.\-]?\d{4}(?!\d)/g,
    /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}(?!\d)/g,
];
// 國字數字電話（「零九一二三四五六七八」）：連續 8 個以上
const CJK_DIGITS_RE = /[零〇一二三四五六七八九]{8,20}/g;

// local part 以英數為主（「信箱jerry@」只吃 jerry，不吞前面的中文）；整段沒有英數時才吃非英數字母（「王小明@」），最多 16 字
const LOCAL_ASCII_RE = /[A-Za-z0-9._%+-]/;
const LOCAL_ANY_RE = /[\p{L}\p{N}]/u;
// 網域 label：英數開頭的 label 只吃英數（「gmail.com謝謝」不吞「謝謝」）；非英數開頭（「例子.台灣」）才吃各國文字
const LABEL_ASCII_RE = /[A-Za-z0-9-]/;
const LABEL_ANY_RE = /[\p{L}\p{N}-]/u;
const MAX_LOCAL = 256; // 超長 local part 也整段遮（真實上限 64，但不能只遮後段讓前段外露）
const MAX_LOCAL_NON_ASCII = 16;
const MAX_LABEL = 63;
const MAX_LABELS = 9;
const DOT_SPACES = 4; // 「gmail   .  com」

/** 從 i 往後最多跳過 max 個空白，回傳新位置 */
function skipSpaces(s, i, max, dir) {
    let n = 0;
    while (n < max && i >= 0 && i < s.length && /\s/.test(s[i])) { i += dir; n++; }
    return i;
}

/**
 * 以 @ 為錨點找 email 並遮蔽（線性時間）。
 * 左邊：@ 前最多 2 個空白，再往左吃 local part 字元（最多 64 個）；
 * 右邊：@ 後最多 2 個空白，再吃「label(.label)+」，點的前後各允許最多 2 個空白（「gmail . com」）。
 */
function maskEmails(s) {
    let out = '';
    let last = 0;
    let at = s.indexOf('@');
    while (at !== -1) {
        // 左邊：先吃英數；一個英數都沒有時才吃非英數字母（全中文名稱）
        const leftEdge = skipSpaces(s, at - 1, 2, -1);
        let l = leftEdge;
        let n = 0;
        while (l >= 0 && n < MAX_LOCAL && LOCAL_ASCII_RE.test(s[l])) { l--; n++; }
        if (n === 0) {
            while (l >= 0 && n < MAX_LOCAL_NON_ASCII && LOCAL_ANY_RE.test(s[l])) { l--; n++; }
        }
        const start = n > 0 && l + 1 >= last ? l + 1 : -1;
        // 右邊：@ 後最多 2 個空白；開頭多一個點（「jerry@.gmail.com」）也跳過
        let r = skipSpaces(s, at + 1, 2, 1);
        if (s[r] === '.') r = skipSpaces(s, r + 1, DOT_SPACES, 1);
        let labels = 0;
        let end = -1;
        while (labels < MAX_LABELS) {
            const labelStart = r;
            const charRe = r < s.length && LABEL_ASCII_RE.test(s[r]) ? LABEL_ASCII_RE : LABEL_ANY_RE;
            let k = 0;
            while (r < s.length && k < MAX_LABEL && charRe.test(s[r])) { r++; k++; }
            if (k === 0) { r = labelStart; break; }
            labels++;
            if (labels >= 2) end = r;
            const beforeDot = skipSpaces(s, r, DOT_SPACES, 1);
            if (s[beforeDot] !== '.') break;
            r = skipSpaces(s, beforeDot + 1, DOT_SPACES, 1);
        }
        if (start !== -1 && end !== -1) {
            out += s.slice(last, start) + MASK;
            last = end;
            at = s.indexOf('@', end);
        } else {
            at = s.indexOf('@', at + 1);
        }
    }
    return out + s.slice(last);
}

/**
 * 遮蔽前的正規化：全形英數轉半形、移除隱形格式字元、英數之間的中文句號當成「.」。中文標點不動。
 * 正規化後的字串就是公開內容（「版本３。０」會公開成「版本3.0」）：只是外觀差異，換取不必維護原文位置對應。
 * @param {string} text
 */
function normalizeForMask(text) {
    return text
        .replace(FULLWIDTH_RE, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(FORMAT_CHARS_RE, '')
        .replace(ZWJ_IN_TEXT_RE, '')
        .replace(CJK_DOT_RE, '.');
}

/**
 * 把 email、網址、帳號、電話號碼換成遮蔽符號
 * @param {string} text
 * @returns {string}
 */
export function maskContact(text) {
    if (typeof text !== 'string') return '';
    let s = maskEmails(normalizeForMask(text));
    s = s.replace(URL_RE, MASK)
        .replace(BARE_DOMAIN_RE, MASK)
        .replace(HANDLE_RE, MASK)
        .replace(DISCRIM_RE, MASK);
    for (const re of SOCIAL_ID_RES) s = s.replace(re, MASK);
    for (const re of PHONE_RES) s = s.replace(re, MASK);
    return s.replace(CJK_DIGITS_RE, MASK);
}

/** 以字元（code point）截斷，不切壞 emoji 等 surrogate pair */
function truncate(text, max) {
    const chars = Array.from(text);
    return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
}

// 截斷尾端的清理（每一步都有上限，絕不能把整段吃光：英文長文全是字母、空白、句點）
//   1. 被切斷的最後一個字詞（截斷點不在空白上時）
//   2. 被切開的「xxx @」（email 帳號在 @ 前、網域被切掉）
//   3. 被切開、還有 3 碼以上的數字串（電話被切半後格式不完整、遮不到）
const CUT_TOKEN_RE = /\S{1,80}$/u;
const CUT_AT_RE = /\S{0,80}\s{0,2}@\s{0,2}$/u;
const CUT_DIGITS_RE = /[+(]?\d[\d\s.\-()]{0,24}$/;

/**
 * 遮蔽前的截短。被截斷時清掉尾端可能是半個聯絡資訊的片段：
 * 前面的網址遮掉後字串會變短，被切半的 email 或電話（已不成格式、遮不到）就會落進公開的 300 字內。
 * @param {string} content
 */
function preMaskCut(content) {
    // 先用字串 slice 粗截（避免對最多 5000 字整段 Array.from），再以 code point 精確截
    const rough = content.slice(0, PRE_MASK_LEN * 2);
    const chars = Array.from(rough);
    if (chars.length <= PRE_MASK_LEN && rough.length === content.length) return rough;
    let s = chars.slice(0, PRE_MASK_LEN).join('');
    if (!/\s/.test(chars[PRE_MASK_LEN] ?? ' ')) s = s.replace(CUT_TOKEN_RE, '');
    s = s.replace(CUT_AT_RE, '');
    s = s.replace(CUT_DIGITS_RE, (m) => ((m.match(/\d/g) || []).length >= 3 ? '' : m));
    return s;
}

/** ISO 時間 → 台北時區的 YYYY-MM-DD；解析失敗回 null */
function toPublicDate(iso) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    return new Intl.DateTimeFormat('en-CA', { timeZone: DATE_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}

/**
 * 轉成公開格式：截短 → 遮蔽 → 截到公開長度；只留 id／content／status／created_at（只到日期）
 * @param {Array<{id: string, content: string, status: string, created_at: string}>} rows
 */
export function toPublicFeedback(rows) {
    return (rows || []).map((r) => ({
        id: r.id,
        content: truncate(maskContact(preMaskCut(String(r.content ?? '').trim())).trim(), FEEDBACK_PUBLIC_MAX_LEN),
        status: LEGACY_STATUS[r.status] ?? r.status,
        created_at: toPublicDate(r.created_at),
    }));
}
