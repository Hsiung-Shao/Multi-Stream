
import { YouTubeWatchdogContract, RecoveryStrategy, DomAdapterContract } from './types';

export class YouTubeChatWatchdog implements YouTubeWatchdogContract {
    private domAdapter: DomAdapterContract;
    private maxRetries: number = 3;
    private baseBackoffMs: number = 2000;
    private loadTimeoutMs: number = 10000;

    private activeMonitors = new Map<string, {
        timer: any;
        retryCount: number;
        videoId: string;
        iframe: HTMLIFrameElement;
        container: HTMLElement;
        loadTimer?: any;
    }>();

    private recoverCallbacks: ((strategy: RecoveryStrategy) => void)[] = [];
    private giveUpCallbacks: ((reason: string) => void)[] = [];

    constructor(domAdapter: DomAdapterContract) {
        this.domAdapter = domAdapter;
    }

    onRecovering(callback: (strategy: RecoveryStrategy) => void): void {
        this.recoverCallbacks.push(callback);
    }

    onGiveUp(callback: (reason: string) => void): void {
        this.giveUpCallbacks.push(callback);
    }

    start(iframe: HTMLIFrameElement, videoId: string, container: HTMLElement): void {
        const key = this.getKey(iframe);

        // Prevent multiple monitors
        if (this.activeMonitors.has(key)) {
            console.warn(`[Watchdog] Already monitoring ${key}`);
            return;
        }

        const monitorState = {
            timer: null,
            retryCount: 0,
            videoId,
            iframe,
            container,
            loadTimer: null
        };

        this.activeMonitors.set(key, monitorState);
        this.startLoadCheck(monitorState);
    }

    stop(iframe?: HTMLIFrameElement): void {
        if (!iframe) {
            // Stop all - usually used at destroy
            this.activeMonitors.forEach(state => this.cleanupState(state));
            this.activeMonitors.clear();
        } else {
            const key = this.getKey(iframe);
            const state = this.activeMonitors.get(key);
            if (state) {
                this.cleanupState(state);
                this.activeMonitors.delete(key);
            }
        }
    }

    isHealthy(iframe: HTMLIFrameElement): boolean {
        // Implementation dependent.
        // For cross-origin iframe, we can't check content.
        // We rely on load events and existence.
        // If element is removed from DOM, it's unhealthy.
        if (!iframe.isConnected) return false;

        return true;
    }

    private getKey(iframe: HTMLIFrameElement): string {
        // Unique key for map, preferably ID or reference-based string if possible
        return iframe.id || `iframe-${Math.random().toString(36).substr(2, 9)}`;
    }

    private cleanupState(state: any) {
        if (state.timer) clearTimeout(state.timer);
        if (state.loadTimer) clearTimeout(state.loadTimer);
        // Remove event listeners if we added any
        state.iframe.onload = null;
        state.iframe.onerror = null;
    }

    private startLoadCheck(state: any) {
        // Setup load timeout
        state.loadTimer = setTimeout(() => {
            console.log('[Watchdog] Load timeout', state.iframe.id);
            this.handleFailure(state);
        }, this.loadTimeoutMs);

        state.iframe.onload = () => {
            // Success!
            if (state.loadTimer) clearTimeout(state.loadTimer);
            state.retryCount = 0; // Reset retries on success
            // console.log('[Watchdog] Load success', state.iframe.id);
        };

        state.iframe.onerror = () => {
            if (state.loadTimer) clearTimeout(state.loadTimer);
            console.log('[Watchdog] Error event', state.iframe.id);
            this.handleFailure(state);
        };
    }

    private handleFailure(state: any) {
        if (state.retryCount >= this.maxRetries) {
            this.giveUp(state, 'Max retries exceeded');
            return;
        }

        state.retryCount++;

        // Calculate Strategy
        let strategy: RecoveryStrategy['type'] = 'reload';
        if (state.retryCount === 1) strategy = 'reload'; // Level 1
        else if (state.retryCount > 1) strategy = 'rebuild'; // Level 2

        // Backoff
        const delay = this.baseBackoffMs * Math.pow(2, state.retryCount - 1);

        const strategyInfo = { type: strategy, attempt: state.retryCount };
        this.notifyRecovering(strategyInfo);

        // Schedule Recovery
        state.timer = setTimeout(() => {
            this.executeRecovery(state, strategy);
        }, delay);
    }

    private executeRecovery(state: any, strategy: RecoveryStrategy['type']) {
        if (!state.container.isConnected) {
            // Container gone, stop monitoring
            this.stop(state.iframe);
            return;
        }

        if (strategy === 'reload') {
            // Level 1: Query Bust
            let src = state.iframe.src;
            const url = new URL(src);
            url.searchParams.set('t_bust', Date.now().toString());
            state.iframe.src = url.toString();

            // Restart check
            this.startLoadCheck(state);

        } else if (strategy === 'rebuild') {
            // Level 2: Rebuild
            const oldSrc = state.iframe.src;
            // Remove old
            state.iframe.remove();

            // Create new
            const newIframe = this.domAdapter.createIframe(state.container, oldSrc);
            newIframe.id = state.iframe.id; // Maintain ID

            // Update state reference
            state.iframe = newIframe;

            // Update key mapping if necessary (if key depended on ref, we'd be in trouble, but if ID based ok)
            // Here key is from getKey(iframe). If getKey uses object ref, we need to re-key?
            // Simpler: Just rely on the state object being updated.

            // Restart check
            this.startLoadCheck(state);
        }
    }

    private giveUp(state: any, reason: string) {
        this.cleanupState(state);
        this.activeMonitors.delete(this.getKey(state.iframe));

        this.notifyGiveUp(reason);

        // Show fallback UI
        // Level 3
        this.domAdapter.showError(state.container, '無法載入聊天室', true);
    }

    private notifyRecovering(strategy: RecoveryStrategy) {
        this.recoverCallbacks.forEach(cb => cb(strategy));
    }

    private notifyGiveUp(reason: string) {
        this.giveUpCallbacks.forEach(cb => cb(reason));
    }
}
