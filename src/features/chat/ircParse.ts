/** Twitch 聊天（IRC over WebSocket）的單行解析（純函式） */

export interface IrcMessage {
    tags: Record<string, string>;
    prefix?: string;
    command: string;
    params: string[];
}

/** Twitch 表情位置：start／end 以 Unicode code point 計（含 end） */
export interface TwitchEmoteRange {
    id: string;
    start: number;
    end: number;
}

export interface ChatMessage {
    id: string;
    channel: string;
    user: string;
    displayName: string;
    color?: string;
    text: string;
    emotes: TwitchEmoteRange[];
    roomId?: string;
    ts: number;
    action: boolean;
}

const unescapeTag = (v: string) =>
    v.replace(/\\(.)/g, (_, c: string) => (c === 's' ? ' ' : c === ':' ? ';' : c === 'r' ? '\r' : c === 'n' ? '\n' : c));

/** IRCv3：`@tags :prefix COMMAND params :trailing` */
export function parseIrc(line: string): IrcMessage | null {
    let rest = line.trim();
    if (!rest) return null;
    const tags: Record<string, string> = {};
    if (rest.startsWith('@')) {
        const sp = rest.indexOf(' ');
        if (sp < 0) return null;
        for (const kv of rest.slice(1, sp).split(';')) {
            const eq = kv.indexOf('=');
            if (eq < 0) tags[kv] = '';
            else tags[kv.slice(0, eq)] = unescapeTag(kv.slice(eq + 1));
        }
        rest = rest.slice(sp + 1).trimStart();
    }
    let prefix: string | undefined;
    if (rest.startsWith(':')) {
        const sp = rest.indexOf(' ');
        if (sp < 0) return null;
        prefix = rest.slice(1, sp);
        rest = rest.slice(sp + 1).trimStart();
    }
    const trailingAt = rest.indexOf(' :');
    const head = trailingAt >= 0 ? rest.slice(0, trailingAt) : rest;
    const parts = head.split(' ').filter(Boolean);
    const command = parts.shift();
    if (!command) return null;
    if (trailingAt >= 0) parts.push(rest.slice(trailingAt + 2));
    return { tags, prefix, command, params: parts };
}

/** "25:0-4,12-16/1902:6-10" → 依 start 排序 */
export function parseEmotesTag(tag: string | undefined): TwitchEmoteRange[] {
    if (!tag) return [];
    const out: TwitchEmoteRange[] = [];
    for (const group of tag.split('/')) {
        const [id, ranges] = group.split(':');
        if (!id || !ranges) continue;
        for (const r of ranges.split(',')) {
            const [s, e] = r.split('-').map(Number);
            if (Number.isInteger(s) && Number.isInteger(e) && e >= s) out.push({ id, start: s, end: e });
        }
    }
    return out.sort((a, b) => a.start - b.start);
}

const ACTION = /^\u0001ACTION (.*)\u0001$/s;

export function toChatMessage(m: IrcMessage): ChatMessage | null {
    if (m.command !== 'PRIVMSG' || m.params.length < 2) return null;
    const channel = m.params[0].replace(/^#/, '').toLowerCase();
    let text = m.params[1];
    const act = ACTION.exec(text);
    if (act) text = act[1];
    const user = (m.prefix ?? '').split('!')[0].toLowerCase();
    const ts = Number(m.tags['tmi-sent-ts']);
    return {
        id: m.tags.id || `${channel}-${user}-${Date.now()}-${Math.random()}`,
        channel,
        user,
        displayName: m.tags['display-name'] || user,
        color: m.tags.color || undefined,
        text,
        emotes: parseEmotesTag(m.tags.emotes),
        roomId: m.tags['room-id'] || undefined,
        ts: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
        action: !!act,
    };
}
