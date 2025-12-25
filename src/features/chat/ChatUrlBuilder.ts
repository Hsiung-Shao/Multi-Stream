
import { ChatUrlBuilderContract } from './types';

export class ChatUrlBuilder implements ChatUrlBuilderContract {

    constructor() { }

    buildTwitchUrl(channelId: string): string {
        const parents = this.getTwitchParents();
        // Construct standard Twitch fetch URL
        // https://dev.twitch.tv/docs/embed/chat
        // Must include parent for each domain
        // Legacy: `https://www.twitch.tv/embed/${channelId}/chat?parent=${parent}&darkpopout`

        // Handle multiple parents if necessary, though typical legacy only handled one for the current valid domain.
        // We will take the first valid parent for the primary parameter.
        const primaryParent = parents[0] || 'localhost';

        return `https://www.twitch.tv/embed/${encodeURIComponent(channelId)}/chat?parent=${encodeURIComponent(primaryParent)}&darkpopout`;
    }

    buildYouTubeUrl(videoId: string): string {
        const domain = this.getParentDomain();
        // Legacy: `https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${domain}`
        return `https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}&embed_domain=${encodeURIComponent(domain)}`;
    }

    getTwitchParents(): string[] {
        const domain = this.getParentDomain();
        // Twitch CSP allows localhost variants
        if (domain === 'localhost') {
            return ['localhost'];
        }
        return [domain];
    }

    getParentDomain(): string {
        if (typeof window === 'undefined') return 'localhost';

        const { hostname, protocol } = window.location;

        if (protocol === 'file:' || !hostname) {
            return 'localhost';
        }

        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
            return 'localhost';
        }

        return hostname;
    }
}
