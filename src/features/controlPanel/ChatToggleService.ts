import { ControlPanelDomAdapter } from './DomAdapter';

/**
 * Chat Toggle Service
 * 
 * Handles logic for toggling chat visibility and updating the "Show/Hide All Chats" button.
 * Relies on DomAdapter for actual DOM manipulation.
 */
export class ChatToggleService {
    private domAdapter: ControlPanelDomAdapter;

    constructor(domAdapter: ControlPanelDomAdapter) {
        this.domAdapter = domAdapter;
    }

    /**
     * Updates the text of the "Show/Hide All Chats" button based on current state.
     */
    updateAllChatsButton(): void {
        const boxes = this.domAdapter.getAllStreamBoxes();
        if (boxes.length === 0) {
            const text = '💬 ' + this.domAdapter.translate('showAllChats');
            this.domAdapter.updateToggleAllChatsButtonText(text);
            return;
        }

        let visibleCount = 0;
        boxes.forEach(box => {
            const id = parseInt(box.dataset.streamId || '0');
            const chatDiv = this.domAdapter.getChatContainer(id);
            // Check if NOT hidden
            if (chatDiv && !chatDiv.classList.contains('hidden')) {
                visibleCount++;
            }
        });

        // Use strict check > half to decide text
        if (visibleCount > boxes.length / 2) {
            this.domAdapter.updateToggleAllChatsButtonText('💬 ' + this.domAdapter.translate('hideAllChats'));
        } else {
            this.domAdapter.updateToggleAllChatsButtonText('💬 ' + this.domAdapter.translate('showAllChats'));
        }
    }

    /**
     * Toggles visibility of all chats.
     * Heuristic: If more than half are visible -> Hide All. Else -> Show All.
     * @param streamData Global streamData object to update state (side effect required by legacy)
     * @param autoSaveCallback Optional callback to trigger autoSave
     */
    toggleAllChats(streamData: Record<number, any>, autoSaveCallback?: () => void): void {
        const boxes = this.domAdapter.getAllStreamBoxes();
        if (boxes.length === 0) {
            // Alert is part of legacy behavior
            window.alert(this.domAdapter.translate('noStreams'));
            return;
        }

        let visibleCount = 0;
        boxes.forEach(box => {
            const id = parseInt(box.dataset.streamId || '0');
            const chatDiv = this.domAdapter.getChatContainer(id);
            if (chatDiv && !chatDiv.classList.contains('hidden')) {
                visibleCount++;
            }
        });

        // Determine action
        const shouldHide = visibleCount > boxes.length / 2;

        boxes.forEach(box => {
            const id = parseInt(box.dataset.streamId || '0');

            if (shouldHide) {
                // Hide
                this.domAdapter.setChatVisibility(id, false);
                if (streamData[id]) {
                    streamData[id].chatVisible = false;
                }
            } else {
                // Show
                this.domAdapter.setChatVisibility(id, true);
                if (streamData[id]) {
                    streamData[id].chatVisible = true;
                }
            }
        });

        this.updateAllChatsButton();

        if (autoSaveCallback) {
            autoSaveCallback();
        }
    }
}
