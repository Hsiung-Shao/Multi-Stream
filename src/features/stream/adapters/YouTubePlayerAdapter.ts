import { PlayerAdapterContract } from '../types';

export class YouTubePlayerAdapter implements PlayerAdapterContract {
    public type: 'youtube' = 'youtube';
    public player: any; // YT.Player instance

    constructor(playerInstance: any) {
        this.player = playerInstance;
    }

    destroy(): void {
        if (this.player && typeof this.player.destroy === 'function') {
            this.player.destroy();
        }
    }

    setVolume(volume: number): void {
        if (this.player && typeof this.player.setVolume === 'function') {
            this.player.setVolume(volume);
        }
    }

    setMuted(muted: boolean): void {
        if (this.player && typeof this.player.mute === 'function' && typeof this.player.unMute === 'function') {
            if (muted) {
                this.player.mute();
            } else {
                this.player.unMute();
            }
        }
    }

    pause(): void {
        if (this.player && typeof this.player.pauseVideo === 'function') {
            this.player.pauseVideo();
        }
    }

    play(): void {
        if (this.player && typeof this.player.playVideo === 'function') {
            this.player.playVideo();
        }
    }
}
