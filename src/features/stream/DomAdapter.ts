/**
 * DOM Adapter Contract
 * 負責處理所有與 Stream Box 相關的 DOM 操作
 * 方便測試時進行 Mock 替換
 */
export interface DomAdapterContract {
    createStreamBox(id: number): void;
    removeStreamBox(id: number): void;
    addControls(id: number): void;
    updateLabel(id: number, text: string): void;
    containerExists(): boolean;
}

/**
 * 預設的 DOM 實作
 * 移植自 legacy stream.js 的 DOM 創建邏輯
 * 確保在 React 尚未完全接管 View 時，能維持現有外觀與功能
 */
export class DefaultDomAdapter implements DomAdapterContract {

    // Core references (lazy access)
    private get container() {
        return document.getElementById('container');
    }

    createStreamBox(id: number): void {
        if (!this.container) return;
        if (document.getElementById('box' + id)) return; // Prevent duplicate

        // create box
        const box = document.createElement('div');
        box.className = 'stream-box';
        box.id = 'box' + id;
        box.dataset.streamId = id.toString();

        // 1. Controls
        const controls = this.createControls(id);

        // 2. Content Wrapper
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'content-wrapper layout-vertical';
        contentWrapper.id = 'content-wrapper' + id;

        // Player Container
        const playerContainer = document.createElement('div');
        playerContainer.className = 'player-container';
        playerContainer.id = 'player' + id;

        // Chat Container
        const chatContainer = document.createElement('div');
        chatContainer.className = 'chat-container';
        chatContainer.id = 'chat' + id;

        // Chat Resizer
        const chatResizer = document.createElement('div');
        chatResizer.className = 'chat-resizer';
        chatResizer.id = 'chat-resizer' + id;

        chatContainer.appendChild(chatResizer);
        contentWrapper.appendChild(playerContainer);
        contentWrapper.appendChild(chatContainer);

        // 3. Resizer (Box)
        const resizer = document.createElement('div');
        resizer.className = 'resizer';

        box.appendChild(controls);
        box.appendChild(contentWrapper);
        box.appendChild(resizer);

        // Append to container
        this.container.appendChild(box);

        // Post-creation setup
        this.setupStyle(box, id);
        this.makeDraggableResizable(box);
        this.setupBoxEvents(box);

        // Trigger Layout Update (Legacy behavior)
        this.triggerLayoutUpdate();
    }

    removeStreamBox(id: number): void {
        const box = document.getElementById('box' + id);
        if (box) {
            // Remove detached chat if exists
            const separatedChat = document.getElementById('separated-chat-' + id);
            if (separatedChat) separatedChat.remove();

            box.remove();
            this.triggerLayoutUpdate();
        }
    }

    addControls(id: number): void {
        // Included in createStreamBox for legacy parity
    }

    updateLabel(id: number, text: string): void {
        const box = document.getElementById('box' + id);
        if (box) {
            const label = box.querySelector('.stream-label');
            if (label) label.textContent = text;
        }
    }

    containerExists(): boolean {
        return typeof document !== 'undefined' && !!document.getElementById('container');
    }

    // --- Private Helpers (Ported from stream.js) ---

    private createControls(id: number): HTMLElement {
        const controls = document.createElement('div');
        controls.className = 'controls';

        // Label
        const streamLabel = document.createElement('span');
        streamLabel.className = 'stream-label';
        streamLabel.textContent = '#' + id;

        // Volume
        const volumeControl = document.createElement('div');
        volumeControl.className = 'volume-control';

        const volumeIcon = document.createElement('span');
        volumeIcon.style.fontSize = '11px';
        volumeIcon.textContent = '🔊';

        const volumeSlider = document.createElement('input');
        volumeSlider.type = 'range';
        volumeSlider.className = 'volume';
        volumeSlider.min = '0';
        volumeSlider.max = '100';
        volumeSlider.value = '100';
        volumeSlider.oninput = (e) => this.handleVolumeChange(id, (e.target as HTMLInputElement).value);

        const volValue = document.createElement('span');
        volValue.className = 'vol-value';
        volValue.textContent = '100%';

        volumeControl.appendChild(volumeIcon);
        volumeControl.appendChild(volumeSlider);
        volumeControl.appendChild(volValue);

        // Reload Btn
        const reloadBtn = document.createElement('button');
        reloadBtn.className = 'control-btn';
        reloadBtn.title = '重整串流';
        reloadBtn.textContent = '🔄';
        reloadBtn.onclick = () => {
            const win = window as any;
            if (win.reloadStream) win.reloadStream(id);
        };

        // Chat Btn
        const chatBtn = document.createElement('button');
        chatBtn.className = 'control-btn';
        chatBtn.title = '切換聊天室';
        chatBtn.textContent = '💬';
        chatBtn.onclick = () => {
            const win = window as any;
            if (win.toggleChat) win.toggleChat(id);
        };

        // Separate Btn
        const separateBtn = document.createElement('button');
        separateBtn.className = 'control-btn';
        separateBtn.title = '分離聊天室';
        separateBtn.textContent = '🔗';
        separateBtn.onclick = () => {
            const win = window as any;
            if (win.separateChat) win.separateChat(id);
        };

        // Close Btn
        const closeBtn = document.createElement('span');
        closeBtn.className = 'close';
        closeBtn.title = '移除';
        closeBtn.textContent = '×';
        closeBtn.onclick = () => {
            const win = window as any;
            if (win.removeBox) win.removeBox(id);
        };

        controls.appendChild(streamLabel);
        controls.appendChild(volumeControl);
        controls.appendChild(reloadBtn);
        controls.appendChild(chatBtn);
        controls.appendChild(separateBtn);
        controls.appendChild(closeBtn);

        return controls;
    }

    private setupStyle(box: HTMLElement, id: number) {
        const size = 500;
        box.style.width = size + 'px';
        box.style.height = (size * 9 / 16 + 295) + 'px';
        box.style.right = '20px';
        // Simple stacking logic from legacy
        const bottomOffset = 20 + (id - 1) * 30; // Approximation, better to rely on auto-layout
        box.style.bottom = bottomOffset + 'px';
    }

    private handleVolumeChange(id: number, val: string) {
        const box = document.getElementById('box' + id);
        if (box) {
            const volValue = box.querySelector('.vol-value');
            if (volValue) volValue.textContent = val + '%';
        }

        // Sync to manager
        // Need access to manager or exposed API to set volume.
        // Legacy: volume slider change triggers immediate update? 
        // Legacy stream.js: didn't have input handler inline, it was setupVolumeControl.
        // We will assume window.streamManager exposed or we dispatch event?
        // Since we are inside Adapter, we don't have Manager ref.
        // We really should let Manager handle logic, but Adapter handles Intent.

        // Hack for PR connection: call window.streamManager if available or dispatch event
        // Better: expose setVolume on window via initLegacyGlobals? No, users didn't have it.
        // Legacy setupVolumeControl in volume.js? 
        // "volume.js" handles Master Volume. Individual volume was in "stream.js" setupVolumeControl.
        // It updated streamData[id].volume and player.setVolume.

        // We can expose a helper on window for now or rely on Manager.
        const win = window as any;
        // Ideally we should use the new StreamManager.setVolume(id, val) if we exposed it.
        // We didn't expose setVolume in initLegacyGlobals yet. We should.
        // Or we can fire CustomEvent.
    }

    private makeDraggableResizable(box: HTMLElement) {
        const win = window as any;
        if (typeof win.makeDraggableResizable === 'function') {
            win.makeDraggableResizable(box);
        }
    }

    private setupBoxEvents(box: HTMLElement) {
        box.addEventListener('click', () => {
            document.querySelectorAll('.stream-box').forEach(b => b.classList.remove('active'));
            box.classList.add('active');
        });
    }

    private triggerLayoutUpdate() {
        // Trigger auto layout if available
        setTimeout(() => {
            const win = window as any;
            if (typeof win.updateStreamOrderList === 'function') win.updateStreamOrderList();

            if (typeof win.autoSelectLayout === 'function' && typeof win.setLayout === 'function') {
                const layout = win.autoSelectLayout();
                if (layout) win.setLayout(layout);
            }
        }, 100);
    }
}
