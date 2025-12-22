/**
 * Control Panel Service Interface
 * 
 * Defines the contract for the Control Panel functionality, mapping to the legacy
 * implementation in `js/control-panel.js`.
 */
export interface ControlPanelService {
    /**
     * Toggles the visibility of the control panel (collapsed state).
     * Maps to legacy `toggleControlPanel()`.
     * Dependencies: #control-panel, #control-panel-toggle-collapsed
     * Side Effects: DOM class manipulation, LocalStorage write, autoSaveSettings trigger.
     */
    toggleControlPanel: () => void;

    /**
     * Re-renders the stream order list in the control panel.
     * Maps to legacy `updateStreamOrderList()`.
     * Dependencies: #stream-order-list, .stream-box, window.i18n, window.favoriteStreams
     * Side Effects: Clears and rebuilds #stream-order-list DOM.
     */
    updateStreamOrderList: () => void;

    /**
     * Moves a stream up in the display order.
     * Maps to legacy `moveStreamUp(id)`.
     * @param id The stream ID to move.
     */
    moveStreamUp: (id: number) => void;

    /**
     * Moves a stream down in the display order.
     * Maps to legacy `moveStreamDown(id)`.
     * @param id The stream ID to move.
     */
    moveStreamDown: (id: number) => void;

    /**
     * Reorders streams explicitly (used for drag and drop).
     * Maps to legacy `reorderStreams(draggedId, targetId)`.
     * @param draggedId The ID of the stream being dragged.
     * @param targetId The ID of the target stream position.
     */
    reorderStreams: (draggedId: number, targetId: number) => void;

    /**
     * Updates the text/icon of the "Show/Hide All Chats" button.
     * Maps to legacy `updateAllChatsButton()`.
     * Dependencies: #toggle-all-chats-btn, .stream-box, #chat{id}
     */
    updateAllChatsButton: () => void;

    /**
     * Toggles the visibility of all chat windows.
     * Maps to legacy `toggleAllChats()`.
     * Dependencies: .stream-box, #chat{id}, #chat-resizer{id}
     * Side Effects: Updates streamData[id].chatVisible, toggles .hidden class, autoSaveSettings trigger.
     */
    toggleAllChats: () => void;
}
