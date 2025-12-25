
import { ChatManagerContract, DomAdapterContract, ChatUrlBuilderContract, YouTubeWatchdogContract, ChatInstance } from './types';
import { DomAdapter } from './DomAdapter';
import { ChatUrlBuilder } from './ChatUrlBuilder';
import { YouTubeChatWatchdog } from './YouTubeChatWatchdog';

export class ChatManager implements ChatManagerContract {
    private domAdapter: DomAdapterContract;
    private urlBuilder: ChatUrlBuilderContract;
    private watchdog: YouTubeWatchdogContract;

    private instances: Map<number, ChatInstance> = new Map();

    constructor(
        domAdapter?: DomAdapterContract,
        urlBuilder?: ChatUrlBuilderContract,
        watchdog?: YouTubeWatchdogContract
    ) {
        this.domAdapter = domAdapter || new DomAdapter();
        this.urlBuilder = urlBuilder || new ChatUrlBuilder();
        this.watchdog = watchdog || new YouTubeChatWatchdog(this.domAdapter);
    }

    createChat(id: number, platform: 'twitch' | 'youtube', channelId: string, videoId: string): void {
        const container = this.domAdapter.getContainer(id);
        if (!container) return; // Should we throw? Legacy just returned.

        // Clean up existing if any
        if (this.instances.has(id)) {
            this.destroyChat(id);
        }

        // Prepare Instance
        const instance: ChatInstance = {
            id,
            platform,
            channelId,
            videoId,
            containerId: `chat${id}`,
            isSeparated: false
        };

        // Clear container
        this.domAdapter.clearContainer(container);

        // Build URL
        let url = '';
        if (platform === 'twitch') {
            url = this.urlBuilder.buildTwitchUrl(channelId);
        } else if (platform === 'youtube') {
            url = this.urlBuilder.buildYouTubeUrl(videoId);
        }

        if (!url) return;

        // Create Iframe
        const iframe = this.domAdapter.createIframe(container, url);
        iframe.id = `chat-iframe-${id}`;

        // Watchdog (YouTube only)
        if (platform === 'youtube') {
            this.watchdog.start(iframe, videoId, container);
            instance.watchdog = this.watchdog;
        }

        this.instances.set(id, instance);
    }

    destroyChat(id: number): void {
        const instance = this.instances.get(id);
        if (instance) {
            // Stop watchdog
            if (instance.platform === 'youtube' && instance.watchdog) {
                // We need to pass the specific iframe? 
                // Watchdog API: stop(iframe).
                // We can find the iframe in container.
                const container = this.domAdapter.getContainer(id);
                if (container) {
                    const iframe = container.querySelector('iframe');
                    if (iframe) this.watchdog.stop(iframe);
                }
            }
            this.instances.delete(id);
        }
    }

    toggleChat(id: number): void {
        // Check if visible
        // Legacy `toggleChat` logic toggles .hidden class
        // We use adapter for that.
        // We do not track visibility state in Manager strictly unless needed.
        // But we should check current state to toggle.
        // Adapter.toggleVisibility(id, visible).

        // This requires Adapter to tell us state or we toggle blindly.
        // The contract says `toggleVisibility(id, visible)`.
        // To implement `toggle`, we need to know current.
        // Let's assume Adapter handles the DOM logic, but here "toggle" implies logic.
        // We can inspect DOM via Adapter? Or Adapter should have `isChatVisible(id)`.
        // For now, let's implement a simple direct DOM check in Adapter OR just call adapter.toggle(id).
        // Let's update Adapter contract usage:
        // Actually legacy passes logic to DOM.
        // Implementation:
        const container = this.domAdapter.getContainer(id);
        if (container) {
            const isHidden = container.classList.contains('hidden');
            this.domAdapter.toggleVisibility(id, isHidden); // If hidden, make visible (true)
        }
    }

    separateChat(id: number): void {
        // Legacy "Separate" creates a draggable div.
        // It clones the content.
        const instance = this.instances.get(id);
        if (!instance) return;

        const container = this.domAdapter.getContainer(id);
        if (!container) return;

        // Use legacy-style separate div
        // Content: re-generate iframe or move it? Legacy clones/re-creates.

        // If we move it, watchdog reference might break.
        // Simpler: Use Builder to get URL.
        let url = '';
        if (instance.platform === 'twitch' && instance.channelId) {
            url = this.urlBuilder.buildTwitchUrl(instance.channelId);
        } else if (instance.platform === 'youtube' && instance.videoId) {
            url = this.urlBuilder.buildYouTubeUrl(instance.videoId);
        }

        const contentHtml = `<iframe src="${url}" style="width:100%;height:100%;border:0" allow="autoplay;fullscreen"></iframe>`;

        // Create Separated Div
        this.domAdapter.createSeparatedDiv(id, contentHtml);

        // Hide Original
        this.domAdapter.toggleVisibility(id, false);

        instance.isSeparated = true;
    }

    closeSeparatedChat(id: number): void {
        this.domAdapter.removeElement(`separated-chat-${id}`);
        this.domAdapter.toggleVisibility(id, true);

        const instance = this.instances.get(id);
        if (instance) instance.isSeparated = false;
    }

    setupChatResizer(id: number): void {
        this.domAdapter.setupResizer(id, (w, h) => {
            // Callback logic if needed
        });
    }

    getLegacyApi() {
        return {
            createChat: this.createChat.bind(this),
            toggleChat: this.toggleChat.bind(this),
            separateChat: this.separateChat.bind(this),
            closeSeparatedChat: this.closeSeparatedChat.bind(this),
            setupChatResizer: this.setupChatResizer.bind(this)
        };
    }
}
