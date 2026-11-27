/**
 * 合併 Twitch 聊天室：畫布上所有 Twitch 頻道的訊息依到達順序排在同一欄。
 * 訊息內容一律以 React 節點渲染（不用 innerHTML）；表情圖片來自 Twitch 與 7TV／BTTV／FFZ。
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useStreamStore } from '../../store/useStreamStore';
import { streamContentIdsByPosition } from '../../utils/canvasItemOps';
import { TwitchChatClient, onAuthFailTransition } from './TwitchChatClient';
import { messageParts, readableColor } from './messageParts';
import { buildEmoteMaps, loadChannelEmoteGroups, loadGlobalEmoteGroups, loadPersonal7tv, ownValue, selfEmoteMap, type EmoteGroups } from './thirdPartyEmotes';
import { loadFollowerEmotes, loadTwitchEmotes, loadTwitchOwners, resetTwitchEmotes, type TwitchEmote, type TwitchEmoteSet, type TwitchOwner } from './twitchEmotes';
import { buildPickerSections } from './emoteSections';
import { completeEmote, insertEmote, type CompletionState } from './emoteComplete';
import { EmotePicker } from './EmotePicker';
import { getInputCaret, getInputSelection, isRendered, renderInput, replaceRange, serializeInput, setInputCaret } from './emoteInput';
import type { ChatMessage } from './ircParse';
import { cn } from '../../components/ui/utils';
import { ScrollArea } from '../../components/ui/scroll-area';
import { useUIStore } from '../../store/useUIStore';
import { useAuthStore, getAccessToken } from '../auth/authStore';
import { fetchChatCredentials, resetChatCredentials, onChatCredentialsChanged } from './chatToken';

/** 發言權杖 50 分鐘重取一次（Twitch 要求每小時驗一次權杖；伺服器每次都換新）；暫時失敗 1 分鐘後重試 */
const CRED_REFRESH_MS = 50 * 60_000;
const CRED_RETRY_MS = 60_000;

/** 用 Twitch 帳號登入時取發言權杖並交給連線；登出或換成非 Twitch 帳號時回到匿名唯讀 */
type CredState = 'none' | 'pending' | 'missing' | 'ready';
type Creds = { login: string; token: string };
function useChatCredentials(c: TwitchChatClient): [CredState, TwitchEmoteSet | null, Creds | null] {
    const twitchUser = useAuthStore(s => (s.status === 'authed' && s.user?.providers.includes('twitch') ? s.user.id : null));
    const [state, setState] = useState<CredState>('none');
    // 發言權杖拿得到「自己能用的」Twitch 貼圖（含訂閱貼圖）
    const [twitchEmotes, setTwitchEmotes] = useState<TwitchEmoteSet | null>(null);
    // 查追隨者貼圖、頻道名稱用（只存在記憶體，同 TwitchChatClient）
    const [creds, setCreds] = useState<Creds | null>(null);
    useEffect(() => {
        if (!twitchUser) { c.setCredentials(null); resetChatCredentials(); setState('none'); setTwitchEmotes(null); setCreds(null); resetTwitchEmotes(); return; }
        let on = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const load = async () => {
            clearTimeout(timer);
            setState(s => (s === 'ready' ? s : 'pending'));
            const r = await fetchChatCredentials(await getAccessToken(), twitchUser);
            if (!on) return;
            if (r.kind === 'ok') {
                c.setCredentials(r.creds);
                setState('ready');
                setCreds(r.creds);
                // 續期時暫時查不到（空的）就保留舊的，不要讓貼圖消失到下一輪
                void loadTwitchEmotes(r.creds).then(set => { if (on && Object.keys(set.byName).length) setTwitchEmotes(set); });
            } else if (r.kind === 'missing') { c.setCredentials(null); setState('missing'); setTwitchEmotes(null); setCreds(null); }
            // 暫時失敗：保留現有權杖（若有），稍後再試
            else setState(s => (s === 'ready' ? s : 'missing'));
            timer = setTimeout(load, r.kind === 'error' ? CRED_RETRY_MS : CRED_REFRESH_MS);
        };
        void load();
        // 權杖交付完成（登入回來時）或 IRC 拒絕權杖時重新整理狀態
        const offCreds = onChatCredentialsChanged(() => { void load(); });
        // Twitch 拒絕權杖（過期或被撤銷）：只在剛發生時清快取並立刻重取一次；伺服器回 404 才真的需要重新登入
        const offClient = c.subscribe(onAuthFailTransition(() => c.authFailed(), () => {
            resetChatCredentials();
            void load();
        }));
        return () => { on = false; clearTimeout(timer); offCreds(); offClient(); };
    }, [c, twitchUser]);
    return [state, twitchEmotes, creds];
}

/** 輸入框：選頻道＋送出；沒有發言權限時顯示登入入口 */
interface EmoteData {
    twitch: TwitchEmoteSet | null;
    owners: Record<string, TwitchOwner>;
    follower: Record<string, TwitchEmote[]>;
    channelGroups: Record<string, EmoteGroups>;
    global: EmoteGroups;
    personal: Record<string, string>;
}

export function ChatComposer({ c, logins, cred, emotes }: { c: TwitchChatClient; logins: string[]; cred: CredState; emotes: EmoteData }) {
    const { t } = useTranslation('common');
    const [target, setTarget] = useState(logins[0] ?? '');
    const [text, setText] = useState('');
    const channel = logins.includes(target) ? target : logins[0] ?? '';
    const box = useRef<HTMLDivElement>(null);
    const completion = useRef<CompletionState | null>(null);
    const twitchEmotes = emotes.twitch;
    const sections = useMemo(() => buildPickerSections({
        channel, logins, twitch: twitchEmotes?.emotes ?? [], owners: emotes.owners, follower: emotes.follower,
        channelGroups: emotes.channelGroups, global: emotes.global, personal: emotes.personal,
    }, (k, o) => String(t(k as never, o))), [channel, logins, twitchEmotes, emotes, t]);
    // Tab 補完與選單同一份：你能用的所有貼圖
    const names = useMemo(() => [...new Set(sections.flatMap(s => s.emotes.map(e => e.name)))], [sections]);
    // 送出時標出 Twitch 貼圖位置：訂閱／全域＋這個頻道的追隨者貼圖
    const twitchIds = useMemo(() => ({ ...twitchEmotes?.byName, ...Object.fromEntries((ownValue(emotes.follower, channel) ?? []).map(e => [e.name, e.id])) }), [twitchEmotes, emotes.follower, channel]);
    // 輸入框畫成圖用的表：選單裡的貼圖（同名取第一個，也就是目前頻道優先）
    const urlByName = useMemo(() => {
        const m = new Map<string, string>();
        for (const s of sections) for (const e of s.emotes) if (!m.has(e.name)) m.set(e.name, e.url);
        return m;
    }, [sections]);
    // 純文字 text 是唯一來源；編輯區每次依它重畫。caret＝最後所在位置（焦點移到貼圖選單後仍記得）
    const caret = useRef(0);
    const pendingCaret = useRef<number | null>(null);
    const composing = useRef(false);
    // 復原紀錄自己記：貼圖變成圖片時會重畫，瀏覽器原生的復原紀錄會指向已移除的節點，游標跳到開頭
    const history = useRef<{ undo: { text: string; caret: number }[]; redo: { text: string; caret: number }[] }>({ undo: [], redo: [] });
    const remember = () => {
        const h = history.current;
        h.undo.push({ text, caret: Math.min(caret.current, text.length) });
        if (h.undo.length > 100) h.undo.shift();
        h.redo = [];
    };
    const redraw = (value: string, at: number | null) => {
        const el = box.current;
        if (!el) return;
        if (!isRendered(el, value, urlByName)) renderInput(el, value, urlByName);
        if (at !== null && el.ownerDocument.activeElement === el) setInputCaret(el, at);
    };
    useLayoutEffect(() => {
        // 打中文選字中不重畫，免得打斷輸入法
        if (composing.current) return;
        const el = box.current;
        const at = pendingCaret.current ?? (el ? getInputCaret(el) : null);
        pendingCaret.current = null;
        redraw(text, at);
    }, [text, urlByName, cred]);
    useEffect(() => {
        // 只在輸入框有焦點時記：焦點在選單時重畫會讓選取跳回開頭，不能拿來覆蓋記住的位置
        const track = () => {
            const el = box.current;
            if (!el || document.activeElement !== el) return;
            const at = getInputCaret(el);
            if (at !== null) caret.current = at;
        };
        document.addEventListener('selectionchange', track);
        return () => document.removeEventListener('selectionchange', track);
    }, []);
    const step = (undo: boolean) => {
        const h = history.current;
        const [from, to] = undo ? [h.undo, h.redo] : [h.redo, h.undo];
        const snap = from.pop();
        if (!snap) return;
        to.push({ text, caret: Math.min(caret.current, text.length) });
        completion.current = null;
        caret.current = snap.caret;
        pendingCaret.current = snap.caret;
        setText(snap.text);
    };
    const stepRef = useRef(step);
    stepRef.current = step;
    useEffect(() => {
        const el = box.current;
        if (!el) return;
        // 選單的「復原／重做」只會送 beforeinput（快捷鍵在 onKeyDown 處理）：攔下來用自己的紀錄
        const onHistory = (e: InputEvent) => {
            if (e.inputType !== 'historyUndo' && e.inputType !== 'historyRedo') return;
            e.preventDefault();
            stepRef.current(e.inputType === 'historyUndo');
        };
        el.addEventListener('beforeinput', onHistory);
        return () => el.removeEventListener('beforeinput', onHistory);
    }, [cred]);
    const apply = (r: { text: string; caret: number }) => {
        if (r.text.length > 500) return;
        // 文字沒變（只剩一個候選時連按 Tab）不會觸發重畫：直接放游標
        if (r.text === text) { caret.current = r.caret; redraw(text, r.caret); return; }
        remember();
        caret.current = r.caret;
        pendingCaret.current = r.caret;
        setText(r.text);
    };
    if (logins.length === 0) return null;
    if (cred !== 'ready') {
        return (
            <div className="border-t border-white/10 px-3 py-2 text-xs text-white/60">
                {cred === 'pending' ? t('chat.send_connecting') : (
                    <button type="button" className="underline hover:text-white" onClick={() => useUIStore.getState().openModal('favorites', 'global_settings')}>
                        {t(cred === 'missing' ? 'chat.send_relogin' : 'chat.send_sign_in')}
                    </button>
                )}
            </div>
        );
    }
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        // 選字還沒結束就按送出（手機常見）：text 還沒包含選字中的字，以畫面為準
        const value = box.current ? serializeInput(box.current) : text;
        if (!value.trim() || !c.send(channel, value, twitchIds)) return;
        composing.current = false;
        history.current = { undo: [], redo: [] };
        caret.current = 0;
        completion.current = null;
        setText('');
        redraw('', 0);
    };
    const onInput = () => {
        const el = box.current;
        if (!el || composing.current) return;
        completion.current = null;
        const next = serializeInput(el);
        const at = getInputCaret(el) ?? next.length;
        // 超過字數就退回原文（可編輯區沒有 maxLength）
        if (next.length > 500) { redraw(text, Math.min(caret.current, text.length)); return; }
        if (next === text) { caret.current = at; redraw(text, at); return; }
        remember();
        caret.current = at;
        pendingCaret.current = at;
        setText(next);
    };
    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        // Safari 選字確認的 Enter 在 compositionend 之後才到，只能從 keyCode 229 認出來
        if (e.nativeEvent.isComposing || composing.current || e.keyCode === 229) return;
        // 復原／重做快捷鍵自己處理：瀏覽器自己的紀錄是空的時候不會送 beforeinput
        const mod = e.ctrlKey || e.metaKey;
        const k = e.key.toLowerCase();
        if (mod && !e.altKey && (k === 'z' || k === 'y')) {
            e.preventDefault();
            step(k === 'z' && !e.shiftKey);
            return;
        }
        // 單行輸入：Enter 送出，不換行
        if (e.key === 'Enter') { e.preventDefault(); submit(e); return; }
        if (e.key !== 'Tab' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) { completion.current = null; return; }
        const r = completeEmote(text, getInputCaret(e.currentTarget) ?? text.length, names, completion.current);
        // 沒有候選（或補完後會超過字數上限）就不攔，Tab 照常移動焦點
        if (!r || r.text.length > 500) return;
        e.preventDefault();
        completion.current = r.state;
        apply(r);
    };
    const pick = (name: string) => {
        completion.current = null;
        // 不把焦點搶回輸入框：選單保持開著，可以連續選
        apply(insertEmote(text, Math.min(caret.current, text.length), name));
    };
    // 只收純文字：擋掉貼上的 HTML、拖進來的圖片
    const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
        e.preventDefault();
        const [start, end] = getInputSelection(e.currentTarget) ?? [text.length, text.length];
        completion.current = null;
        // 超過字數就截到剩下的字數（和原本 <input maxLength> 一樣）
        const clip = e.clipboardData.getData('text/plain').replace(/\r\n|\r|\n/g, ' ').slice(0, Math.max(0, 500 - text.length + end - start));
        apply(replaceRange(text, start, end, clip));
    };
    return (
        <form onSubmit={submit} className="flex items-end gap-1.5 border-t border-white/10 p-2">
            {logins.length > 1 && (
                <select
                    aria-label={t('chat.send_target')}
                    value={channel}
                    onChange={e => setTarget(e.target.value)}
                    className="h-8 max-w-[7.5rem] shrink-0 rounded-md border border-white/15 bg-white/10 px-1.5 text-xs text-white"
                >
                    {logins.map(l => <option key={l} value={l} className="bg-slate-900">{l}</option>)}
                </select>
            )}
            <div
                ref={box}
                role="textbox"
                aria-label={t('chat.send_placeholder', { channel })}
                data-placeholder={t('chat.send_placeholder', { channel })}
                contentEditable
                suppressContentEditableWarning
                spellCheck={false}
                onInput={onInput}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onDrop={e => e.preventDefault()}
                onCompositionStart={() => { composing.current = true; }}
                onCompositionEnd={() => { composing.current = false; onInput(); }}
                className="max-h-24 min-h-8 min-w-0 flex-1 cursor-text overflow-y-auto whitespace-pre-wrap break-all rounded-md border border-white/15 bg-white/5 px-2 py-1 text-sm leading-6 text-white outline-none focus-visible:border-white/40 empty:before:pointer-events-none empty:before:text-white/40 empty:before:content-[attr(data-placeholder)]"
            />
            <EmotePicker sections={sections} needsReauth={twitchEmotes?.needsReauth} onPick={pick} />
            <button type="submit" disabled={!text.trim()} className="h-8 shrink-0 rounded-md bg-purple-600 px-3 text-xs font-medium text-white disabled:opacity-40">
                {t('chat.send')}
            </button>
        </form>
    );
}

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
const NO_GROUPS: EmoteGroups = { '7tv': {}, bttv: {}, ffz: {} };
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
        message.system ? <div role="status" className="px-3 py-0.5 text-[12px] text-amber-300/90">⚠ {message.text}</div> :
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
    const [globalEmotes, setGlobalEmotes] = useState<EmoteGroups>(NO_GROUPS);
    const [channelEmotes, setChannelEmotes] = useState<Record<string, EmoteGroups>>({});
    useEffect(() => { let on = true; loadGlobalEmoteGroups().then(m => on && setGlobalEmotes(m)); return () => { on = false; }; }, []);
    const roomIds = useSyncExternalStore(subscribe, () => logins.map(l => c.getRoomId(l) ?? '').join(','));
    // 每個 room-id 只發一次請求（ROOMSTATE 陸續抵達時不重抓前面的頻道）
    const requested = useRef(new Set<string>());
    useEffect(() => {
        roomIds.split(',').forEach((id, i) => {
            const login = logins[i];
            if (!id || !login || requested.current.has(id)) return;
            requested.current.add(id);
            loadChannelEmoteGroups(id).then(m => setChannelEmotes(prev => ({ ...prev, [login]: m })));
        });
    }, [roomIds, logins]);
    // 訊息比對：全域＋該頻道＋畫布上其他頻道（跨頻道只收不像一般文字的名稱）
    const emoteMaps = useMemo(() => buildEmoteMaps(logins, globalEmotes, channelEmotes), [logins, globalEmotes, channelEmotes]);

    const connected = useSyncExternalStore(subscribe, () => c.isConnected());
    const [cred, twitchEmotes, creds] = useChatCredentials(c);

    // 7TV 個人貼圖（用你的 Twitch id 查）
    const [personal, setPersonal] = useState<Record<string, string>>({});
    const myId = twitchEmotes?.userId;
    useEffect(() => {
        if (!myId) { setPersonal({}); return; }
        let on = true;
        void loadPersonal7tv(myId).then(m => { if (on) setPersonal(m); });
        return () => { on = false; };
    }, [myId]);
    // 訂閱貼圖所屬頻道的名稱與頭像
    const [owners, setOwners] = useState<Record<string, TwitchOwner>>({});
    useEffect(() => {
        if (!creds || !twitchEmotes) return;
        const ids = [...new Set(twitchEmotes.emotes.map(e => e.ownerId).filter(id => id && id !== '0'))];
        let on = true;
        void loadTwitchOwners(creds, ids).then(m => { if (on) setOwners(m); });
        return () => { on = false; };
    }, [creds, twitchEmotes]);
    // 畫布上每個頻道的追隨者貼圖：一次查一個（結果快取在 twitchEmotes 模組）
    const [follower, setFollower] = useState<Record<string, TwitchEmote[]>>({});
    useEffect(() => {
        if (!creds) { setFollower({}); return; }
        let on = true;
        void (async () => {
            const ids = roomIds.split(',');
            for (let i = 0; i < logins.length; i++) {
                if (!ids[i]) continue;
                const list = await loadFollowerEmotes(creds, ids[i]);
                if (!on) return;
                const login = logins[i];
                setFollower(prev => (ownValue(prev, login) === list ? prev : { ...prev, [login]: list }));
            }
        })();
        return () => { on = false; };
    }, [creds, roomIds, logins]);
    const emoteData = useMemo<EmoteData>(() => ({ twitch: twitchEmotes, owners, follower, channelGroups: channelEmotes, global: globalEmotes, personal }),
        [twitchEmotes, owners, follower, channelEmotes, globalEmotes, personal]);
    // 自己的訊息另外加上 7TV 個人貼圖（別人要也裝 7TV 才看得到）
    const selfMaps = useMemo(() => new Map([...emoteMaps].map(([login, m]) => [login, selfEmoteMap(m, personal)])), [emoteMaps, personal]);
    const me = creds?.login;

    // 停在底部時新訊息自動捲到底；使用者往上捲就暫停，按「回到最新」才恢復
    const root = useRef<HTMLDivElement>(null);
    const viewport = () => root.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]') ?? null;
    const [pinned, setPinned] = useState(true);
    // 凍結時固定整批訊息（client 會從最舊的開始丟，只記 id 的話畫面會從上面被吃掉）；
    // 篩選與移除直播在顯示時才套，所以照常生效。代價：凍結期間被管理員刪除的訊息，恢復時才消失
    const frozen = useRef(messages);
    if (pinned) frozen.current = messages;
    const shown = useMemo(() => {
        const on = new Set(logins);
        return (pinned ? messages : frozen.current).filter(m => on.has(m.channel) && !hidden.has(m.channel)).slice(-MAX_RENDERED);
    }, [messages, hidden, pinned, logins]);
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
                    {shown.map(m => <ChatLine key={m.id} message={m} emotes={(m.user === me ? selfMaps : emoteMaps).get(m.channel) ?? EMPTY} showChannel={logins.length > 1} />)}
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
            <ChatComposer c={c} logins={logins} cred={cred} emotes={emoteData} />
        </div>
    );
}
