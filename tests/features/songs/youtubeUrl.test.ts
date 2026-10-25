import { describe, it, expect } from 'vitest';
import { extractVideoId } from '../../../src/features/songs/lib/youtubeUrl';

const ID = 'dQw4w9WgXcQ';

describe('extractVideoId', () => {
    it('各種 YouTube 網址取得 11 碼 ID', () => {
        const inputs = [
            `https://www.youtube.com/watch?v=${ID}`,
            `https://www.youtube.com/watch?t=30&v=${ID}&list=PL123`,
            `https://youtu.be/${ID}`,
            `https://youtu.be/${ID}?t=10`,
            `https://www.youtube.com/live/${ID}`,
            `https://www.youtube.com/shorts/${ID}`,
            `https://m.youtube.com/watch?v=${ID}`,
            ID,
        ];
        for (const input of inputs) {
            expect(extractVideoId(input), input).toBe(ID);
        }
    });

    it('非 YouTube 網域或長度錯誤回 null', () => {
        expect(extractVideoId(`https://example.com/watch?v=${ID}`)).toBeNull();
        expect(extractVideoId(`https://notyoutube.com/watch?v=${ID}`)).toBeNull();
        expect(extractVideoId('https://www.youtube.com/watch?v=short')).toBeNull();
        expect(extractVideoId('abc')).toBeNull();
        expect(extractVideoId(`${ID}x`)).toBeNull();
        expect(extractVideoId('')).toBeNull();
    });
});
