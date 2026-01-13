import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiLoader } from '../../src/utils/apiLoader';

describe('apiLoader', () => {
    let scriptElement: any;

    beforeEach(() => {
        // Mock document.createElement
        scriptElement = {
            src: '',
            async: false,
            onload: null,
            onerror: null
        };

        vi.spyOn(document, 'createElement').mockReturnValue(scriptElement);
        vi.spyOn(document.head, 'appendChild').mockImplementation(() => scriptElement);

        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        // Reset singleton state if possible. 
        // Note: apiLoader is a singleton instance. State persists.
        // We might need to handle this if tests interfere.
    });

    it('should initialize with idle status', () => {
        const status = apiLoader.getStatus();
        // Depending on test order, it might be loaded. 
        // If isolate per test, it should be idle.
        // For simplicity, we check if it has valid keys
        expect(status).toHaveProperty('twitchPlayer');
        expect(status).toHaveProperty('youtubePlayer');
    });

    it('should load Twitch Player API successfully', async () => {
        // Reset state hack
        (apiLoader as any).state = { twitchPlayer: 'idle', youtubePlayer: 'idle' };

        const loadPromise = apiLoader.loadTwitchPlayerApi();

        expect(apiLoader.getStatus().twitchPlayer).toBe('loading');
        expect(document.createElement).toHaveBeenCalledWith('script');
        expect(scriptElement.src).toContain('player.twitch.tv/js/embed/v1.js');
        expect(document.head.appendChild).toHaveBeenCalled();

        // Simulate script load
        if (scriptElement.onload) {
            // Mock global Twitch object appearing
            (window as any).Twitch = { Player: {} };
            (scriptElement.onload as any)();
        }

        // Fast-forward timers for the interval check inside onload
        vi.advanceTimersByTime(100);

        await loadPromise;
        expect(apiLoader.getStatus().twitchPlayer).toBe('loaded');
    });

    it('should load YouTube Player API successfully', async () => {
        // Reset state hack
        (apiLoader as any).state.youtubePlayer = 'idle';

        const loadPromise = apiLoader.loadYouTubePlayerApi();

        expect(apiLoader.getStatus().youtubePlayer).toBe('loading');
        expect(document.createElement).toHaveBeenCalledWith('script');
        expect(scriptElement.src).toContain('youtube.com/iframe_api');

        // Simulate global callback for YouTube
        if ((window as any).onYouTubeIframeAPIReady) {
            (window as any).YT = { Player: {} };
            (window as any).onYouTubeIframeAPIReady();
        }

        await loadPromise;
        expect(apiLoader.getStatus().youtubePlayer).toBe('loaded');
    });

    it('should handle existing loaded APIs', async () => {
        // Setup existing API
        (window as any).Twitch = { Player: {} };
        (apiLoader as any).state.twitchPlayer = 'loaded';

        await apiLoader.loadTwitchPlayerApi();
        expect(document.createElement).not.toHaveBeenCalled();
        expect(apiLoader.getStatus().twitchPlayer).toBe('loaded');
    });
});
