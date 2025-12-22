import { ControlPanelService } from './types';
import { ControlPanelDomAdapter } from './DomAdapter';
import { ChatToggleService } from './ChatToggleService';
import { StreamOrderService } from './StreamOrderService';
import { VolumeService } from '../volume/types';

/**
 * Control Panel Manager
 * 
 * Main entry point for Control Panel features. Implements the ControlPanelService interface.
 */
export class ControlPanelManager implements ControlPanelService {
    private domAdapter: ControlPanelDomAdapter;
    private chatToggleService: ChatToggleService;
    private streamOrderService: StreamOrderService;

    // Dependencies required for legacy operations
    private getStreamData: () => Record<number, any>;
    private autoSaveSettings: () => void;
    private getContainer: () => HTMLElement | null;

    constructor(
        getStreamData: () => Record<number, any>,
        autoSaveSettings: () => void,
        getContainer: () => HTMLElement | null
    ) {
        this.domAdapter = new ControlPanelDomAdapter();
        this.chatToggleService = new ChatToggleService(this.domAdapter);
        this.streamOrderService = new StreamOrderService(this.domAdapter);

        this.getStreamData = getStreamData;
        this.autoSaveSettings = autoSaveSettings;
        this.getContainer = getContainer;
    }

    setVolumeService(volumeService: VolumeService) {
        this.streamOrderService.setVolumeService(volumeService);
    }

    toggleControlPanel = (): void => {
        if (!this.domAdapter.hasControlPanel()) return;

        const isCollapsed = this.domAdapter.toggleControlPanelCollapsed();

        if (isCollapsed) {
            this.domAdapter.setToggleCollapsedBtnDisplay('block');
        } else {
            this.domAdapter.setToggleCollapsedBtnDisplay('none');
        }

        localStorage.setItem('controlPanelCollapsed', isCollapsed ? 'true' : 'false');
        this.autoSaveSettings();
    }

    updateStreamOrderList = (): void => {
        this.streamOrderService.updateStreamOrderList(
            this.getStreamData(),
            {
                onMoveUp: this.moveStreamUp,
                onMoveDown: this.moveStreamDown
            }
        );
        this.updateAllChatsButton();
    }

    moveStreamUp = (id: number): void => {
        const boxes = this.domAdapter.getAllStreamBoxes();
        const currentIndex = boxes.findIndex(b => parseInt(b.dataset.streamId || '0') === id);

        if (currentIndex > 0) {
            const currentBox = boxes[currentIndex];
            const prevBox = boxes[currentIndex - 1];
            const container = this.getContainer();

            if (container) {
                this.domAdapter.insertBefore(container, currentBox, prevBox);
                this.updateStreamOrderList();
                this.fixPlayerLayout(); // Trigger layout fix
            }
        }
    }

    moveStreamDown = (id: number): void => {
        const boxes = this.domAdapter.getAllStreamBoxes();
        const currentIndex = boxes.findIndex(b => parseInt(b.dataset.streamId || '0') === id);

        if (currentIndex < boxes.length - 1) {
            const currentBox = boxes[currentIndex];
            const nextBox = boxes[currentIndex + 1];
            const container = this.getContainer();

            if (container) {
                // To move down, insert 'nextBox' before 'currentBox' (swap)
                // Actually to swap current with next: insert next before current
                this.domAdapter.insertBefore(container, nextBox, currentBox);
                this.updateStreamOrderList();
                this.fixPlayerLayout();
            }
        }
    }

    reorderStreams = (draggedId: number, targetId: number): void => {
        const boxes = this.domAdapter.getAllStreamBoxes();
        const draggedBox = boxes.find(b => parseInt(b.dataset.streamId || '0') === draggedId);
        const targetBox = boxes.find(b => parseInt(b.dataset.streamId || '0') === targetId);
        const container = this.getContainer();

        if (draggedBox && targetBox && container) {
            this.domAdapter.insertBefore(container, draggedBox, targetBox);
            this.updateStreamOrderList();
            this.fixPlayerLayout();
        }
    }

    updateAllChatsButton = (): void => {
        this.chatToggleService.updateAllChatsButton();
    }

    toggleAllChats = (): void => {
        this.chatToggleService.toggleAllChats(this.getStreamData(), this.autoSaveSettings);
    }

    /**
     * Helper to fix player layout/iframe issues after DOM move
     */
    private fixPlayerLayout(): void {
        setTimeout(() => {
            // Legacy calls autoSelectLayout() and setLayout() here
            // and dispatches resize events
            // For PR B, implementing the resize dispatch is enough to satisfy 'safe' DOM manipulations
            window.dispatchEvent(new Event('resize'));
        }, 50);
    }
}
