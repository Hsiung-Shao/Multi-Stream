/** 把聊天訊息切成 文字／表情／連結（純函式；渲染端只輸出 React 節點，不用 innerHTML） */
import type { TwitchEmoteRange } from './ircParse';

export type MessagePart =
    | { type: 'text'; text: string }
    | { type: 'emote'; name: string; url: string }
    | { type: 'link'; href: string; text: string };

export const twitchEmoteUrl = (id: string) => `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/1.0`;

const LINK = /^https?:\/\/\S+$/i;

/** 一段一般文字：依空白切詞，整詞相符的第三方表情與 http(s) 連結換掉，其餘併回文字 */
function splitWords(text: string, thirdParty: ReadonlyMap<string, string>, out: MessagePart[]) {
    let buf = '';
    for (const tok of text.split(/(\s+)/)) {
        const emote = tok && thirdParty.get(tok);
        const isLink = LINK.test(tok);
        if (!emote && !isLink) { buf += tok; continue; }
        if (buf) out.push({ type: 'text', text: buf });
        buf = '';
        out.push(emote ? { type: 'emote', name: tok, url: emote } : { type: 'link', href: tok, text: tok });
    }
    if (buf) out.push({ type: 'text', text: buf });
}

export function messageParts(text: string, emotes: TwitchEmoteRange[], thirdParty: ReadonlyMap<string, string>): MessagePart[] {
    // Twitch 的表情位置以 code point 計，emoji 佔兩個 UTF-16 單位，所以先轉成 code point 陣列
    const chars = Array.from(text);
    const out: MessagePart[] = [];
    let pos = 0;
    for (const e of emotes) {
        if (e.start < pos || e.end >= chars.length) continue;
        if (e.start > pos) splitWords(chars.slice(pos, e.start).join(''), thirdParty, out);
        out.push({ type: 'emote', name: chars.slice(e.start, e.end + 1).join(''), url: twitchEmoteUrl(e.id) });
        pos = e.end + 1;
    }
    if (pos < chars.length) splitWords(chars.slice(pos).join(''), thirdParty, out);
    return out;
}

/** 使用者自訂的名字顏色：只收 #RRGGBB；太暗（深色底上看不見）就往白色混到夠亮 */
export function readableColor(color: string | undefined): string | undefined {
    if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return undefined;
    let rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
    const lum = (c: number[]) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    if (lum(rgb) >= 0.35) return color;
    while (lum(rgb) < 0.35) rgb = rgb.map(c => Math.round(c + (255 - c) * 0.15));
    return `#${rgb.map(c => c.toString(16).padStart(2, '0')).join('')}`;
}
