/**
 * 時間軸文字（常見的直播留言／說明欄歌單）解析成片段列，供後台貼上後批次建立。
 *
 * - 純函式、零 DOM；只負責「拆行」，不判斷對錯（缺結束、重疊等交給 segmentValidation）。
 * - 正規化（NFKC：全形或數學粗體數字、冒號、句點轉半形）只作用在行首「編號＋時間（含區間、括號）」這段前綴；
 *   歌名、原唱從「原文」對應位置切出（只 trim），所以「愛，存在」的全形標點、全形英數都會保留。
 *   NFKC 會改變長度（數學粗體數字是代理對），因此逐字元正規化並記下每個輸出字元對應的原文位置。
 * - 去編號（01.、1)、#1、1、）後行首必須是 colon 格式時間（可被 []、()、【】 包住），否則整行略過（標題行、空行）；`start-end`、`start~end`、`start〜end` 取兩端。
 * - 時間後開頭的「分隔符＋空白」（- – — : |）或純空白先剝掉（-ERROR- 這類緊貼的標題保留），所以「00:00 - Opening」的標題是 Opening。
 * - 行內「看起來有時間」卻沒能解析成列（時間不在行首、區間結束時間不合法）→ 行號記入 unparsed，讓 UI 提示使用者；純文字與空行不算。
 * - 時間後的文字依「第一個」分隔符切成 歌名 / 原唱：`/`（含全形／）、` - `（前後要有空白，Spider-Man 不會被切）、` by `（不分大小寫）。
 * - 行首（去前導空白）是 └ ├ │ 的行是「同首歌的其他版本」：行號進 variants，不產生列、不進 unparsed。
 * - 已有至少 1 列後，遇到不含時間樣式、但含「時間軸」「timestamp」「タイムスタンプ」的標題行：往後找下一個能解析出開始時間的行，
 *   若其開始秒數 ≤ 已解析最後一首的開始（時間重新起算 = 另一份清單，如聊天精華）→ 停止解析（stoppedAt 為該標題行號），之後全部忽略；
 *   否則只略過標題行繼續解析。找不到後續時間行時也停止。尚未有列時只當一般標題行略過。
 * - 沒有明確結束的列，結束取下一列開始；最後一列為 null。結果維持原始順序，不排序。
 */
import { parseTimecode } from './timecode';

export interface ParsedRow {
    start: number;
    end: number | null;
    title: string;
    artist: string | null;
    /** 原始文字中的行號（0-based） */
    line: number;
}

const TIME = String.raw`\d{1,3}(?::\d{2}){1,2}(?!\d)`;
const NUMBERING_RE = /^\s*(?:#\d+|\d+[.)、])\s*/;
const TIME_RE = new RegExp(`^[\\[(【]?\\s*(${TIME})(?:\\s*[-~–—〜]\\s*(${TIME}))?\\s*[\\])】]?`);
const LEADING_SEPARATORS_RE = /^\s*(?:[-－–—:：|｜]\s+|\s+)/;
/** 行內任何看起來像時間的字樣（用來判斷「這行應該是歌卻沒解析成功」） */
const TIME_LIKE_RE = /\d{1,2}:\d{2}/;
const SEPARATOR_RE = /[/／]|\s[-－]\s|\sby\s/i;
const VARIANT_RE = /^\s*[└├│]/;
const STOP_RE = /時間軸|timestamp|タイムスタンプ/i;

export interface ParseResult {
    rows: ParsedRow[];
    /** 含時間樣式卻無法解析成列的行號（0-based） */
    unparsed: number[];
    /** 重唱／其他版本子行（└ ├ │ 開頭）的行號 */
    variants: number[];
    /** 遇到「時間軸／timestamp」段落標題而停止時的行號；沒有停止為 null */
    stoppedAt: number | null;
}

export function parseTimeline(text: string): ParsedRow[] {
    return parseTimelineDetailed(text).rows;
}

/**
 * 逐字元 NFKC：回傳正規化字串，與每個輸出字元在原文中的起始位置（UTF-16 offset）。
 * offsets 多一格放 raw.length，方便「前綴長度 → 原文切點」直接查表。
 */
function normalizeWithOffsets(raw: string): { norm: string; offsets: number[] } {
    let norm = '';
    const offsets: number[] = [];
    let at = 0;
    for (const ch of raw) {
        const n = ch.normalize('NFKC');
        for (let i = 0; i < n.length; i++) offsets.push(at);
        norm += n;
        at += ch.length;
    }
    offsets.push(raw.length);
    return { norm, offsets };
}

/** 該行（去編號後）行首若是合法時間，回傳開始秒數；否則 null。用來往後偷看下一個時間行 */
function leadingStart(raw: string): number | null {
    const { norm } = normalizeWithOffsets(raw);
    let pos = NUMBERING_RE.exec(norm)?.[0].length ?? 0;
    pos += /^\s*/.exec(norm.slice(pos))![0].length;
    const match = TIME_RE.exec(norm.slice(pos));
    return match ? parseTimecode(match[1]) : null;
}

export function parseTimelineDetailed(text: string): ParseResult {
    const rows: ParsedRow[] = [];
    const unparsed: number[] = [];
    const variants: number[] = [];
    let stoppedAt: number | null = null;
    const lines = text.split(/\r\n|\r|\n/);

    for (let line = 0; line < lines.length; line++) {
        const raw = lines[line];

        if (VARIANT_RE.test(raw)) {
            variants.push(line);
            continue;
        }

        const { norm, offsets } = normalizeWithOffsets(raw);

        // 前綴（編號＋時間）只在正規化後的字串上辨識
        let pos = NUMBERING_RE.exec(norm)?.[0].length ?? 0;
        pos += /^\s*/.exec(norm.slice(pos))![0].length;
        const match = TIME_RE.exec(norm.slice(pos));

        if (!match) {
            const timeLike = TIME_LIKE_RE.test(norm);
            if (!timeLike && rows.length > 0 && STOP_RE.test(norm)) {
                // 只有「後面的時間重新起算」才是另一份清單（聊天精華）；否則只是歌單中間的標題行，略過繼續
                let nextStart: number | null = null;
                for (let j = line + 1; j < lines.length && nextStart === null; j++) {
                    if (!VARIANT_RE.test(lines[j])) nextStart = leadingStart(lines[j]);
                }
                if (nextStart === null || nextStart <= rows[rows.length - 1].start) {
                    stoppedAt = line;
                    break;
                }
            }
            if (timeLike) unparsed.push(line);
            continue;
        }

        const start = parseTimecode(match[1]);
        const end = match[2] ? parseTimecode(match[2]) : null;
        if (start === null || (match[2] && end === null)) {
            unparsed.push(line);
            continue;
        }

        // 歌名、原唱從原文切出：前綴結束位置換算回原文 offset
        const rest = raw.slice(offsets[pos + match[0].length]).replace(LEADING_SEPARATORS_RE, '').trim();
        let title = rest;
        let artist: string | null = null;
        const sep = SEPARATOR_RE.exec(rest);
        if (sep) {
            title = rest.slice(0, sep.index).trim();
            artist = rest.slice(sep.index + sep[0].length).trim() || null;
        }

        rows.push({ start, end, title, artist, line });
    }

    // 沒有明確結束的列：結束 = 下一列開始；最後一列維持 null
    for (let i = 0; i < rows.length - 1; i++) {
        if (rows[i].end === null) rows[i].end = rows[i + 1].start;
    }

    return { rows, unparsed, variants, stoppedAt };
}
