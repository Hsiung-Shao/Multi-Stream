import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../../store/playerStore';
import { apiLoader } from '../../../utils/apiLoader';
import { StreamData } from '../../../utils/streamUtils';

interface StreamIframeProps {
    streamData: StreamData;
    volume: number;
    isMuted: boolean;
    onReady?: () => void;
    onError?: (error: string) => void;
    className?: string; // Allow styling from parent
}

declare global {
    interface Window {
        Twitch?: any;
        YT?: any;
    }
}

export function StreamIframe({
    streamData,
    volume,
    isMuted,
    onReady,
    onError,
    className
}: StreamIframeProps) {
    const registerPlayer = usePlayerStore(s => s.registerPlayer);
    const unregisterPlayer = usePlayerStore(s => s.unregisterPlayer);
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<any>(null); // Hold direct reference to player instance

    // Track initialization state to prevent double creation
    const isInitializingRef = useRef(false);
    const currentStreamIdRef = useRef(streamData.id);

    // Effect to handle player creation and lifecycle
    useEffect(() => {
        // If stream ID changes, we need to reset
        if (currentStreamIdRef.current !== streamData.id) {
            currentStreamIdRef.current = streamData.id;
            // Cleanup old player if needed (handled by cleanup function below too)
        }

        const loadPlayer = async () => {
            if (!containerRef.current) return;
            if (isInitializingRef.current) return;

            const existingEntry = usePlayerStore.getState().getPlayer(streamData.id);
            if (existingEntry && existingEntry.player) {
                // Already exists? Verify correctness or just return
                playerRef.current = existingEntry.player;
                return;
            }

            isInitializingRef.current = true;

            try {
                // Clear container
                containerRef.current.innerHTML = '';

                if (streamData.platform === 'twitch') {
                    await createTwitchPlayer();
                } else if (streamData.platform === 'youtube') {
                    await createYouTubePlayer();
                }
            } catch (err) {
                console.error('[StreamIframe] Error creating player:', err);
                onError?.('Player creation failed');
            } finally {
                isInitializingRef.current = false;
            }
        };

        loadPlayer();

        return () => {
            // Cleanup
            unregisterPlayer(streamData.id);
            if (playerRef.current) {
                if (streamData.platform === 'youtube' && typeof playerRef.current.destroy === 'function') {
                    try { playerRef.current.destroy(); } catch (e) { }
                }
                // Twitch doesn't have destroy for iframe embedded via JS constructor usually, removing container content is enough, 
                // but explicit cleanup is cleaner if API supports it. Twitch Player API usually just needs the div to be removed.
            }
            playerRef.current = null;
            if (containerRef.current) containerRef.current.innerHTML = '';
            isInitializingRef.current = false;
        };
    }, [streamData.id, streamData.platform, streamData.channelId, streamData.videoId]); // Dependencies for recreation

    // Effect to apply Volume/Mute changes
    useEffect(() => {
        if (!playerRef.current) return;
        applyVolume(playerRef.current, volume, isMuted, streamData.platform);
    }, [volume, isMuted, streamData.platform]);

    // --- Helper Functions ---

    const applyVolume = (player: any, vol: number, muted: boolean, platform: string) => {
        try {
            if (platform === 'twitch') {
                if (muted) {
                    if (typeof player.setMuted === 'function') player.setMuted(true);
                } else {
                    if (typeof player.setMuted === 'function') player.setMuted(false);
                    if (typeof player.setVolume === 'function') player.setVolume(vol / 100);
                }
            } else if (platform === 'youtube') {
                if (muted) {
                    if (typeof player.mute === 'function') player.mute();
                } else {
                    if (typeof player.unMute === 'function') player.unMute();
                    if (typeof player.setVolume === 'function') player.setVolume(vol);
                }
            }
        } catch (e) {
            // Ignore errors if player not ready
        }
    };

    const createTwitchPlayer = async () => {
        if (!window.Twitch || !window.Twitch.Player) {
            await apiLoader.loadTwitchPlayerApi();
        }

        if (!containerRef.current) return;

        const options = {
            width: '100%',
            height: '100%',
            channel: streamData.channelId,
            parent: getTwitchParents(),
            autoplay: true,
            muted: isMuted, // Initialize with prop
        };

        const player = new window.Twitch.Player(containerRef.current, options);
        playerRef.current = player;

        // Register
        registerPlayer(streamData.id, { type: 'twitch', player });

        // Event Listeners
        player.addEventListener(window.Twitch.Player.READY, () => {
            applyVolume(player, volume, isMuted, 'twitch'); // Apply initial volume
            onReady?.();
        });
    };

    const createYouTubePlayer = async () => {
        // Ensure API
        if (!window.YT || !window.YT.Player) {
            await apiLoader.loadYouTubePlayerApi();
        }

        // Wait for container dimensions? (Legacy logic did this, maybe less critical now if CSS implies size)
        // We will assume container has size or will have size.

        new window.YT.Player(containerRef.current, {
            videoId: streamData.videoId,
            width: '100%',
            height: '100%',
            playerVars: {
                autoplay: 1,
                mute: isMuted ? 1 : 0,
                rel: 0,
                modestbranding: 1,
                playsinline: 1,
                enablejsapi: 1,
                origin: window.location.origin
            },
            events: {
                onReady: (event: any) => {
                    playerRef.current = event.target;
                    // Handle Live Seek Logic (Legacy)
                    handleYouTubeLiveSeek(event.target);
                    applyVolume(event.target, volume, isMuted, 'youtube');

                    registerPlayer(streamData.id, { type: 'youtube', player: event.target });
                    onReady?.();
                },
                onError: (event: any) => {
                    onError?.(`YouTube Error: ${event.data}`);
                }
            }
        });
    };

    const getTwitchParents = () => {
        const hostname = window.location.hostname;
        return hostname === 'localhost' ? ['localhost'] : [hostname];
    };

    const handleYouTubeLiveSeek = (player: any) => {
        // Simplified live seek logic
        try {
            const duration = player.getDuration();
            if (duration === Infinity || duration > 86400) {
                player.seekTo(Number.MAX_SAFE_INTEGER, true);
            }
        } catch (e) { }
    };

    return (
        <div
            ref={containerRef}
            className={`w-full h-full ${className || ''}`}
            id={`player-container-${streamData.id}`} // Helper for debugging
        />
    );
}
