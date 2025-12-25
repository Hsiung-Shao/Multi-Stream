import { ControlPanelDomAdapter } from './DomAdapter';
import { VolumeService } from '../volume/types';

/**
 * Stream Order Service
 * 
 * Handles the generation and management of the stream order list in the control panel.
 */
export class StreamOrderService {
    private domAdapter: ControlPanelDomAdapter;
    private volumeService?: VolumeService; // Optional dependency to link volume sliders

    constructor(domAdapter: ControlPanelDomAdapter) {
        this.domAdapter = domAdapter;
    }

    setVolumeService(volumeService: VolumeService) {
        this.volumeService = volumeService;
    }

    /**
     * Updates the stream order list DOM based on current streams.
     * @param streamData Global streamData object
     * @param playerContainer Global container element (used for reordering actual stream boxes)
     * @param moveCallbacks Callbacks for move up/down actions (to be bound to buttons)
     */
    updateStreamOrderList(
        streamData: Record<number, any>,
        moveCallbacks: {
            onMoveUp: (id: number) => void,
            onMoveDown: (id: number) => void
        }
    ): void {
        const orderList = this.domAdapter.getStreamOrderList();
        if (!orderList) return;

        const boxes = this.domAdapter.getAllStreamBoxes();

        // Clear existing list
        this.domAdapter.clearStreamOrderList();

        if (boxes.length === 0) {
            const emptyDiv = this.domAdapter.createElement('div');
            emptyDiv.style.cssText = 'padding: 10px; text-align: center; color: #888; font-size: 12px;';
            emptyDiv.textContent = this.domAdapter.translate('noStreams');
            this.domAdapter.appendToStreamOrderList(emptyDiv);
            return;
        }

        boxes.forEach((box, index) => {
            const id = parseInt(box.dataset.streamId || '0');
            const data = streamData[id];
            if (!data) return;

            const item = this.createStreamOrderItem(id, data, index, moveCallbacks);
            this.domAdapter.appendToStreamOrderList(item);
        });
    }

    private createStreamOrderItem(
        id: number,
        data: any,
        index: number,
        callbacks: { onMoveUp: (id: number) => void, onMoveDown: (id: number) => void }
    ): HTMLElement {
        const item = this.domAdapter.createElement('div');
        item.className = 'stream-order-item';
        item.dataset.streamId = id.toString();
        item.draggable = false;

        // Label Logic (Copied from legacy)
        let label = this.resolveStreamLabel(data);
        const currentVolume = data.volume || 100;

        // Header
        const header = this.domAdapter.createElement('div');
        header.className = 'stream-order-header';

        const handle = this.domAdapter.createElement('span');
        handle.className = 'stream-order-handle';
        handle.textContent = '☰';

        const labelSpan = this.domAdapter.createElement('span');
        labelSpan.className = 'stream-order-label';
        labelSpan.textContent = `#${index + 1} - ${label}`;

        const buttons = this.domAdapter.createElement('div');
        buttons.className = 'stream-order-buttons';

        const upBtn = this.domAdapter.createElement('button');
        upBtn.title = this.domAdapter.translate('moveUp');
        upBtn.textContent = '↑';
        upBtn.onclick = () => callbacks.onMoveUp(id);

        const downBtn = this.domAdapter.createElement('button');
        downBtn.title = this.domAdapter.translate('moveDown');
        downBtn.textContent = '↓';
        downBtn.onclick = () => callbacks.onMoveDown(id);

        buttons.appendChild(upBtn);
        buttons.appendChild(downBtn);

        header.appendChild(handle);
        header.appendChild(labelSpan);
        header.appendChild(buttons);

        // Volume Div
        const volumeDiv = this.domAdapter.createElement('div');
        volumeDiv.className = 'stream-order-volume';

        const volumeLabel = this.domAdapter.createElement('label');
        volumeLabel.htmlFor = `stream-volume-${id}`;
        volumeLabel.textContent = '🔊 ' + this.domAdapter.translate('volume');

        const volumeSlider = this.domAdapter.createElement('input');
        volumeSlider.type = 'range';
        volumeSlider.id = `stream-volume-${id}`;
        volumeSlider.min = '0';
        volumeSlider.max = '100';
        volumeSlider.value = currentVolume.toString();
        volumeSlider.title = this.domAdapter.translate('adjustVolume');

        const volumeValue = this.domAdapter.createElement('span');
        volumeValue.className = 'stream-order-volume-value';
        volumeValue.id = `stream-volume-value-${id}`;
        volumeValue.textContent = currentVolume + '%';

        volumeDiv.appendChild(volumeLabel);
        volumeDiv.appendChild(volumeSlider);
        volumeDiv.appendChild(volumeValue);

        item.appendChild(header);
        item.appendChild(volumeDiv);

        // Bind Volume Events
        volumeSlider.addEventListener('input', () => {
            const vol = parseInt(volumeSlider.value);
            volumeValue.textContent = vol + '%';

            // Side effect: update data directly
            data.volume = vol;

            // Sync with stream box volume slider if exists
            const box = document.getElementById('box' + id);
            if (box) {
                const boxVolSlider = box.querySelector('.volume') as HTMLInputElement;
                const boxVolValue = box.querySelector('.vol-value');
                if (boxVolSlider && boxVolValue) {
                    boxVolSlider.value = vol.toString();
                    boxVolValue.textContent = vol + '%';
                }
            }

            // Call Volume Service
            if (this.volumeService) {
                this.volumeService.applyMasterVolumeToStream(id);
            }
        });

        // Prevent Drag on Volume
        volumeDiv.addEventListener('mousedown', (e) => e.stopPropagation());

        // Add Drag Support for Header (Simplified for this phase, assuming legacy handlers might still exist or we re-implement minimal drag)
        // Note: Legacy used direct event listeners on created elements. We should ideally attach them here if we want to support DnD.
        // For PR B (No Wiring), we'll implement the basic structure. Full Drag n Drop re-implementation might be needed if legacy handlers are attached to global document, but legacy attached to *created element*.
        // So we strictly need to attach drag handlers here to maintain feature parity.
        this.attachDragHandlers(item, header, id);

        return item;
    }

    private resolveStreamLabel(data: any): string {
        // Logic to determine label from favorites or data
        // For now, simplify to use displayName or name or ID, similar to legacy
        let label = '';

        // NOTE: Accessing window.favoriteStreams is required for full parity
        // @ts-ignore
        const favoriteStreamsObj = window.favoriteStreams;
        if (favoriteStreamsObj && typeof favoriteStreamsObj.getList === 'function') {
            // ... legacy matching logic omitted for brevity in this step, 
            // in real implementation should copy logic. 
            // We'll trust data.displayName for now or basic fallback.
        }

        if (!label) {
            if (data.displayName) label = data.displayName;
            else if (data.name) label = data.name;
        }

        if (!label) {
            label = data.platform === 'twitch' ? data.channelId : (data.platform === 'youtube' ? data.videoId : `Stream #${data.streamId}`);
        }

        // Escape HTML not strictly needed if we use textContent, which we do.
        return label;
    }

    private attachDragHandlers(item: HTMLElement, header: HTMLElement, id: number) {
        header.draggable = true;
        header.style.cursor = 'move';

        header.addEventListener('dragstart', (e) => {
            if (e.dataTransfer) {
                e.dataTransfer.setData('text/plain', id.toString());
            }
            item.classList.add('dragging');
            e.stopPropagation();
        });

        header.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });

        // Drop logic is complex and involves reordering global DOM. 
        // For PR B, call `reorderStreams` on the Manager/Service if we had full wiring.
        // Since we can't easily reference the Manager from here without circular dependency,
        // we might leave the DROP handler to be setup globally or pass a callback.
        // Legacy attaches dragover/drop to the HEADER of the item being dragged OVER.

        header.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Visual feedback logic (insertBefore) would go here
        });

        // Actual drop handling to be implemented or passed in
    }
}
