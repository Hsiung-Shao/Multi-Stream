/**
 * ChatConnector
 * 負責連接 Legacy global window.chat interactions
 * 
 * 依賴 global:
 * - window.createChat
 * - window.toggleChat
 * - window.separateChat
 * - window.destroyChat
 */
export class ChatConnector {
    create(id: number, platform: string, identifier: string): void {
        const win = window as any;
        if (typeof win.createChat === 'function') {
            // Legacy createChat signature: (id, platform, channelId/videoId, videoId?)
            // For Twitch: (id, 'twitch', channelId)
            // For YouTube: (id, 'youtube', channelId?, videoId) -> wait, legacy analysis says:
            // createChat(id, platform, channelId, videoId)

            // We pass identifier as 3rd arg (channelId) for Twitch
            // For YouTube, legacy stream.js passed: createChat(id, platform, channelId, videoId)
            // Since we stored 'identifier' as videoId for YouTube in UrlParser, and channelId separately.

            // This needs to align with how StreamManager calls it. 
            // We will let StreamManager pass the args, this is just a proxy.
        } else {
            console.warn('[ChatConnector] window.createChat is not defined');
        }
    }

    toggle(id: number): void {
        const win = window as any;
        if (typeof win.toggleChat === 'function') {
            win.toggleChat(id);
        }
    }

    separate(id: number): void {
        const win = window as any;
        if (typeof win.separateChat === 'function') {
            win.separateChat(id);
        }
    }

    destroy(id: number): void {
        const win = window as any;
        if (typeof win.destroyChat === 'function') {
            win.destroyChat(id);
        }
    }

    // Low-level raw call helper for StreamManager
    callCreate(id: number, platform: string, channelId: string | null, videoId: string | null): void {
        const win = window as any;
        if (typeof win.createChat === 'function') {
            win.createChat(id, platform, channelId, videoId);
        }
    }
}
