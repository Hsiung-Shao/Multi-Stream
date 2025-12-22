/**
 * Unified Player Adapter
 * 
 * Wraps Twitch and YouTube player instances to provide a consistent interface
 * for volume control and muting.
 */

// Define player interfaces based on what I saw in legacy code
interface TwitchPlayer {
    setMuted: (muted: boolean) => void;
    setVolume: (volume: number) => void;
}

interface YouTubePlayer {
    mute: () => void;
    unMute: () => void;
    setVolume: (volume: number) => void;
    getPlayerState: () => number;
}

interface PlayerWrapper {
    player: TwitchPlayer | YouTubePlayer | any;
    type: 'twitch' | 'youtube' | string;
}

export class PlayerAdapter {
    private players: Record<number, PlayerWrapper>;

    constructor(players: Record<number, PlayerWrapper>) {
        this.players = players;
    }

    /**
     * Sets volume for a specific player.
     * @param id Stream ID
     * @param volume Volume level 0-100
     */
    setVolume(id: number, volume: number): void {
        const p = this.players[id];
        if (!p || !p.player) return;

        if (p.type === 'twitch') {
            this.setTwitchVolume(p.player, volume);
        } else if (p.type === 'youtube') {
            this.setYouTubeVolume(p.player, volume);
        }
    }

    /**
     * Mutes or unmutes a specific player.
     * @param id Stream ID
     * @param muted Boolean state
     */
    setMuted(id: number, muted: boolean): void {
        const p = this.players[id];
        if (!p || !p.player) return;

        if (p.type === 'twitch') {
            this.setTwitchMuted(p.player, muted);
        } else if (p.type === 'youtube') {
            this.setYouTubeMuted(p.player, muted);
        }
    }

    // --- Twitch Implementation ---

    private setTwitchVolume(player: TwitchPlayer, volume: number): void {
        try {
            if (volume === 0) {
                if (typeof player.setMuted === 'function') player.setMuted(true);
                else if (typeof player.setVolume === 'function') player.setVolume(0);
            } else {
                if (typeof player.setMuted === 'function') player.setMuted(false);
                if (typeof player.setVolume === 'function') player.setVolume(volume / 100);
            }
        } catch (e) { /* ignore */ }
    }

    private setTwitchMuted(player: TwitchPlayer, muted: boolean): void {
        try {
            if (typeof player.setMuted === 'function') {
                player.setMuted(muted);
            } else if (typeof player.setVolume === 'function' && muted) {
                player.setVolume(0);
            }
        } catch (e) { /* ignore */ }
    }

    // --- YouTube Implementation ---

    private setYouTubeVolume(player: YouTubePlayer, volume: number, retry: boolean = true): void {
        try {
            // Check state if possible
            if (typeof player.getPlayerState === 'function') {
                const state = player.getPlayerState();
                if (state === undefined) throw new Error("Player not ready");
            }

            if (volume === 0) {
                if (typeof player.mute === 'function') player.mute();
                else if (typeof player.setVolume === 'function') player.setVolume(0);
            } else {
                if (typeof player.unMute === 'function') player.unMute();
                if (typeof player.setVolume === 'function') player.setVolume(volume);
            }
        } catch (e) {
            // One-time retry
            if (retry) {
                setTimeout(() => {
                    this.setYouTubeVolume(player, volume, false);
                }, 500);
            }
        }
    }

    private setYouTubeMuted(player: YouTubePlayer, muted: boolean, retry: boolean = true): void {
        try {
            // Check state
            if (typeof player.getPlayerState === 'function') {
                const state = player.getPlayerState();
                if (state === undefined) throw new Error("Player not ready");
            }

            if (muted) {
                if (typeof player.mute === 'function') player.mute();
                else if (typeof player.setVolume === 'function') player.setVolume(0);
            } else {
                if (typeof player.unMute === 'function') player.unMute();
                // Note: unMute restores previous volume, but legacy also sets volume. 
                // muteAll() typically only cares about muting, unMuteAll restores volume via setVolume later usually.
                // But for pure "setMuted", usually just unMute is enough.
            }
        } catch (e) {
            if (retry) {
                setTimeout(() => {
                    this.setYouTubeMuted(player, muted, false);
                }, 500);
            }
        }
    }
}
