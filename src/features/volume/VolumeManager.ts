import { VolumeService } from './types';
import { PlayerAdapter } from './PlayerAdapter';

/**
 * Volume Manager
 * 
 * Manages master volume and distribution of volume settings to individual streams.
 */
export class VolumeManager implements VolumeService {
    private playerAdapter: PlayerAdapter;
    private getStreamData: () => Record<number, any>;
    private autoSaveSettings: () => void;

    // Master Volume State
    private masterVolume: number = 100;
    private previousMasterVolume: number = 100;

    constructor(
        playerAdapter: PlayerAdapter,
        getStreamData: () => Record<number, any>,
        autoSaveSettings: () => void
    ) {
        this.playerAdapter = playerAdapter;
        this.getStreamData = getStreamData;
        this.autoSaveSettings = autoSaveSettings;
    }

    /**
     * Initializes master volume from storage or DOM if needed.
     * For now, allows getting/setting.
     */
    setMasterVolumeValue(val: number) {
        if (val > 0) {
            this.previousMasterVolume = val;
        }
        this.masterVolume = val;
    }

    getMasterVolume(): number {
        return this.masterVolume;
    }

    applyMasterVolumeToStream = (id: number): void => {
        const streamData = this.getStreamData();
        const data = streamData[id];

        if (!data) return;

        // Get Stream Volume from DOM or Data (Legacy prefers DOM if available, we'll try DOM then Data)
        let streamVol = data.volume || 100;

        const volSlider = document.querySelector(`#box${id} .volume`) as HTMLInputElement;
        if (volSlider) {
            streamVol = parseInt(volSlider.value);
        }

        const actualVol = Math.round((streamVol / 100) * this.masterVolume);

        // Update UI Text
        const volValue = document.querySelector(`#box${id} .vol-value`);
        if (volValue) {
            volValue.textContent = actualVol + '%';
        }

        // Apply to Player
        this.playerAdapter.setVolume(id, actualVol);
    }

    setupVolumeControl = (box: HTMLElement, id: number): void => {
        const volSlider = box.querySelector('.volume') as HTMLInputElement;
        const volValue = box.querySelector('.vol-value');

        if (!volSlider) return;

        // Initial Apply
        setTimeout(() => {
            this.applyMasterVolumeToStream(id);
        }, 500);

        volSlider.addEventListener('input', () => {
            const vol = parseInt(volSlider.value);
            const streamData = this.getStreamData();
            if (streamData[id]) {
                streamData[id].volume = vol;
            }

            // Recalculate and Apply
            const actualVol = Math.round((vol / 100) * this.masterVolume);

            if (volValue) {
                volValue.textContent = actualVol + '%';
            }

            this.playerAdapter.setVolume(id, actualVol);
        });
    }

    updateMasterVolume = (): void => {
        const masterVolSlider = document.getElementById('master-volume') as HTMLInputElement;
        const masterVolValue = document.getElementById('master-volume-value');

        if (masterVolSlider) {
            const newVolume = parseInt(masterVolSlider.value);
            this.setMasterVolumeValue(newVolume);

            if (masterVolValue) {
                masterVolValue.textContent = this.masterVolume + '%';
            }

            // Apply to all streams
            const boxes = document.querySelectorAll('.stream-box');
            boxes.forEach(box => {
                const id = parseInt((box as HTMLElement).dataset.streamId || '0');
                if (id) {
                    this.applyMasterVolumeToStream(id);
                }
            });

            this.autoSaveSettings();
        }
    }

    muteAll = (): void => {
        const masterVolSlider = document.getElementById('master-volume') as HTMLInputElement;

        if (masterVolSlider) {
            if (this.masterVolume > 0) {
                // MUTE
                this.previousMasterVolume = this.masterVolume;
                this.masterVolume = 0;
                masterVolSlider.value = '0';

                // Use setMuted(true) for all players
                const boxes = document.querySelectorAll('.stream-box');
                boxes.forEach(box => {
                    const id = parseInt((box as HTMLElement).dataset.streamId || '0');
                    if (id) {
                        // Calls adapter setMuted
                        this.playerAdapter.setMuted(id, true);
                    }
                });

                this.updateMasterVolume(); // Updates text

            } else {
                // UNMUTE
                const restore = this.previousMasterVolume > 0 ? this.previousMasterVolume : 100;
                this.masterVolume = restore;
                masterVolSlider.value = restore.toString();

                const boxes = document.querySelectorAll('.stream-box');
                boxes.forEach(box => {
                    const id = parseInt((box as HTMLElement).dataset.streamId || '0');
                    if (id) {
                        this.playerAdapter.setMuted(id, false);
                        // Note: setMuted(false) on YouTube just unmutes, need to set volume too to be safe?
                        // Legacy muteAll() 'unmute' block:
                        // Twitch: setMuted(false). 
                        // YouTube: unMute().
                        // Then calls updateMasterVolume().
                        // Logic below calls updateMasterVolume, which will apply calculated actualVol to all players.
                    }
                });

                this.updateMasterVolume();
            }
        }
    }
}
