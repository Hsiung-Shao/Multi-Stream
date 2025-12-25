/**
 * Volume Service Interface
 * 
 * Defines the contract for the Volume control functionality, mapping to the legacy
 * implementation in `js/volume.js`.
 */
export interface VolumeService {
    /**
     * Applies the master volume scaling to a specific stream.
     * Maps to legacy `applyMasterVolumeToStream(id)`.
     * @param id The stream ID.
     * Side Effects: Calls player SET_VOLUME/SET_MUTED APIs, updates DOM .vol-value.
     */
    applyMasterVolumeToStream: (id: number) => void;

    /**
     * Sets up event listeners for a stream's volume slider.
     * Maps to legacy `setupVolumeControl(box, id)`.
     * @param box The stream box DOM element containing the slider.
     * @param id The stream ID.
     */
    setupVolumeControl: (box: HTMLElement, id: number) => void;

    /**
     * Updates the master volume from the UI slider and applies it to all streams.
     * Maps to legacy `updateMasterVolume()`.
     * Side Effects: Updates global `masterVolume`, iterates all streams to apply volume.
     */
    updateMasterVolume: () => void;

    /**
     * Mutes or Unmutes all streams (Master Mute).
     * Maps to legacy `muteAll()`.
     * Side Effects: Sets master volume slider to 0 or restore, updates global state, calls player APIs directly.
     */
    muteAll: () => void;
}
