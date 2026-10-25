/**
 * 時間軸文字（常見的直播留言／說明欄歌單）解析成片段列，供後台貼上後批次建立。
 *
 * - 純函式、零 DOM；只負責「拆行」，不判斷對錯（缺結束、重疊等交給 segmentValidation）。
 * - 每行先 NFKC 正規化（全形數字、冒號、斜線、句點轉半形），再去掉行首編號（01.、1)、#1、1、）。
 * - 去編號後行首必須是 colon 格式時間，否則整行略過（標題行、空行）；`start-end`、`start~end` 取兩端。
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
const TIME_RE = new RegExp(`^(${TIME})(?:\\s*[-~–—]\\s*(${TIME}))?`);
const SEPARATOR_RE = /\/|\s-\s|\sby\s/i;

export function parseTimeline(text: string): ParsedRow[] {
    const rows: ParsedRow[] = [];
    const lines = text.split(/\r\n|\r|\n/);

    lines.forEach((raw, line) => {
        const normalized = raw.normalize('NFKC').replace(NUMBERING_RE, '').trimStart();
        const match = TIME_RE.exec(normalized);
        if (!match) return;

        const start = parseTimecode(match[1]);
        if (start === null) return;
        const end = match[2] ? parseTimecode(match[2]) : null;

        const rest = normalized.slice(match[0].length).trim();
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

    return rows;
}
