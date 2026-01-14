import { describe, it, expect, vi } from 'vitest';
import { validateUrl, validateChannelId, validateVideoId, parseStreamUrl } from '../../src/utils/streamUtils';

// Mock i18next
vi.mock('../../src/i18n/i18n', () => ({
    default: {
        t: (key: string) => key,
    },
}));

describe('streamUtils', () => {
    describe('validateUrl', () => {
        it('should validate correct Twitch URLs', () => {
            expect(validateUrl('https://www.twitch.tv/shroud').valid).toBe(true);
            expect(validateUrl('twitch.tv/shroud').valid).toBe(true); // Should auto-add https
        });

        it('should validate correct YouTube URLs', () => {
            expect(validateUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ').valid).toBe(true);
            expect(validateUrl('https://youtu.be/dQw4w9WgXcQ').valid).toBe(true);
        });

        it('should reject invalid domains', () => {
            expect(validateUrl('https://example.com/stream').valid).toBe(false);
        });

        it('should reject empty or non-string inputs', () => {
            expect(validateUrl('').valid).toBe(false);
            expect(validateUrl(null as any).valid).toBe(false);
        });
    });

    describe('validateChannelId', () => {
        it('should accept valid channel IDs', () => {
            expect(validateChannelId('shroud')).toBe(true);
            expect(validateChannelId('Team_Liquid')).toBe(true);
            expect(validateChannelId('User-123')).toBe(true);
        });

        it('should reject invalid channel IDs', () => {
            expect(validateChannelId('invalid/id')).toBe(false);
            expect(validateChannelId('invalid space')).toBe(false);
            expect(validateChannelId('')).toBe(false);
            expect(validateChannelId(null as any)).toBe(false);
        });
    });

    describe('validateVideoId', () => {
        it('should accept valid video IDs', () => {
            expect(validateVideoId('dQw4w9WgXcQ')).toBe(true);
        });
        it('should reject invalid video IDs', () => {
            expect(validateVideoId('')).toBe(false);
        });
    });

    describe('parseStreamUrl', () => {
        it('should parse Twitch URLs', () => {
            const result = parseStreamUrl('https://www.twitch.tv/shroud');
            expect(result.platform).toBe('twitch');
            expect(result.channelId).toBe('shroud');
        });

        it('should parse YouTube URLs', () => {
            const result = parseStreamUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
            expect(result.platform).toBe('youtube');
            expect(result.videoId).toBe('dQw4w9WgXcQ');
        });

        it('should parse YouTube Short URLs (youtu.be)', () => {
            const result = parseStreamUrl('https://youtu.be/dQw4w9WgXcQ');
            expect(result.platform).toBe('youtube');
            expect(result.videoId).toBe('dQw4w9WgXcQ');
        });

        it('should parse YouTube Live URLs', () => {
            const result = parseStreamUrl('https://www.youtube.com/live/someLiveId?feature=share');
            expect(result.platform).toBe('youtube');
            expect(result.videoId).toBe('someLiveId');
        });

        it('should return error for unsupported platforms', () => {
            const result = parseStreamUrl('https://example.com/video');
            expect(result.platform).toBeNull();
            expect(result.error).toBeDefined();
        });

        it('should return error for malformed Twitch URL', () => {
            const result = parseStreamUrl('https://twitch.tv/'); // No channel
            expect(result.platform).toBeNull();
            expect(result.error).toBeDefined();
        });

        it('should return error for YouTube URL without video ID', () => {
            const result = parseStreamUrl('https://www.youtube.com/watch');
            expect(result.platform).toBeNull();
            expect(result.error).toBeDefined();
        });
    });
});
