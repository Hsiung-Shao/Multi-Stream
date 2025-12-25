import { StreamItem, StreamManagerContract } from './types';
import { DomAdapterContract, DefaultDomAdapter } from './DomAdapter';
import { PlayerRegistry } from './PlayerRegistry';
import { UrlParser } from './UrlParser';
import { ChatConnector } from './ChatConnector';

export class StreamManager implements StreamManagerContract {
    private streams: Map<number, StreamItem> = new Map();
    private streamCount: number = 0;

    public domAdapter: DomAdapterContract;
    public playerRegistry: PlayerRegistry;
    public chatConnector: ChatConnector;

    constructor(
        domAdapter?: DomAdapterContract,
        playerRegistry?: PlayerRegistry,
        chatConnector?: ChatConnector
    ) {
        this.domAdapter = domAdapter || new DefaultDomAdapter();
        this.playerRegistry = playerRegistry || new PlayerRegistry();
        this.chatConnector = chatConnector || new ChatConnector();
    }

    async addStream(url: string = ''): Promise<void> {
        if (!url) return;

        // --- GUARD: Prevent re-entry or race conditions if called rapidly ---
        // (For single threaded JS, mainly logic checks)

        const parsed = UrlParser.parse(url);
        if (!parsed.valid || !parsed.identifier || !parsed.platform) {
            console.error(parsed.error || 'Invalid URL');
            return;
        }

        // Sync ID from window if available to avoid collision with legacy
        if (typeof window !== 'undefined' && typeof (window as any).streamCount === 'number') {
            this.streamCount = (window as any).streamCount;
        }

        // Increment
        this.streamCount++;
        const id = this.streamCount;

        // Sync back to window
        if (typeof window !== 'undefined') {
            (window as any).streamCount = this.streamCount;
        }

        if (this.streams.has(id)) {
            console.warn(`[StreamManager] Stream ID ${id} collision. Skipping.`);
            return;
        }

        const newItem: StreamItem = {
            id,
            platform: parsed.platform,
            identifier: parsed.identifier,
            channelId: parsed.channelId,
            originalUrl: url,
            volume: 100,
            muted: false,
            // Twitch defaults to visible, YouTube defaults to hidden
            chatVisible: parsed.platform !== 'youtube',
            createdAt: Date.now()
        };

        this.streams.set(id, newItem);

        // 1. Create DOM Wrapper
        // This will now call the REAL implementation ported in PR D
        this.domAdapter.createStreamBox(id);

        // 2. Create Player
        this.playerRegistry.create(id, newItem.platform, newItem.identifier);

        // 3. Create Chat
        const chatChannelId = parsed.platform === 'twitch' ? parsed.identifier : (parsed.channelId || '');
        const chatVideoId = parsed.platform === 'youtube' ? parsed.identifier : '';
        this.chatConnector.callCreate(id, parsed.platform, chatChannelId, chatVideoId);

        console.log(`[StreamManager] Added stream ${id} (${newItem.platform}: ${newItem.identifier})`);
    }

    removeStream(id: number): void {
        if (!this.streams.has(id)) {
            // Also retry checking DOM or window if out of sync?
            // PR C bridge: we prefer Manager as truth.
            return;
        }

        // 1. Destroy Player
        this.playerRegistry.destroy(id);

        // 2. Destroy Chat
        this.chatConnector.destroy(id);

        // 3. Remove DOM
        this.domAdapter.removeStreamBox(id);

        // 4. Update State
        this.streams.delete(id);

        console.log(`[StreamManager] Removed stream ${id}`);
    }

    reloadStream(id: number): void {
        if (!this.streams.has(id)) return;
        const item = this.streams.get(id)!;

        // 1. Destroy existing player
        this.playerRegistry.destroy(id);

        // 2. Re-create player (keep DOM and State)
        // Need to ensure DOM player container is empty?
        // Registry destroy should handle player cleanup, but maybe not DOM clearing.
        // Adapter logic should handle this.
        if (typeof document !== 'undefined') {
            const pContainer = document.getElementById('player' + id);
            if (pContainer) pContainer.innerHTML = '';
        }

        this.playerRegistry.create(id, item.platform, item.identifier);

        // Restore volume
        const player = this.playerRegistry.get(id);
        if (player) {
            player.setVolume(item.volume);
            player.setMuted(item.muted);
        }

        console.log(`[StreamManager] Reloaded stream ${id}`);
    }

    clearAll(): void {
        const ids = Array.from(this.streams.keys());
        ids.forEach(id => this.removeStream(id));
        this.streamCount = 0;
        if (typeof window !== 'undefined') {
            (window as any).streamCount = 0;
        }
    }

    getStreams(): StreamItem[] {
        return Array.from(this.streams.values());
    }

    getStream(id: number): StreamItem | undefined {
        return this.streams.get(id);
    }

    setVolume(id: number, volume: number): void {
        const stream = this.streams.get(id);
        if (stream) {
            stream.volume = volume;
            const player = this.playerRegistry.get(id);
            if (player) {
                player.setVolume(volume);
            }
        }
    }

    setMuted(id: number, muted: boolean): void {
        const stream = this.streams.get(id);
        if (stream) {
            stream.muted = muted;
            const player = this.playerRegistry.get(id);
            if (player) {
                player.setMuted(muted);
            }
        }
    }
}
