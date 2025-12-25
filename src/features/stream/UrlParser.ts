import { StreamPlatform } from './types';

export interface ParsedUrl {
    valid: boolean;
    platform?: StreamPlatform;
    identifier?: string;
    channelId?: string; // For YouTube specifically
    error?: string;
}

export class UrlParser {
    static parse(input: string): ParsedUrl {
        if (!input) {
            return { valid: false, error: 'Input is empty' };
        }

        const trimmed = input.trim();

        // Twitch Logic
        if (trimmed.includes('twitch.tv/')) {
            const match = trimmed.match(/twitch\.tv\/([^\/\?]+)/);
            if (match && match[1]) {
                return {
                    valid: true,
                    platform: 'twitch',
                    identifier: match[1]
                };
            }
        }
        // Direct Twitch Login Name (if no extension and not a url)
        else if (!trimmed.includes('.') && !trimmed.includes('/') && !trimmed.includes(':')) {
            // Assume it's a Twitch channel name if it's alphanumeric and underscore
            if (/^[a-zA-Z0-9_]{4,25}$/.test(trimmed)) {
                return {
                    valid: true,
                    platform: 'twitch',
                    identifier: trimmed
                };
            }
        }

        // YouTube Logic
        if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
            let videoId: string | null = null;
            let channelId: string | undefined = undefined;

            // Extract Video ID
            if (trimmed.includes('/live/')) {
                videoId = trimmed.split('/live/')[1]?.split('?')[0];
            } else if (trimmed.includes('v=')) {
                const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
                videoId = urlObj.searchParams.get('v');
            } else if (trimmed.includes('youtu.be/')) {
                videoId = trimmed.split('youtu.be/')[1]?.split('?')[0];
            }

            // Extract Channel ID (if present)
            // Example: youtube.com/channel/UCxxxxx/live -> We can't handle /live on channel without API, 
            // but if the user pastes a raw channel url, we might error or handle differently.
            // Based on legacy stream.js, it extracts channelId if present.
            const channelMatch = trimmed.match(/youtube\.com\/channel\/([^\/\?]+)/);
            if (channelMatch) {
                channelId = channelMatch[1];
            }

            if (videoId) {
                return {
                    valid: true,
                    platform: 'youtube',
                    identifier: videoId,
                    channelId
                };
            }
        }

        return { valid: false, error: 'Unsupported URL or format' };
    }
}
