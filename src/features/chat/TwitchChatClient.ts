/**
 * Twitch 聊天連線：一條 WebSocket 同時收多個頻道。
 * 預設匿名唯讀（justinfan）；之後有發言權杖時改帶 PASS／NICK。
 */
import { parseIrc, toChatMessage, type ChatMessage } from './ircParse';

export interface SocketLike {
    send(data: string): void;
    close(): void;
    onopen: (() => void) | null;
    onmessage: ((ev: { data: string }) => void) | null;
    onclose: (() => void) | null;
    readyState: number;
}

const URL = 'wss://irc-ws.chat.twitch.tv:443';
const OPEN = 1;
const MAX_BACKOFF_MS = 30_000;

export class TwitchChatClient {
    private socket: SocketLike | null = null;
    private channels = new Set<string>();
    private messages: ChatMessage[] = [];
    private listeners = new Set<() => void>();
    private roomIds = new Map<string, string>();
    private backoff = 1000;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private stopped = true;
    private connected = false;
    private creds: { login: string; token: string } | null = null;
    private readonly createSocket: (url: string) => SocketLike;
    private readonly maxPerChannel: number;

    constructor(opts: { createSocket?: (url: string) => SocketLike; maxPerChannel?: number } = {}) {
        this.createSocket = opts.createSocket ?? (url => new WebSocket(url) as unknown as SocketLike);
        this.maxPerChannel = opts.maxPerChannel ?? 300;
    }

    connect(): void {
        this.stopped = false;
        this.open();
    }

    disconnect(): void {
        this.stopped = true;
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = null;
        const s = this.socket;
        this.socket = null;
        this.connected = false;
        if (s) { s.onclose = null; s.close(); }
    }

    setChannels(logins: string[]): void {
        const next = new Set(logins.map(l => l.toLowerCase()).filter(l => /^[a-z0-9_]{1,25}$/.test(l)));
        const live = this.socket?.readyState === OPEN;
        for (const c of next) if (!this.channels.has(c) && live) this.socket!.send(`JOIN #${c}`);
        for (const c of this.channels) {
            if (next.has(c)) continue;
            if (live) this.socket!.send(`PART #${c}`);
            this.messages = this.messages.filter(m => m.channel !== c);
        }
        this.channels = next;
        this.emit();
    }

    /** 收到 001 歡迎訊息後才算連上；斷線即回到 false */
    isConnected(): boolean {
        return this.connected;
    }

    /** 帶 Twitch 使用者權杖重連（null＝回到匿名唯讀） */
    setCredentials(creds: { login: string; token: string } | null): void {
        const same = creds?.login === this.creds?.login && creds?.token === this.creds?.token;
        this.creds = creds && /^[a-z0-9_]{1,25}$/.test(creds.login) ? creds : null;
        // 已連線就重連換身分（新 socket 握手時用新的 PASS／NICK）
        if (!same && this.socket && !this.stopped) {
            const old = this.socket;
            this.socket = null;
            this.connected = false;
            old.onclose = null;
            old.close();
            this.open();
        }
    }

    /** 送出聊天訊息；回傳是否送出（未登入、未連線、頻道不在畫面上、空白或超過 500 字都不送） */
    send(channel: string, text: string): boolean {
        const ch = channel.toLowerCase();
        // 去掉換行：IRC 以 CRLF 分隔指令，留著就能夾帶第二條指令
        const body = text.replace(/[\r\n]+/g, ' ').trim();
        if (!this.creds || !this.connected || !this.socket || !this.channels.has(ch)) return false;
        if (!body || Array.from(body).length > 500) return false;
        this.socket.send(`PRIVMSG #${ch} :${body}`);
        // Twitch 不會把自己的訊息回送給同一條連線，自己補一則顯示
        this.messages = [...this.messages, {
            id: `self-${Date.now()}-${Math.random()}`, channel: ch, user: this.creds.login, displayName: this.creds.login,
            text: body, emotes: [], roomId: this.roomIds.get(ch), ts: Date.now(), action: false,
        }];
        this.emit();
        return true;
    }

    canSend(): boolean {
        return !!this.creds && this.connected;
    }

    getMessages(): ChatMessage[] {
        return this.messages;
    }

    /** ROOMSTATE 給的頻道數字 id（第三方表情要用） */
    getRoomId(login: string): string | undefined {
        return this.roomIds.get(login);
    }

    subscribe(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    }

    private emit() {
        for (const fn of this.listeners) fn();
    }

    private open() {
        const s = this.createSocket(URL);
        this.socket = s;
        s.onopen = () => {
            s.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
            if (this.creds) {
                s.send(`PASS oauth:${this.creds.token}`);
                s.send(`NICK ${this.creds.login}`);
            } else {
                s.send('PASS SCHMOOPIIE');
                s.send(`NICK justinfan${10000 + Math.floor(Math.random() * 80000)}`);
            }
            for (const c of this.channels) s.send(`JOIN #${c}`);
        };
        s.onmessage = ev => { for (const line of String(ev.data).split('\r\n')) if (line) this.handle(line); };
        s.onclose = () => {
            if (this.socket !== s) return;
            this.socket = null;
            if (this.connected) { this.connected = false; this.emit(); }
            if (this.stopped) return;
            const wait = this.backoff;
            this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
            this.retryTimer = setTimeout(() => { this.retryTimer = null; if (!this.stopped) this.open(); }, wait);
        };
    }

    private handle(line: string) {
        const m = parseIrc(line);
        if (!m) return;
        switch (m.command) {
            case 'PING':
                this.socket?.send(`PONG :${m.params[0] ?? 'tmi.twitch.tv'}`);
                return;
            case '001':
                this.backoff = 1000;
                this.connected = true;
                this.emit();
                return;
            case 'RECONNECT':
                this.socket?.close();
                return;
            case 'ROOMSTATE': {
                const ch = m.params[0]?.replace(/^#/, '');
                if (ch && m.tags['room-id'] && this.roomIds.get(ch) !== m.tags['room-id']) {
                    this.roomIds.set(ch, m.tags['room-id']);
                    this.emit();
                }
                return;
            }
            case 'PRIVMSG': {
                const msg = toChatMessage(m);
                if (!msg || !this.channels.has(msg.channel)) return;
                this.messages = [...this.messages, msg];
                let count = 0;
                for (const x of this.messages) if (x.channel === msg.channel) count++;
                if (count > this.maxPerChannel) {
                    const drop = this.messages.findIndex(x => x.channel === msg.channel);
                    this.messages.splice(drop, 1);
                }
                this.emit();
                return;
            }
            case 'CLEARMSG': {
                const target = m.tags['target-msg-id'];
                if (target) { this.messages = this.messages.filter(x => x.id !== target); this.emit(); }
                return;
            }
            case 'CLEARCHAT': {
                const ch = m.params[0]?.replace(/^#/, '').toLowerCase();
                const user = m.params[1]?.toLowerCase();
                this.messages = this.messages.filter(x => x.channel !== ch || (user !== undefined && x.user !== user));
                this.emit();
                return;
            }
        }
    }
}
