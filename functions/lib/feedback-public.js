// 使用者回報（feedbacks）公開到 /status 的規則：查詢條件、聯絡資訊遮蔽、截斷
//
// 只公開內容、狀態、日期三樣；且只限送出時表單已告知會公開（public_notice=true）、站方看過（已讀以上）、未封存的回報。
//
// 防線順序（使用者裁定 2026-10-08）：
//   1. **人工把關是主要防線**：未讀不公開，站方標「已讀」前要自己確認內容沒有個資、廣告、辱罵；不適合就封存
//   2. 自動遮蔽只是保險，**刻意保守**：只遮高信心的格式（完整 email、網址、電話、@帳號、「平台＋id／帳號／是／冒號＋帳號」）。
//      不做「猜測」型規則（例如連帶遮掉 email 旁的中文、看到平台名稱就遮後面的字）——多 agent 審查連四輪證實，
//      這類規則每修一次就在「漏遮」與「誤遮」之間擺盪一次；變形寫法（「jerry at gmail dot com」等）交給人工把關。
//
// 截斷與遮蔽的順序：
//   1. 整篇正規化後再 trim（全形轉半形、移除隱形字元）——先正規化再截，插入大量零寬字元也不能讓截斷點位移
//   2. 截到 PRE_MASK_LEN 個字
//   3. 遮蔽時用「等長的佔位字元」取代，不改變後面文字的位置
//   4. 在原位置截到 FEEDBACK_PUBLIC_MAX_LEN，最後才把佔位字元收合成 [•••]
//   被截斷點切半、遮不到的聯絡資訊只會落在第 300～440 字之間，不會被拉進公開的前 300 字。
//   跨過第 300 字的聯絡資訊只要在第 440 字前結束（email 的 local 最長 64 字＋@＋網域，電話更短）就會被完整遮蔽。
//
// 效能：這段在每次 /api/status 快取失效時對最多 30 筆執行，Workers 免費方案 CPU 只有 10 ms。
//   所有 regex 的量詞都有上限；email 用「找到 @ 再往左右展開」的線性掃描；日期 formatter 只建一次。tests 鎖了最壞耗時。

/** 會公開的狀態（unread＝站方還沒看過、archived＝下架，都不公開）；processed 是舊後台的值，等同 fixed */
export const PUBLIC_FEEDBACK_STATUSES = ['read', 'processing', 'fixed'];
const LEGACY_STATUS = { processed: 'fixed' };
export const FEEDBACK_PUBLIC_DAYS = 30;
export const FEEDBACK_PUBLIC_LIMIT = 30;
export const FEEDBACK_PUBLIC_MAX_LEN = 300;
/** 遮蔽時看的長度：比公開長度多 140 字（email local 64＋空白＋@＋網域），讓跨過第 300 字的聯絡資訊能被完整辨識 */
const PRE_MASK_LEN = FEEDBACK_PUBLIC_MAX_LEN + 140;
export const MASK = '[•••]';
/** 遮蔽用的等長佔位字元（控制字元：正規化時已移除所有控制字元，原文不可能含有） */
const HOLE = '\u0001';
const HOLE_RUN_RE = /\u0001+/g;
/** 公開日期一律以台北時區算「哪一天」（站方與多數使用者所在時區；條款只公開到「送出日期」）；formatter 只建一次 */
const DATE_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' });

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

// 控制字元（C0，換行與 tab 除外）
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
// 看不見的字元：雙向控制（可反轉文字方向偽裝內容）、零寬空白／連接、soft hyphen、word joiner、BOM、
// combining grapheme joiner、tag 字元、點字空白、韓文填充字元。夾在 email／電話中間會讓比對失敗，畫面上卻看起來完整。
const INVISIBLE_RE = /[­͏ᅟᅠ᠎​‌‎‏‪-‮⁠-⁤⁦-⁩⠀ㅤ﻿ﾠ]|[\u{E0000}-\u{E007F}]/gu;
// U+200D（ZWJ）與變體選擇器（U+FE00–FE0F）是 emoji 組合（👨‍👩‍👧、❤️）必需的，只在緊鄰英數或 @ . 時才移除
const JOINER_IN_TEXT_RE = /(?<=[A-Za-z0-9@.])[‍︀-️]|[‍︀-️](?=[A-Za-z0-9@.])/g;
// 全形英數與聯絡資訊常用符號（＠ ． ＋ － ＿ ＃ ／）→ 半形。不用 NFKC：它會把中文全形標點（，：（）等）一起轉掉。
const FULLWIDTH_RE = /[０-９Ａ-Ｚａ-ｚ＠．＋－＿＃／]/g;
// 夾在英數之間的中文句號當成「.」（「jerry＠gmail。com」）；中文句子裡的句號不受影響
const CJK_DOT_RE = /(?<=[A-Za-z0-9])[。｡](?=[A-Za-z0-9])/g;

/**
 * 遮蔽前的正規化（中文標點不動），最後才 trim：開頭結尾的隱形字元移除後留下的空白也會一起去掉。
 * 正規化後的字串就是公開內容（「版本３。０」會公開成「版本3.0」）：只是外觀差異，換取不必維護原文位置對應。
 * @param {string} text
 */
function normalizeForMask(text) {
    return text
        .replace(CONTROL_CHARS_RE, '')
        .replace(FULLWIDTH_RE, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(INVISIBLE_RE, '')
        .replace(JOINER_IN_TEXT_RE, '')
        .replace(CJK_DOT_RE, '.')
        .trim();
}

// ---------- 遮蔽規則（只收高信心格式） ----------

// 網址：有協定或 www.；或常見社群／短網址網域（不帶協定也遮）
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'）)】」\u0001]{1,500}/giu;
const BARE_DOMAIN_RE = /\b(?:[a-z0-9-]{1,63}\.){1,4}(?:com|net|org|io|gg|me|tv|tw|jp|kr|cn|app|dev|ly|co)(?:\/[^\s<>"'）)】」\u0001]{0,300})?(?![\p{L}\p{N}])/giu;
// @handle：前面不是英數（中文緊接也算，「請加我@jerry_wang」）；email 已先被遮，不會吃到 email 的一部分
const HANDLE_RE = /(?<![A-Za-z0-9])@[A-Za-z0-9_.]{2,30}/g;
// Discord 舊式 name#1234
const DISCRIM_RE = /\b[A-Za-z0-9_.]{2,32}#\d{4}\b/g;
// 社群帳號：只收明確寫出的格式。平台名稱後面一定要有提示詞或分隔符號，帳號一定要含英文字母。
//   S1 平台＋提示詞（id／帳號／用戶名…）＋可選分隔（: ： @ = 是 為 is）＋帳號：「line id: abc」「LINE ID 是 abc123」
//      「line帳號是jerry123」「my line id is jerry99」「discord 用戶名 foo_bar」
//   S2 平台＋分隔符號（: ： @）＋帳號：「IG@foo」「line: jerry」（「line: 42」沒有英文字母，不遮）
//   S3 平台＋「是／為」＋帳號，帳號要像帳號（含數字、底線、點，或至少 5 個字）：「我的line是 abc123」「我的discord是Jerry」
//      （「Discord 是 OK 的」「Line 是 1.2.3」不遮）
// 「加我 ig foo.bar」「我用 Line app」這種沒有提示詞的寫法刻意不猜，交給人工把關。不收 x、tg 這種太短的名稱。
const SOCIAL_KW = '(?:line|ig|instagram|discord|telegram|facebook|fb|twitter|threads)(?![A-Za-z])';
const SOCIAL_HINT = '(?:(?:id|ID)(?![A-Za-z])|帳號|账号|用戶名|用户名|名稱|名称)';
const SOCIAL_SEP = '(?:[:：@=]|是|為|为|is(?![A-Za-z]))';
const HANDLE_WITH_LETTER = '(?=[A-Za-z0-9_.\\-]{0,39}[A-Za-z])[A-Za-z0-9_.\\-]{2,40}';
const HANDLE_ACCOUNT_LIKE = '(?=[A-Za-z0-9_.\\-]{0,39}[A-Za-z])(?:(?=[A-Za-z0-9_.\\-]{0,39}[0-9_.])[A-Za-z0-9_.\\-]{3,40}|[A-Za-z0-9_.\\-]{5,40})';
const SOCIAL_ID_RES = [
    new RegExp(`\\b${SOCIAL_KW}\\s{0,2}${SOCIAL_HINT}\\s{0,2}(?:${SOCIAL_SEP}\\s{0,2})?${HANDLE_WITH_LETTER}`, 'giu'),
    new RegExp(`\\b${SOCIAL_KW}\\s{0,2}[:：@]\\s{0,2}${HANDLE_WITH_LETTER}`, 'giu'),
    new RegExp(`\\b${SOCIAL_KW}\\s{0,2}(?:是|為|为)\\s{0,2}${HANDLE_ACCOUNT_LIKE}`, 'giu'),
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

// local part 只吃英數（「信箱jerry@」只遮 jerry@…，不吞前面的中文）。
// 非英數的 local part（「王小明@例子.台灣」）只在網域本身也是非英數（IDN）時才算 email，最多 16 字。
const LOCAL_ASCII_RE = /[A-Za-z0-9._%+-]/;
const LOCAL_ANY_RE = /[\p{L}\p{N}]/u;
// 網域：第一個 label 英數開頭時整個網域只吃英數（「gmail.com謝謝」「gmail.com.我等你」不吞中文）；非英數開頭才吃各國文字
const LABEL_ASCII_RE = /[A-Za-z0-9-]/;
const LABEL_ANY_RE = /[\p{L}\p{N}-]/u;
const MAX_LOCAL = 64;
const MAX_LOCAL_NON_ASCII = 16;
const MAX_LABEL = 63;
const MAX_LABELS = 9;
const AT_SPACES = 2; // 「jerry @ gmail.com」
const DOT_SPACES = 2; // 「gmail . com」「gmail .com」；「gmail. com」只在接常見頂級網域時才算（避免把句號後的字當網域）
const COMMON_TLD_RE = /^(?:com|net|org|edu|gov|io|tw|jp|kr|cn|hk|co|me|tv|gg|app|dev)(?![A-Za-z0-9-])/i;

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

/** 從 r 開始讀網域（label(.label)+），回傳結束位置或 -1；ascii=true 時只吃英數 */
function scanDomain(s, r, charRe) {
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
        // 點後面有空白、前面沒有時可能是句號（「me@home. Thanks」）：只有接常見頂級網域時才當成網域（「gmail. com」）
        const spacedBefore = beforeDot > r;
        const spacedAfter = next > beforeDot + 1;
        if (spacedAfter && !spacedBefore && !COMMON_TLD_RE.test(s.slice(next, next + 8))) break;
        r = next;
    }
    return end;
}

/**
 * 以 @ 為錨點找 email，換成等長佔位字元（線性時間）。
 */
function maskEmails(s) {
    let out = '';
    let last = 0;
    let at = s.indexOf('@');
    while (at !== -1) {
        // 右邊：@ 後最多 2 個空白，再讀網域
        const r = skipSpaces(s, at + 1, AT_SPACES, 1);
        const asciiDomain = r < s.length && LABEL_ASCII_RE.test(s[r]);
        const end = scanDomain(s, r, asciiDomain ? LABEL_ASCII_RE : LABEL_ANY_RE);
        // 左邊：@ 前最多 2 個空白，再往左吃 local part
        let l = skipSpaces(s, at - 1, AT_SPACES, -1);
        let n = 0;
        while (l >= last && n < MAX_LOCAL && LOCAL_ASCII_RE.test(s[l])) { l--; n++; }
        if (n === 0 && !asciiDomain) {
            while (l >= last && n < MAX_LOCAL_NON_ASCII && LOCAL_ANY_RE.test(s[l])) { l--; n++; }
        }
        const start = n > 0 ? l + 1 : -1;
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
    return Number.isFinite(t) ? DATE_FMT.format(new Date(t)) : null;
}

/**
 * 公開的回報內容：正規化 → 截到 PRE_MASK_LEN → 等長遮蔽 → 在原位置截到公開長度 → 收合佔位字元（見檔頭說明）
 * 收合後 [•••] 可能比被遮的原文長（例如 3 字的帳號），所以收合後再確保不超過公開長度。
 * @param {string} content
 */
function toPublicContent(content) {
    // 正規化整篇（線性的字元替換，5000 字成本可忽略），再以 code point 截
    const normalized = normalizeForMask(String(content ?? ''));
    const head = Array.from(normalized.slice(0, PRE_MASK_LEN * 2)).slice(0, PRE_MASK_LEN).join('');
    const masked = Array.from(maskToHoles(head));
    let visible = masked.slice(0, FEEDBACK_PUBLIC_MAX_LEN).join('').replace(HOLE_RUN_RE, MASK);
    const vChars = Array.from(visible);
    if (vChars.length > FEEDBACK_PUBLIC_MAX_LEN) {
        // 收合把字數撐超過上限：截回上限，並去掉被切到一半的 [•••]
        visible = vChars.slice(0, FEEDBACK_PUBLIC_MAX_LEN).join('').replace(/\[•{0,3}$/u, '');
    }
    const truncated = masked.length > FEEDBACK_PUBLIC_MAX_LEN || normalized.length > head.length;
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
