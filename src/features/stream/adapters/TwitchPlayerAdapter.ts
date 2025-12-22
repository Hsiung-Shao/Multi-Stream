import { PlayerAdapterContract } from '../types';

export class TwitchPlayerAdapter implements PlayerAdapterContract {
    public type: 'twitch' = 'twitch';
    public player: any; // Twitch.Player instance

    constructor(playerInstance: any) {
        this.player = playerInstance;
    }

    destroy(): void {
        // Mock safe destroy
        if (this.player && typeof this.player.pause === 'function') {
            // Twitch player doesn't have a standardized destroy in all versions, 
            // but we simulate cleanup here.
        }
    }

    setVolume(volume: number): void {
        if (this.player && typeof this.player.setVolume === 'function') {
            this.player.setVolume(volume / 100);
        }
    }

    setMuted(muted: boolean): void {
        if (this.player && typeof this.player.setMuted === 'function') {
            this.player.setMuted(muted);
        }
    }

    pause(): void {
        if (this.player && typeof this.player.pause === 'function') {
            this.player.pause();
        }
    }

    play(): void {
        if (this.player && typeof this.player.play === 'function') {
            this.player.play();
        }
    }
}
