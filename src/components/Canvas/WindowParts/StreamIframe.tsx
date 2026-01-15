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
        }

        const loadPlayer = async () => {
            if (!containerRef.current) return;
            if (isInitializingRef.current) return;

            // Check if player already exists in global store/cache
            const existingEntry = usePlayerStore.getState().getPlayer(streamData.id);
            if (existingEntry && existingEntry.player) {
                playerRef.current = existingEntry.player;
                // We might need to re-attach the existing player to the DOM if we were unmounted?
                // But usually the player object is tied to the iframe. If the iframe is gone, the player is dead.
                // The store might hold a stale reference if we didn't cleanup properly. 
                // For now, we assume we create a NEW player since we are mounting.
                // If we want to support "moving" iframes without reload, that requires Reparenting, which is complex.
                // We will stick to destruction/recreation for stability.
            }

            isInitializingRef.current = true;

            try {
                // Clear container first
                containerRef.current.innerHTML = '';

                // Create a dedicated child element for the player to replace/embed into
                // This isolates the third-party DOM manipulation from React's VDOM
                const playerTarget = document.createElement('div');
                playerTarget.id = `player-target-${streamData.id}`;
                playerTarget.style.width = '100%';
                playerTarget.style.height = '100%';
                containerRef.current.appendChild(playerTarget);

                if (streamData.platform === 'twitch') {
                    // Twitch embeds INSIDE the target
                    await createTwitchPlayer(playerTarget);
                } else if (streamData.platform === 'youtube') {
                    // YouTube REPLACES the target
                    await createYouTubePlayer(playerTarget);
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
            // Cleanup state
            unregisterPlayer(streamData.id);

            // Cleanup Player Instance
            if (playerRef.current) {
                if (streamData.platform === 'youtube' && typeof playerRef.current.destroy === 'function') {
                    try { playerRef.current.destroy(); } catch (e) { }
                }
                // Twitch player doesn't have a destroy method that cleans up DOM completely, 
                // but since we remove the parent container via React (or manual clear below), it's fine.
            }
            playerRef.current = null;

            // Manual DOM cleanup of the wrapper's children to be safe, 
            // though React will remove the wrapper itself.
            if (containerRef.current) {
                containerRef.current.innerHTML = '';
            }

            isInitializingRef.current = false;
        };
    }, [streamData.id, streamData.platform, streamData.channelId, streamData.videoId, (streamData as any)._reloadKey]);

    // ... (keep useEffect for volume) ...

    const createTwitchPlayer = async (target: HTMLElement) => {
        if (!window.Twitch || !window.Twitch.Player) {
            await apiLoader.loadTwitchPlayerApi();
        }

        const options = {
            width: '100%',
            height: '100%',
            channel: streamData.channelId,
            parent: getTwitchParents(),
            autoplay: true,
            muted: isMuted,
        };

        // Note: Twitch.Player constructor takes the ID or Element
        const player = new window.Twitch.Player(target, options);
        playerRef.current = player;

        registerPlayer(streamData.id, { type: 'twitch', player });

        player.addEventListener(window.Twitch.Player.READY, () => {
            applyVolume(player, volume, isMuted, 'twitch');
            onReady?.();
        });
    };

    const createYouTubePlayer = async (target: HTMLElement) => {
        if (!window.YT || !window.YT.Player) {
            await apiLoader.loadYouTubePlayerApi();
        }

        new window.YT.Player(target, {
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

    // ... (helper functions) ...

    return (
        <div
            ref={containerRef}
            className={`w-full h-full ${className || ''}`}
        // React manages this div. We only mess with its children.
        />
    );
}

// --- Helper Functions ---

function applyVolume(player: any, vol: number, muted: boolean, platform: string) {
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
}

function getTwitchParents() {
    const hostname = window.location.hostname;
    return hostname === 'localhost' ? ['localhost'] : [hostname];
}

function handleYouTubeLiveSeek(player: any) {
    // Simplified live seek logic
    try {
        const duration = player.getDuration();
        if (duration === Infinity || duration > 86400) {
            player.seekTo(Number.MAX_SAFE_INTEGER, true);
        }
    } catch (e) { }
}
