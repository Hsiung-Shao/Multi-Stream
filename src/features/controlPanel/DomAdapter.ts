/**
 * DOM Adapter for Control Panel
 * 
 * Encapsulates all direct DOM access and manipulation for the Control Panel.
 * This ensures that the services rely on an abstraction rather than direct global document access.
 */

// Define interfaces for dependencies we need to access globally for now
// In a full React migration, these would be props or context
interface ExtendedWindow extends Window {
    i18n?: { t: (key: string) => string };
}

declare const window: ExtendedWindow;

export class ControlPanelDomAdapter {
    /**
     * Helper to safely get an element by ID
     */
    private getElement(id: string): HTMLElement | null {
        return document.getElementById(id);
    }

    /**
     * Checks if the control panel element exists
     */
    hasControlPanel(): boolean {
        return !!this.getElement('control-panel');
    }

    /**
     * Toggles the 'collapsed' class on the control panel
     * @returns The new collapsed state (true if collapsed)
     */
    toggleControlPanelCollapsed(): boolean {
        const panel = this.getElement('control-panel');
        if (!panel) return false;
        return panel.classList.toggle('collapsed');
    }

    /**
     * Sets the visibility of the collapsed toggle button
     */
    setToggleCollapsedBtnDisplay(display: string): void {
        const btn = this.getElement('control-panel-toggle-collapsed');
        if (btn) {
            btn.style.display = display;
        }
    }

    /**
     * Gets the current collapsed state from DOM
     */
    isControlPanelCollapsed(): boolean {
        const panel = this.getElement('control-panel');
        return panel ? panel.classList.contains('collapsed') : false;
    }

    /**
     * Gets the stream order list container
     */
    getStreamOrderList(): HTMLElement | null {
        return this.getElement('stream-order-list');
    }

    /**
     * Clears the content of the stream order list
     */
    clearStreamOrderList(): void {
        const list = this.getStreamOrderList();
        if (list) {
            list.innerHTML = '';
        }
    }

    /**
     * Appends an element to the stream order list
     */
    appendToStreamOrderList(element: HTMLElement): void {
        const list = this.getStreamOrderList();
        if (list) {
            list.appendChild(element);
        }
    }

    /**
     * Create a DOM element
     */
    createElement<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K] {
        return document.createElement(tagName);
    }

    /**
     * Get all stream boxes from DOM
     */
    getAllStreamBoxes(): HTMLElement[] {
        return Array.from(document.querySelectorAll('.stream-box'));
    }

    /**
     * Get chat container for a specific stream
     */
    getChatContainer(streamId: number): HTMLElement | null {
        return this.getElement(`chat${streamId}`);
    }

    /**
     * Get chat resizer for a specific stream
     */
    getChatResizer(streamId: number): HTMLElement | null {
        return this.getElement(`chat-resizer${streamId}`);
    }

    /**
     * Set chat visibility (adds/removes 'hidden' class)
     */
    setChatVisibility(streamId: number, visible: boolean): void {
        const chat = this.getChatContainer(streamId);
        const resizer = this.getChatResizer(streamId);

        if (chat) {
            if (visible) {
                chat.classList.remove('hidden');
            } else {
                chat.classList.add('hidden');
            }
        }

        if (resizer) {
            resizer.style.display = visible ? '' : 'none';
        }
    }

    /**
     * Update "Toggle All Chats" button text
     */
    updateToggleAllChatsButtonText(text: string): void {
        const btn = this.getElement('toggle-all-chats-btn');
        if (btn) {
            btn.textContent = text;
        }
    }

    /**
     * Get localized string
     */
    translate(key: string): string {
        return window.i18n?.t(key) || key;
    }

    /**
     * Insert element before reference element (for reordering)
     */
    insertBefore(parentElement: HTMLElement, newElement: HTMLElement, referenceElement: HTMLElement): void {
        parentElement.insertBefore(newElement, referenceElement);
    }
}
