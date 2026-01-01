import { useState, useRef, useEffect, useCallback } from 'react';
import { useStreamStore } from '../store/useStreamStore';
import { usePlayerStore } from '../store/playerStore';

export function useYouTubeRisk() {
    const streams = useStreamStore(s => s.streams);
    const getPlayer = usePlayerStore(s => s.getPlayer);

    const [showYTRiskDialog, setShowYTRiskDialog] = useState(false);
    const [currentYTRiskCount, setCurrentYTRiskCount] = useState(0);
    const ytRiskLevelsShownRaw = useRef({ soft: false, strong: false });
    const ytRiskSessionDismissedRaw = useRef(false);

    // Initialize YT Risk Session
    useEffect(() => {
        if (typeof sessionStorage !== 'undefined') {
            const dismissed = sessionStorage.getItem('ytRiskDismissed');
            if (dismissed === 'true') {
                ytRiskSessionDismissedRaw.current = true;
            }
        }
    }, []);

    // Monitor Active YouTube Streams
    useEffect(() => {
        const checkInterval = setInterval(() => {
            // If user dismissed for session, do nothing
            if (ytRiskSessionDismissedRaw.current) return;

            const youtubeStreams = streams.filter(s => s.platform === 'youtube');
            if (youtubeStreams.length === 0) return;

            let playingCount = 0;
            let checkedCount = 0;

            youtubeStreams.forEach(s => {
                const p = getPlayer(s.id);
                if (p && p.type === 'youtube' && p.player) {
                    // Check if player API is ready
                    try {
                        if (typeof p.player.getPlayerState === 'function') {
                            const state = p.player.getPlayerState();
                            // 1 = PLAYING, 3 = BUFFERING
                            if (state === 1 || state === 3) {
                                playingCount++;
                            }
                            checkedCount++;
                        }
                    } catch (e) {
                        // Player might not be ready
                    }
                }
            });

            // Verification Logic
            let effectiveCount = playingCount;
            if (checkedCount === 0 && youtubeStreams.length >= 2) {
                // If no player is ready yet/detectable, use added count
                effectiveCount = youtubeStreams.length;
            }

            // Check Thresholds
            let newLevel: 'soft' | 'strong' | null = null;
            if (effectiveCount >= 4) newLevel = 'strong';
            else if (effectiveCount >= 2) newLevel = 'soft';

            if (newLevel) {
                if (newLevel === 'soft' && !ytRiskLevelsShownRaw.current.soft) {
                    setCurrentYTRiskCount(effectiveCount);
                    setShowYTRiskDialog(true);
                    ytRiskLevelsShownRaw.current.soft = true;
                } else if (newLevel === 'strong' && !ytRiskLevelsShownRaw.current.strong) {
                    setCurrentYTRiskCount(effectiveCount);
                    setShowYTRiskDialog(true);
                    ytRiskLevelsShownRaw.current.strong = true;
                }
            }

        }, 3000); // Check every 3 seconds

        return () => clearInterval(checkInterval);
    }, [streams, getPlayer]);

    const handlePauseOtherYouTubeStreams = useCallback(() => {
        const youtubeStreams = streams.filter(s => s.platform === 'youtube');
        if (youtubeStreams.length <= 1) {
            setShowYTRiskDialog(false);
            return;
        }

        // Keep the first one, pause others
        const keeper = youtubeStreams[0];

        youtubeStreams.forEach(s => {
            if (s.id === keeper.id) return; // Skip the first one

            const p = getPlayer(s.id);
            if (p && p.type === 'youtube' && p.player) {
                try {
                    if (typeof p.player.pauseVideo === 'function') {
                        p.player.pauseVideo();
                    }
                } catch (e) { /* ignore */ }
            }
        });
        setShowYTRiskDialog(false);
    }, [streams, getPlayer]);

    const handleRiskDontRemind = useCallback(() => {
        setShowYTRiskDialog(false);
        ytRiskSessionDismissedRaw.current = true;
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('ytRiskDismissed', 'true');
        }
    }, []);

    return {
        showYTRiskDialog,
        currentYTRiskCount,
        setShowYTRiskDialog,
        handlePauseOtherYouTubeStreams,
        handleRiskDontRemind
    };
}
