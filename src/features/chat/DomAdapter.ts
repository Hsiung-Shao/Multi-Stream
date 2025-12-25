
import { DomAdapterContract } from './types';

export class DomAdapter implements DomAdapterContract {
    getContainer(id: number): HTMLElement | null {
        if (typeof document === 'undefined') return null;
        return document.getElementById(`chat${id}`);
    }

    clearContainer(container: HTMLElement): void {
        container.innerHTML = '';
        // Remove any existing error classes or states if needed
        container.classList.remove('chat-error');
    }

    createIframe(container: HTMLElement, url: string): HTMLIFrameElement {
        if (typeof document === 'undefined') {
            throw new Error('Document is undefined');
        }
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.frameBorder = '0';
        iframe.allow = 'autoplay; fullscreen';
        iframe.setAttribute('allowfullscreen', '');
        container.appendChild(iframe);
        return iframe;
    }

    createPopoutWindow(id: number, contentHtml: string): Window | null {
        // This functionality is browser-specific and might be blocked.
        // For the legacy alignment, we simulate or use the same logic as separateChat
        // if it opens a *new window*.
        // Legacy `separateChat` actually creates a draggable DIV in the same window (overlay).
        // So this method might be unused if we strict align to legacy `separateChat`.
        // Leaving it here for contract compliance but implementing `createSeparatedDiv` instead.
        return null;
    }

    createSeparatedDiv(id: number, contentHtml: string): HTMLElement {
        // Replicates legacy logic: create a draggable div in document.body
        if (typeof document === 'undefined') throw new Error('No document');

        const separatedChat = document.createElement('div');
        separatedChat.className = 'separated-chat';
        separatedChat.id = 'separated-chat-' + id;
        separatedChat.style.width = '400px';
        separatedChat.style.height = '600px';
        separatedChat.style.left = (window.innerWidth - 400) / 2 + 'px';
        separatedChat.style.top = (window.innerHeight - 600) / 2 + 'px';

        // Use innerHTML safely for now as per legacy behavior
        separatedChat.innerHTML = contentHtml;

        document.body.appendChild(separatedChat);
        return separatedChat;
    }

    removeElement(id: string): void {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    showError(container: HTMLElement, message: string, showLink: boolean = false): void {
        container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'padding: 20px; text-align: center; color: #aaa; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center;';

        const text = document.createElement('div');
        text.innerText = message;
        wrapper.appendChild(text);

        if (showLink) {
            const link = document.createElement('a');
            link.href = '#';
            // In a real fallback, this would be a valid link. 
            // For strict no-UI-component creation, this simple DOM is fine.
            link.innerText = '在新視窗開啟';
            link.target = '_blank';
            link.style.marginTop = '10px';
            link.style.color = '#9147ff';
            wrapper.appendChild(link);
        }

        container.appendChild(wrapper);
    }

    toggleVisibility(id: number, visible: boolean): void {
        const container = this.getContainer(id);
        // Also handle legacy resizer
        const resizer = document.getElementById('chat-resizer' + id);

        if (container) {
            if (visible) container.classList.remove('hidden');
            else container.classList.add('hidden');
        }
        if (resizer) {
            resizer.style.display = visible ? '' : 'none';
        }
    }

    setupResizer(id: number, callback: (width: number, height: number) => void): void {
        // Implementation would attach event listeners to #chat-resizer-id
        // For PR B (Implementation), we just provide the method. 
        // Real logic usually involves mousedown/mousemove globally.
    }
}
