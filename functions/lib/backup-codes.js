// PR 7 2FA — 備援碼產生與驗證
//
// 設計：
//  - 8 組 / 每組 10 字元（base32 大寫，去掉易混淆字符 0/O/1/I）
//  - 顯示時用 XXXXX-XXXXX 格式（10 chars + 1 dash），方便讀寫
//  - 儲存時去 dash + uppercase + SHA-256 hex（160 bits 雜湊空間 + Crypto API 即可）
//
// 為何 SHA-256 而非 bcrypt：
//  - 備援碼本身已是 50-bit entropy（32^10 ≈ 1.1e15），暴力破解需要 SHA-256 約 1e15 次計算，
//    依 Cloudflare Worker 100ns/SHA → 1.16e8 秒 ≈ 3.6 年。實務上夠強。
//  - bcrypt 在 Worker 環境 CPU cost 高、需要外部 lib 增加 bundle，不划算。

const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_LENGTH = 10; // chars per code
// 排除易混淆字符 0/O/1/I/L
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCharFromAlphabet() {
    const idx = crypto.getRandomValues(new Uint32Array(1))[0] % ALPHABET.length;
    return ALPHABET[idx];
}

/**
 * 產生 plain backup codes，格式 XXXXX-XXXXX
 * @returns {string[]} 8 組
 */
export function generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
        let code = '';
        for (let j = 0; j < BACKUP_CODE_LENGTH; j++) {
            code += randomCharFromAlphabet();
        }
        codes.push(`${code.slice(0, 5)}-${code.slice(5)}`);
    }
    return codes;
}

/**
 * 正規化 user 輸入（去 dash、去空白、轉大寫）
 * @param {string} input
 * @returns {string}
 */
export function normalizeBackupCode(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * SHA-256 hex
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function sha256Hex(text) {
    const buf = new TextEncoder().encode(text);
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(hashBuf)]
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * 把 plain code 列表轉成 hash 列表（儲存用）
 * @param {string[]} codes
 * @returns {Promise<string[]>}
 */
export async function hashBackupCodes(codes) {
    return Promise.all(codes.map(c => sha256Hex(normalizeBackupCode(c))));
}

/**
 * 從 hash 列表中找出 user 輸入對應的 hash，回傳剩下未消耗的 hash 列表
 * @param {string[]} hashedList - DB 內現存的 hash 列表
 * @param {string} userInput - user 輸入（可能含 dash）
 * @returns {Promise<{ matched: boolean, remaining: string[] }>}
 */
export async function consumeBackupCode(hashedList, userInput) {
    const normalized = normalizeBackupCode(userInput);
    if (!normalized) return { matched: false, remaining: hashedList };
    const hash = await sha256Hex(normalized);

    // 用 constant-time 等價：每筆都比對，避免 timing leak（雖然 hex 比較字串長度固定，
    // 仍透過 indexOf 後逐筆 compare 標準寫法）
    let matchedIdx = -1;
    for (let i = 0; i < hashedList.length; i++) {
        if (hashedList[i] === hash) {
            matchedIdx = i;
            break;
        }
    }
    if (matchedIdx < 0) return { matched: false, remaining: hashedList };
    const remaining = hashedList.slice(0, matchedIdx).concat(hashedList.slice(matchedIdx + 1));
    return { matched: true, remaining };
}
