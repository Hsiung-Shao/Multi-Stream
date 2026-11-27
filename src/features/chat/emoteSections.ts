/** 貼圖選單的段落：依「目前頻道 → 個人 → 訂閱（依頻道）→ 其他頻道 → 全域」排列 */
import type { EmoteGroups } from './thirdPartyEmotes';
import type { TwitchEmote, TwitchOwner } from './twitchEmotes';

export interface PickerEmote { name: string; url: string }
export interface EmoteSection { id: string; title: string; note?: string; avatar?: string; emotes: PickerEmote[] }

export interface SectionInput {
    channel: string;
    logins: string[];
    twitch: TwitchEmote[];
    owners: Record<string, TwitchOwner>;
    follower: Record<string, TwitchEmote[]>;
    channelGroups: Record<string, EmoteGroups>;
    global: EmoteGroups;
    personal: Record<string, string>;
}

type T = (key: string, opts?: Record<string, unknown>) => string;
const SOURCES = [['7tv', '7TV'], ['bttv', 'BTTV'], ['ffz', 'FFZ']] as const;
const fromMap = (m: Record<string, string>): PickerEmote[] => Object.entries(m).map(([name, url]) => ({ name, url }));
const fromTwitch = (list: TwitchEmote[]): PickerEmote[] => list.map(e => ({ name: e.name, url: e.url }));
// Twitch 全域類：globals／smilies，或沒有擁有者（owner 0／空）
const isTwitchGlobal = (e: TwitchEmote) => e.type === 'globals' || e.type === 'smilies' || !e.ownerId || e.ownerId === '0';

/** 一個頻道的段落：追隨者＋三家第三方；prefix＝ch（目前送出頻道）或 other（只在該頻道顯示成圖） */
function channelSections(prefix: 'ch' | 'other', login: string, input: SectionInput, t: T): EmoteSection[] {
    const note = prefix === 'other' ? t('chat.emote_only_in', { channel: login }) : undefined;
    const g = input.channelGroups[login];
    const out: EmoteSection[] = [
        { id: `${prefix}:${login}:follower`, title: t('chat.emote_sec_channel', { channel: login, source: t('chat.emote_follower') }), emotes: fromTwitch(input.follower[login] ?? []) },
        ...SOURCES.map(([key, label]) => ({ id: `${prefix}:${login}:${key}`, title: t('chat.emote_sec_channel', { channel: login, source: label }), emotes: g ? fromMap(g[key]) : [] })),
    ];
    return out.map(s => (note ? { ...s, note } : s));
}

/** 段落順序：目前頻道 → 7TV 個人 → Twitch 訂閱（依頻道名）→ 畫布上其他頻道 → 全域；空段落不輸出 */
export function buildPickerSections(input: SectionInput, t: T): EmoteSection[] {
    const byOwner = new Map<string, TwitchEmote[]>();
    const twitchGlobal: TwitchEmote[] = [];
    for (const e of input.twitch) {
        if (isTwitchGlobal(e)) twitchGlobal.push(e);
        // 追隨者貼圖只在該頻道能用，改由各頻道的 follower 段列出
        else if (e.type !== 'follower') byOwner.set(e.ownerId, [...(byOwner.get(e.ownerId) ?? []), e]);
    }
    const ownerName = (id: string) => input.owners[id]?.displayName ?? id;
    const subs: EmoteSection[] = [...byOwner.keys()]
        .sort((a, b) => ownerName(a).localeCompare(ownerName(b)))
        .map(id => ({ id: `sub:${id}`, title: ownerName(id), avatar: input.owners[id]?.avatar, emotes: fromTwitch(byOwner.get(id)!) }));
    const sections: EmoteSection[] = [
        ...(input.channel ? channelSections('ch', input.channel, input, t) : []),
        { id: 'personal', title: t('chat.emote_sec_personal'), emotes: fromMap(input.personal) },
        ...subs,
        ...input.logins.filter(l => l !== input.channel).flatMap(l => channelSections('other', l, input, t)),
        { id: 'global:twitch', title: t('chat.emote_sec_global', { source: 'Twitch' }), emotes: fromTwitch(twitchGlobal) },
        ...SOURCES.map(([key, label]) => ({ id: `global:${key}`, title: t('chat.emote_sec_global', { source: label }), emotes: fromMap(input.global[key]) })),
    ];
    return sections.filter(s => s.emotes.length > 0);
}
