/**
 * 時間字串 ↔ 秒數：歌曲片段的起訖時間輸入與顯示共用。
 *
 * - 純函式、零 DOM。
 * - 接受純秒數（754）、colon 格式（m:ss、h:mm:ss）、單位格式（1h2m3s、2m3s、45s），前後空白忽略。
 * - colon 格式除第一段外每段必須兩位數且 0–59（12:75、1:2:3 都是非法），避免把打錯的時間悄悄算成別的秒數。
 * - 非法輸入一律回 null；回傳值一律為整數秒。
 */

const PLAIN_RE = /^\d+$/;
const COLON_RE = /^(\d+):(\d{2})(?::(\d{2}))?$/;
const UNIT_RE = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i;

export function parseTimecode(input: string): number | null {
    const text = input.trim();
    if (!text) return null;

    if (PLAIN_RE.test(text)) return Number(text);

    const colon = COLON_RE.exec(text);
    if (colon) {
        const [, first, second, third] = colon;
        if (third === undefined) {
            // m:ss
            const sec = Number(second);
            return sec <= 59 ? Number(first) * 60 + sec : null;
        }
        // h:mm:ss
        const min = Number(second);
        const sec = Number(third);
        if (min > 59 || sec > 59) return null;
        return Number(first) * 3600 + min * 60 + sec;
    }

    const unit = UNIT_RE.exec(text);
    if (unit && (unit[1] !== undefined || unit[2] !== undefined || unit[3] !== undefined)) {
        return Number(unit[1] ?? 0) * 3600 + Number(unit[2] ?? 0) * 60 + Number(unit[3] ?? 0);
    }

    return null;
}

/** 秒數轉顯示字串：不滿 1 小時為 m:ss，否則 h:mm:ss */
export function formatTimecode(sec: number): string {
    const total = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const ss = String(s).padStart(2, '0');
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
    return `${m}:${ss}`;
}
