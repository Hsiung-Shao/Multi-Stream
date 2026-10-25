/**
 * 時間軸文字（常見的直播留言／說明欄歌單）解析成片段列，供後台貼上後批次建立。
 *
 * - 純函式、零 DOM；只負責「拆行」，不判斷對錯（缺結束、重疊等交給 segmentValidation）。
 * - 每行先 NFKC 正規化（全形數字、冒號、斜線、句點轉半形），再去掉行首編號（01.、1)、#1、1、）。
 * - 去編號後行首必須是 colon 格式時間（可被 []、()、【】 包住），否則整行略過（標題行、空行）；`start-end`、`start~end`、`start〜end` 取兩端。
 * - 時間後開頭的「分隔符＋空白」（- – — : |）或純空白先剝掉（-ERROR- 這類緊貼的標題保留），所以「00:00 - Opening」的標題是 Opening。
 * - 行內「看起來有時間」卻沒能解析成列（時間不在行首、區間結束時間不合法）→ 行號記入 unparsed，讓 UI 提示使用者；純文字與空行不算。
 * - 時間後的文字依「第一個」分隔符切成 歌名 / 原唱：`/`、` - `（前後要有空白，Spider-Man 不會被切）、` by `（不分大小寫）。
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
const LEADING_SEPARATORS_RE = /^\s*(?:[-–—:|｜]\s+|\s+)/;
/** 行內任何看起來像時間的字樣（用來判斷「這行應該是歌卻沒解析成功」） */
const TIME_LIKE_RE = /\d{1,2}:\d{2}/;
const SEPARATOR_RE = /\/|\s-\s|\sby\s/i;

export interface ParseResult {
    rows: ParsedRow[];
    /** 含時間樣式卻無法解析成列的行號（0-based） */
    unparsed: number[];
}

export function parseTimeline(text: string): ParsedRow[] {
    return parseTimelineDetailed(text).rows;
}

export function parseTimelineDetailed(text: string): ParseResult {
    const rows: ParsedRow[] = [];
    const unparsed: number[] = [];
    const lines = text.split(/\r\n|\r|\n/);

    lines.forEach((raw, line) => {
        const normalized = raw.normalize('NFKC').replace(NUMBERING_RE, '').trimStart();
        const match = TIME_RE.exec(normalized);
        if (!match) {
            if (TIME_LIKE_RE.test(normalized)) unparsed.push(line);
            return;
        }

        const start = parseTimecode(match[1]);
        const end = match[2] ? parseTimecode(match[2]) : null;
        if (start === null || (match[2] && end === null)) {
            unparsed.push(line);
            return;
        }

        const rest = normalized.slice(match[0].length).replace(LEADING_SEPARATORS_RE, '').trim();
        let title = rest;
        let artist: string | null = null;
        const sep = SEPARATOR_RE.exec(rest);
        if (sep) {
            title = rest.slice(0, sep.index).trim();
            artist = rest.slice(sep.index + sep[0].length).trim() || null;
        }

        rows.push({ start, end, title, artist, line });
    });

    // 沒有明確結束的列：結束 = 下一列開始；最後一列維持 null
    for (let i = 0; i < rows.length - 1; i++) {
        if (rows[i].end === null) rows[i].end = rows[i + 1].start;
    }

    return { rows, unparsed };
}
