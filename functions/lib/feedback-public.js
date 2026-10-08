// 使用者回報（feedbacks）公開到 /status 的規則：查詢條件、聯絡資訊遮蔽、截斷
//
// 只公開內容、狀態、日期三樣；且只限送出時表單已告知會公開（public_notice=true）、站方看過（已讀以上）、未封存的回報。
// 未讀不公開＝人工把關：避免廣告、辱罵、第三方個資等遮蔽規則抓不到的內容一送出就上正式站（使用者裁定 2026-10-08）。
// 遮蔽是保險，不是唯一防線：站方仍要在後台把不適合公開的回報改成「封存」。
//
// 效能：這段在每次 /api/status 快取失效時對最多 30 筆執行，Workers 免費方案 CPU 只有 10 ms。
// 所以先截到 PRE_MASK_LEN 再遮蔽，所有 regex 的量詞都有上限，避免長字串造成二次方回溯（tests 鎖了最壞情況耗時）。

/** 會公開的狀態（unread＝站方還沒看過、archived＝下架，都不公開） */
export const PUBLIC_FEEDBACK_STATUSES = ['read', 'processing', 'fixed'];
export const FEEDBACK_PUBLIC_DAYS = 30;
export const FEEDBACK_PUBLIC_LIMIT = 30;
export const FEEDBACK_PUBLIC_MAX_LEN = 300;
/** 遮蔽前先截的長度：比公開長度多留一些，避免截斷點剛好切在 email／網址中間而漏遮 */
const PRE_MASK_LEN = FEEDBACK_PUBLIC_MAX_LEN + 60;
export const MASK = '[•••]';

/**
 * 公開頁的 PostgREST 查詢（只 select 公開欄位）
 * @param {number} nowMs
 */
export function publicFeedbackQuery(nowMs) {
    const since = new Date(nowMs - FEEDBACK_PUBLIC_DAYS * 24 * 60 * 60 * 1000).toISOString();
    return 'feedbacks?select=id,content,status,created_at'
        + '&public_notice=eq.true'
        + `&status=in.(${PUBLIC_FEEDBACK_STATUSES.join(',')})`
        + `&created_at=gte.${encodeURIComponent(since)}`
        + `&order=created_at.desc&limit=${FEEDBACK_PUBLIC_LIMIT}`;
}

// 雙向控制字元（可在頁面上反轉文字方向偽裝內容）
const BIDI_RE = /[‪-‮⁦-⁩‎‏]/g;
// email：@ 前後允許空白（「a @ b.com」）；網域可含非 ASCII（「王@例子.台灣」）；所有量詞有上限
const EMAIL_RE = /[\p{L}\p{N}._%+-]{1,64}\s{0,2}@\s{0,2}[\p{L}\p{N}-]{1,63}(?:\.[\p{L}\p{N}-]{1,63}){1,8}/gu;
// 網址：有協定或 www.；或常見社群／短網址網域（不帶協定也遮）
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'）)】」]{1,500}/giu;
const BARE_DOMAIN_RE = /\b(?:[a-z0-9-]{1,63}\.){1,4}(?:com|net|org|io|gg|me|tv|tw|jp|kr|cn|app|dev|ly|co)(?:\/[^\s<>"'）)】」]{0,300})?(?![\p{L}\p{N}])/giu;
// 帳號：@handle（前面不是英數，避免吃到 email 的一部分；email 已先被遮）、Discord 舊式 name#1234
const HANDLE_RE = /(?<![\p{L}\p{N}])@[A-Za-z0-9_.]{2,30}/gu;
const DISCRIM_RE = /\b[A-Za-z0-9_.]{2,32}#\d{4}\b/g;
// 電話：只認實際格式，不認「任意 8 碼數字」（錯誤碼、VOD 編號、日期不該被遮）
//   台灣手機：09 開頭共 10 碼，數字之間可任意夾空白 . -（含「0912-34-56 78」這種怪分組）
//   市話：(0x)xxxx-xxxx，前面不能緊接數字（避免把「(404) 12345678」的 04) 當區碼）
//   國際：+886 9xx xxx xxx
const PHONE_RES = [
    /(?<!\d)09(?:[\s.\-]?\d){8}(?!\d)/g,
    /(?<!\d)\(?0\d{1,2}\)?[\s.\-]?\d{3,4}[\s.\-]?\d{4}(?!\d)/g,
    /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}(?!\d)/g,
];
// 明寫的社群帳號：「line id: xxx」「IG：xxx」「discord xxx」之類，冒號後面的帳號一併遮
const SOCIAL_ID_RE = /\b(?:line|ig|instagram|discord|telegram|tg|fb|facebook|twitter|x|threads)\s{0,2}(?:id)?\s{0,2}[:：]\s{0,2}[^\s，。、,]{2,40}/giu;
// 國字數字電話（「零九一二三四五六七八」）：連續 8 個以上
const CJK_DIGITS_RE = /[零〇一二三四五六七八九]{8,20}/g;

// 全形英數與聯絡資訊常用符號（＠ ． ＋ － ＿ ＃ ／）→ 半形，讓「ｊｅｒｒｙ＠ｇｍａｉｌ」「０９１２…」也能被比對。
// 不用 NFKC：它會把中文全形標點（，：（）等）一起轉成半形，改掉使用者原本的文字。
const FULLWIDTH_RE = /[０-９Ａ-Ｚａ-ｚ＠．＋－＿＃／]/g;

/**
 * 把 email、網址、帳號、電話號碼換成遮蔽符號
 * 先把全形英數與 ＠ 等符號轉半形（中文標點不動）、移除雙向控制字元，再依序遮蔽。
 * @param {string} text
 * @returns {string}
 */
export function maskContact(text) {
    if (typeof text !== 'string') return '';
    let s = text
        .replace(FULLWIDTH_RE, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(BIDI_RE, '');
    s = s.replace(EMAIL_RE, MASK)
        .replace(URL_RE, MASK)
        .replace(BARE_DOMAIN_RE, MASK)
        .replace(HANDLE_RE, MASK)
        .replace(DISCRIM_RE, MASK)
        .replace(SOCIAL_ID_RE, MASK);
    for (const re of PHONE_RES) s = s.replace(re, MASK);
    return s.replace(CJK_DIGITS_RE, MASK);
}

/** 以字元（code point）截斷，不切壞 emoji 等 surrogate pair */
function truncate(text, max) {
    const chars = Array.from(text);
    return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
}

/**
 * 轉成公開格式：先截短（控制 regex 成本）→ 遮蔽 → 截到公開長度；只留 id／content／status／created_at
 * @param {Array<{id: string, content: string, status: string, created_at: string}>} rows
 */
export function toPublicFeedback(rows) {
    return (rows || []).map((r) => {
        const raw = Array.from(String(r.content ?? '').trim()).slice(0, PRE_MASK_LEN).join('');
        return { id: r.id, content: truncate(maskContact(raw).trim(), FEEDBACK_PUBLIC_MAX_LEN), status: r.status, created_at: r.created_at };
    });
}
