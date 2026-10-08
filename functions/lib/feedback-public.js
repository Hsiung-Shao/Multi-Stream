// 使用者回報（feedbacks）公開到 /status 的規則：查詢條件、聯絡資訊遮蔽、截斷
//
// 只公開內容、狀態、日期三樣；且只限送出時表單已告知會公開（public_notice=true）、站方看過（已讀以上）、未封存的回報。
// 未讀不公開＝人工把關：避免廣告、辱罵、第三方個資等遮蔽規則抓不到的內容一送出就上正式站（使用者裁定 2026-10-08）。
// 遮蔽是保險，不是唯一防線：變形寫法（「jerry at gmail dot com」等）仍可能漏網，站方要把不適合公開的回報改成「封存」。
//
// 截斷與遮蔽的順序（2026-10-08 第三輪 review 後重寫，之前「截斷後清尾段」的補丁連續兩輪出現回歸）：
//   1. 整篇正規化（全形轉半形、移除隱形字元）——先正規化再截，插入大量零寬字元也不能讓截斷點位移
//   2. 截到 PRE_MASK_LEN 個字
//   3. 遮蔽時用「等長的佔位字元」取代，不改變後面文字的位置
//   4. 在原位置截到 FEEDBACK_PUBLIC_MAX_LEN，最後才把佔位字元收合成 [•••]
//   被截斷點切半、遮不到的聯絡資訊只會出現在第 300～360 字之間，永遠不會被拉進公開的前 300 字，不需要任何清尾段的規則。
//   跨過第 300 字的聯絡資訊只要在第 360 字前結束（email、電話都遠短於 60 字）就會被完整遮蔽。
//
// 效能：這段在每次 /api/status 快取失效時對最多 30 筆執行，Workers 免費方案 CPU 只有 10 ms。
//   - 所有 regex 的量詞都有上限；email 用「找到 @ 再往左右展開」的線性掃描，不用從每個位置往前試的 regex
//   tests 鎖了最壞情況耗時。

/** 會公開的狀態（unread＝站方還沒看過、archived＝下架，都不公開）；processed 是舊後台的值，等同 fixed */
export const PUBLIC_FEEDBACK_STATUSES = ['read', 'processing', 'fixed'];
const LEGACY_STATUS = { processed: 'fixed' };
export const FEEDBACK_PUBLIC_DAYS = 30;
export const FEEDBACK_PUBLIC_LIMIT = 30;
export const FEEDBACK_PUBLIC_MAX_LEN = 300;
/** 遮蔽時看的長度：比公開長度多 60 字，讓跨過第 300 字的聯絡資訊能被完整辨識 */
const PRE_MASK_LEN = FEEDBACK_PUBLIC_MAX_LEN + 60;
export const MASK = '[•••]';
/** 遮蔽用的等長佔位字元（控制字元：正規化時已移除所有控制／格式字元，原文不可能含有） */
const HOLE = '\u0001';
const HOLE_RUN_RE = /\u0001+/g;
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

// ---------- 正規化 ----------

// 控制字元（C0，換行與 tab 除外）與看不見的格式字元：雙向控制（可反轉文字方向偽裝內容）、零寬空白／連接、
// soft hyphen、word joiner、BOM 等。夾在 email／電話中間會讓比對失敗，畫面上卻看起來完整，所以一律移除。
// U+200D（ZWJ）是 emoji 組合（👨‍👩‍👧）必需的，只在它緊鄰英數或 @ . 時才移除。
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const FORMAT_CHARS_RE = /[­᠎​‌‎‏‪-‮⁠-⁤⁦-⁩﻿]/g;
const ZWJ_IN_TEXT_RE = /(?<=[A-Za-z0-9@.])‍|‍(?=[A-Za-z0-9@.])/g;
// 全形英數與聯絡資訊常用符號（＠ ． ＋ － ＿ ＃ ／）→ 半形。不用 NFKC：它會把中文全形標點（，：（）等）一起轉掉。
const FULLWIDTH_RE = /[０-９Ａ-Ｚａ-ｚ＠．＋－＿＃／]/g;
// 夾在英數之間的中文句號當成「.」（「jerry＠gmail。com」）；中文句子裡的句號不受影響
const CJK_DOT_RE = /(?<=[A-Za-z0-9])[。｡](?=[A-Za-z0-9])/g;

/**
 * 遮蔽前的正規化。中文標點不動。
 * 正規化後的字串就是公開內容（「版本３。０」會公開成「版本3.0」）：只是外觀差異，換取不必維護原文位置對應。
 * @param {string} text
 */
function normalizeForMask(text) {
    return text
        .replace(CONTROL_CHARS_RE, '')
        .replace(FULLWIDTH_RE, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(FORMAT_CHARS_RE, '')
        .replace(ZWJ_IN_TEXT_RE, '')
        .replace(CJK_DOT_RE, '.');
}

// ---------- 遮蔽規則 ----------

// 網址：有協定或 www.；或常見社群／短網址網域（不帶協定也遮）
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'）)】」\u0001]{1,500}/giu;
const BARE_DOMAIN_RE = /\b(?:[a-z0-9-]{1,63}\.){1,4}(?:com|net|org|io|gg|me|tv|tw|jp|kr|cn|app|dev|ly|co)(?:\/[^\s<>"'）)】」\u0001]{0,300})?(?![\p{L}\p{N}])/giu;
// 帳號：@handle（前面不是英數，避免吃到 email 的一部分；email 已先被遮）、Discord 舊式 name#1234
const HANDLE_RE = /(?<![\p{L}\p{N}])@[A-Za-z0-9_.]{2,30}/gu;
const DISCRIM_RE = /\b[A-Za-z0-9_.]{2,32}#\d{4}\b/g;
// 明寫的社群帳號。一定要有明確提示才遮，否則提到平台名稱的一般句子會被誤遮
// （「The second line is cut off」「I use discord daily」「我用 Line app 分享」「Discord 是 OK 的」）：
//   R1 平台名稱＋提示詞（id／帳號／用戶名…）＋（可選分隔符號）＋含英文字母的帳號：「line id: abc」「discord 用戶名 foo_bar」
//   R2 平台名稱＋分隔符號（: ： @）＋含英文字母的帳號：「IG@foo」「line: jerry」（「line: 42」不遮）
//   R3 平台名稱＋「是／為」＋像帳號的字（含數字、底線或點）：「我的line是 abc123」
//   R4 前面是中文字＋平台名稱＋空白＋像帳號的字：「加我 ig foo.bar」
// 只遮英數帳號（不吃中文，避免「Threads：好用」被誤遮）；不收 x、tg 這種太短、容易撞到一般字的名稱
const SOCIAL_KW = '(?:line|ig|instagram|discord|telegram|facebook|fb|twitter|threads)(?![A-Za-z])';
const HANDLE_WITH_LETTER = '(?=[A-Za-z0-9_.\\-]{0,39}[A-Za-z])[A-Za-z0-9_.\\-]{2,40}';
const HANDLE_ACCOUNT_LIKE = '(?=[A-Za-z0-9_.\\-]{0,39}[0-9_.])[A-Za-z0-9_.\\-]{3,40}';
const SOCIAL_ID_RES = [
    new RegExp(`\\b${SOCIAL_KW}\\s{0,2}(?:(?:id|ID)(?![A-Za-z])|帳號|账号|用戶名|用户名|名稱|名称)\\s{0,2}[:：@]?\\s{0,2}${HANDLE_WITH_LETTER}`, 'giu'),
    new RegExp(`\\b${SOCIAL_KW}\\s{0,2}[:：@]\\s{0,2}${HANDLE_WITH_LETTER}`, 'giu'),
    new RegExp(`\\b${SOCIAL_KW}\\s{0,2}(?:是|為|为)\\s{0,2}${HANDLE_ACCOUNT_LIKE}`, 'giu'),
    new RegExp(`(?<=\\p{Script=Han}\\s{0,2})${SOCIAL_KW}\\s{1,2}${HANDLE_ACCOUNT_LIKE}`, 'giu'),
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

// ---------- email（線性掃描） ----------

// local part 以英數為主（「信箱jerry@」只吃 jerry）；緊鄰英數的非英數字母最多再吃 4 個（「王小明abc@」的姓名不外露），
// 整段沒有英數時吃非英數字母最多 16 個（「王小明@」）
const LOCAL_ASCII_RE = /[A-Za-z0-9._%+-]/;
const LOCAL_ANY_RE = /[\p{L}\p{N}]/u;
// 網域 label：第一個 label 英數開頭時，整個網域只吃英數（「gmail.com謝謝」「gmail.com.我等你」不吞中文）；
// 非英數開頭（「例子.台灣」）才吃各國文字
const LABEL_ASCII_RE = /[A-Za-z0-9-]/;
const LABEL_ANY_RE = /[\p{L}\p{N}-]/u;
const MAX_LOCAL = PRE_MASK_LEN; // 超長帳號也整段遮（真實上限 64，但不能只遮後段讓前段外露）
const MAX_LOCAL_ADJACENT = 4;
const MAX_LOCAL_NON_ASCII = 16;
const MAX_LABEL = 63;
const MAX_LABELS = 9;
const DOT_SPACES = 4; // 「gmail   .  com」

/** 從 i 往 dir 方向最多跳過 max 個空白，回傳新位置 */
function skipSpaces(s, i, max, dir) {
    let n = 0;
    while (n < max && i >= 0 && i < s.length && /\s/.test(s[i])) { i += dir; n++; }
    return i;
}

/** 以 code point 計的長度（佔位字元要和原文等長） */
function cpLength(str) {
    let n = 0;
    for (const _ of str) n++;
    return n;
}

const holeOf = (str) => HOLE.repeat(cpLength(str));

/**
 * 以 @ 為錨點找 email，換成等長佔位字元（線性時間）。
 * 左邊：@ 前最多 2 個空白，再往左吃 local part；右邊：@ 後最多 2 個空白（開頭多一個點也跳過），
 * 再吃「label(.label)+」，點的前後各允許最多 DOT_SPACES 個空白（「gmail . com」）。
 */
function maskEmails(s) {
    let out = '';
    let last = 0;
    let at = s.indexOf('@');
    while (at !== -1) {
        // 左邊
        let l = skipSpaces(s, at - 1, 2, -1);
        let n = 0;
        while (l >= last && n < MAX_LOCAL && LOCAL_ASCII_RE.test(s[l])) { l--; n++; }
        const limit = n === 0 ? MAX_LOCAL_NON_ASCII : MAX_LOCAL_ADJACENT;
        let k = 0;
        while (l >= last && k < limit && LOCAL_ANY_RE.test(s[l]) && !LOCAL_ASCII_RE.test(s[l])) { l--; k++; }
        const start = n + k > 0 ? l + 1 : -1;
        // 右邊
        let r = skipSpaces(s, at + 1, 2, 1);
        if (s[r] === '.') r = skipSpaces(s, r + 1, DOT_SPACES, 1);
        const charRe = r < s.length && LABEL_ASCII_RE.test(s[r]) ? LABEL_ASCII_RE : LABEL_ANY_RE;
        let labels = 0;
        let end = -1;
        while (labels < MAX_LABELS) {
            const labelStart = r;
            let c = 0;
            while (r < s.length && c < MAX_LABEL && charRe.test(s[r])) { r++; c++; }
            if (c === 0) { r = labelStart; break; }
            labels++;
            if (labels >= 2) end = r;
            const beforeDot = skipSpaces(s, r, DOT_SPACES, 1);
            if (s[beforeDot] !== '.') break;
            const next = skipSpaces(s, beforeDot + 1, DOT_SPACES, 1);
            if (!(next < s.length && charRe.test(s[next]))) break;
            // 點後面有空白、而前面已經是完整網域（gmail.com）時，這個點是句號（「jerry@gmail.com. Thanks」）
            if (next > beforeDot + 1 && labels >= 2) break;
            r = next;
        }
        if (start !== -1 && end !== -1) {
            out += s.slice(last, start) + holeOf(s.slice(start, end));
            last = end;
            at = s.indexOf('@', end);
        } else {
            at = s.indexOf('@', at + 1);
        }
    }
    return out + s.slice(last);
}

/**
 * 依序套用所有遮蔽規則，聯絡資訊換成等長佔位字元（已正規化的字串進、同長度字串出）
 * @param {string} s
 */
function maskToHoles(s) {
    let t = maskEmails(s);
    for (const re of [URL_RE, BARE_DOMAIN_RE, HANDLE_RE, DISCRIM_RE, ...SOCIAL_ID_RES, ...PHONE_RES, CJK_DIGITS_RE]) {
        t = t.replace(re, holeOf);
    }
    return t;
}

/**
 * 把 email、網址、帳號、電話號碼換成遮蔽符號
 * @param {string} text
 * @returns {string}
 */
export function maskContact(text) {
    if (typeof text !== 'string') return '';
    return maskToHoles(normalizeForMask(text)).replace(HOLE_RUN_RE, MASK);
}

// ---------- 公開格式 ----------

/** ISO 時間 → 台北時區的 YYYY-MM-DD；解析失敗回 null */
function toPublicDate(iso) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    return new Intl.DateTimeFormat('en-CA', { timeZone: DATE_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}

/**
 * 公開的回報內容：正規化 → 截到 PRE_MASK_LEN → 等長遮蔽 → 在原位置截到公開長度 → 收合佔位字元（見檔頭說明）
 * @param {string} content
 */
function toPublicContent(content) {
    // 正規化整篇（線性的字元替換，5000 字成本可忽略），再以 code point 截
    const normalized = normalizeForMask(String(content ?? '').trim());
    const chars = Array.from(normalized.slice(0, PRE_MASK_LEN * 2)).slice(0, PRE_MASK_LEN);
    const masked = Array.from(maskToHoles(chars.join('')));
    const truncated = masked.length > FEEDBACK_PUBLIC_MAX_LEN || normalized.length > chars.join('').length;
    const visible = masked.slice(0, FEEDBACK_PUBLIC_MAX_LEN).join('').replace(HOLE_RUN_RE, MASK);
    return truncated ? `${visible.trimEnd()}…` : visible;
}

/**
 * 轉成公開格式：只留 id／content／status／created_at（只到日期）
 * @param {Array<{id: string, content: string, status: string, created_at: string}>} rows
 */
export function toPublicFeedback(rows) {
    return (rows || []).map((r) => ({
        id: r.id,
        content: toPublicContent(r.content),
        status: LEGACY_STATUS[r.status] ?? r.status,
        created_at: toPublicDate(r.created_at),
    }));
}
