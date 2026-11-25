/**
 * 合併 Twitch 聊天室：畫布上所有 Twitch 頻道的訊息依到達順序排在同一欄。
 * 訊息內容一律以 React 節點渲染（不用 innerHTML）；表情圖片來自 Twitch 與 7TV／BTTV／FFZ。
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useStreamStore } from '../../store/useStreamStore';
import { streamContentIdsByPosition } from '../../utils/canvasItemOps';
import { TwitchChatClient } from './TwitchChatClient';
import { messageParts, readableColor } from './messageParts';
import { loadChannelEmotes, loadGlobalEmotes } from './thirdPartyEmotes';
import type { ChatMessage } from './ircParse';
import { cn } from '../../components/ui/utils';
import { ScrollArea } from '../../components/ui/scroll-area';

// 整個頁面共用一條連線：有人在看才連、沒人看就斷
let client: TwitchChatClient | null = null;
let users = 0;
const getClient = () => (client ??= new TwitchChatClient());
// 計數只在 effect 裡增減：render 可能被丟棄重跑，放在 render 會多算而永遠不斷線
function acquire() {
    if (users++ === 0) getClient().connect();
}
function release() {
    if (--users === 0) client?.disconnect();
}

const EMPTY = new Map<string, string>();
/** 畫面只畫最新這麼多則；熱門頻道一秒幾十則，全畫會卡 */
const MAX_RENDERED = 200;

/** 訊息通知合併成每 100ms 一次重繪 */
function batched(c: TwitchChatClient) {
    return (fn: () => void) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const unsub = c.subscribe(() => { timer ??= setTimeout(() => { timer = undefined; fn(); }, 100); });
        return () => { clearTimeout(timer); unsub(); };
    };
}

export const ChatLine = memo(function ChatLine({ message, emotes, showChannel }: { message: ChatMessage; emotes: ReadonlyMap<string, string>; showChannel?: boolean }) {
    const parts = useMemo(() => messageParts(message.text, message.emotes, emotes), [message, emotes]);
    return (
        <div className={cn('break-words px-3 py-0.5 text-[13px] leading-relaxed text-white/90', message.action && 'italic')}>
            {showChannel && <span className="mr-1.5 rounded bg-white/10 px-1 text-[10px] text-white/60">{message.channel}</span>}
            <span className="font-semibold" style={{ color: readableColor(message.color) ?? '#a78bfa' }}>{message.displayName}</span>
            {message.action ? ' ' : <span className="text-white/50">: </span>}
            {parts.map((p, i) =>
                p.type === 'text' ? <span key={i}>{p.text}</span>
                    : p.type === 'emote' ? <img key={i} src={p.url} alt={p.name} title={p.name} className="mx-0.5 inline h-7 w-auto align-middle" loading="lazy" referrerPolicy="no-referrer" />
                        : <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-sky-300 underline break-all">{p.text}</a>,
            )}
        </div>
    );
});

/** 畫布上的 Twitch 頻道 login（依畫面位置） */
function useTwitchLogins(): string[] {
    return useStreamStore(useShallow(s => streamContentIdsByPosition(s.canvasItems)
        .map(id => s.streams.find(x => x.id === id))
        .filter(st => st?.platform === 'twitch' && st.channelId)
        .map(st => st!.channelId.toLowerCase())));
}

export function MergedChat() {
    const { t } = useTranslation('common');
    const logins = useTwitchLogins();
    const c = getClient();
    useEffect(() => { acquire(); return release; }, []);
    useEffect(() => { c.setChannels(logins); }, [c, logins]);

    const subscribe = useMemo(() => batched(c), [c]);
    const messages = useSyncExternalStore(subscribe, () => c.getMessages());
    const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

    // 表情：全域一份＋每個頻道各一份（只套在該頻道的訊息）
    const [globalEmotes, setGlobalEmotes] = useState<Record<string, string>>({});
    const [channelEmotes, setChannelEmotes] = useState<Record<string, Record<string, string>>>({});
    useEffect(() => { let on = true; loadGlobalEmotes().then(m => on && setGlobalEmotes(m)); return () => { on = false; }; }, []);
    const roomIds = useSyncExternalStore(subscribe, () => logins.map(l => c.getRoomId(l) ?? '').join(','));
    // 每個 room-id 只發一次請求（ROOMSTATE 陸續抵達時不重抓前面的頻道）
    const requested = useRef(new Set<string>());
    useEffect(() => {
        roomIds.split(',').forEach((id, i) => {
            const login = logins[i];
            if (!id || !login || requested.current.has(id)) return;
            requested.current.add(id);
            loadChannelEmotes(id).then(m => setChannelEmotes(prev => ({ ...prev, [login]: m })));
        });
    }, [roomIds, logins]);
    const emoteMaps = useMemo(() => {
        const out = new Map<string, ReadonlyMap<string, string>>();
        for (const login of logins) out.set(login, new Map(Object.entries({ ...globalEmotes, ...channelEmotes[login] })));
        return out;
    }, [logins, globalEmotes, channelEmotes]);

    const connected = useSyncExternalStore(subscribe, () => c.isConnected());

    // 停在底部時新訊息自動捲到底；使用者往上捲就暫停：畫面凍結在當下那批（不然最上面的列會持續被擠掉），
    // 按「回到最新」才恢復。凍結期間被管理員刪除的訊息，恢復時才一起消失
    const root = useRef<HTMLDivElement>(null);
    const viewport = () => root.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]') ?? null;
    const [pinned, setPinned] = useState(true);
    const live = useMemo(() => messages.filter(m => !hidden.has(m.channel)).slice(-MAX_RENDERED), [messages, hidden]);
    const frozen = useRef(live);
    if (pinned) frozen.current = live;
    const shown = pinned ? live : frozen.current;
    useLayoutEffect(() => {
        const el = viewport();
        if (el && pinned) el.scrollTop = el.scrollHeight;
    }, [shown, pinned]);
    useEffect(() => {
        const el = viewport();
        if (!el) return;
        const onScroll = () => setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <div className="flex h-full min-h-0 flex-col bg-[#0a0b11]">
            {logins.length > 1 && (
                <div role="group" aria-label={t('chat.filter_label')} className="flex flex-wrap gap-1 border-b border-white/10 px-2 py-1.5">
                    {logins.map(login => (
                        <button
                            key={login}
                            type="button"
                            aria-pressed={!hidden.has(login)}
                            onClick={() => setHidden(prev => { const n = new Set(prev); if (n.has(login)) n.delete(login); else n.add(login); return n; })}
                            className="h-6 rounded-full border border-white/15 px-2 text-[11px] text-white/80 aria-[pressed=false]:opacity-40"
                        >
                            {login}
                        </button>
                    ))}
                </div>
            )}
            <div className="relative min-h-0 flex-1">
                {/* Radix viewport 內層預設 display:table，長訊息會撐寬不換行，改回 block */}
                <ScrollArea ref={root} role="log" aria-live="off" aria-label={t('chat.log_label')} className="h-full py-1 [&>[data-radix-scroll-area-viewport]>div]:!block">
                    {logins.length === 0 && <p className="px-3 py-6 text-center text-xs text-white/50">{t('chat.no_twitch')}</p>}
                    {logins.length > 0 && shown.length === 0 && <p className="px-3 py-6 text-center text-xs text-white/50">{t(connected ? 'chat.no_messages' : 'chat.waiting')}</p>}
                    {shown.map(m => <ChatLine key={m.id} message={m} emotes={emoteMaps.get(m.channel) ?? EMPTY} showChannel={logins.length > 1} />)}
                </ScrollArea>
                {!pinned && (
                    <button
                        type="button"
                        onClick={() => setPinned(true)}
                        className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-purple-600 px-3 py-1 text-xs font-medium text-white shadow-lg"
                    >
                        {t('chat.jump_latest')}
                    </button>
                )}
            </div>
        </div>
    );
}
