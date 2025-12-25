
export type Platform = 'twitch' | 'youtube';

export interface ChatConfig {
    youtube: {
        maxRetries: number;
        baseBackoffMs: number;
        loadTimeoutMs: number;
    };
    twitch: {
        parents: string[];
    };
}

export interface ChatInstance {
    id: number;
    platform: Platform;
    channelId?: string; // Twitch
    videoId?: string;   // YouTube
    containerId: string;
    isSeparated: boolean;
    watchdog?: YouTubeWatchdogContract;
}

export interface DomAdapterContract {
    getContainer(id: number): HTMLElement | null;
    clearContainer(container: HTMLElement): void;
    createIframe(container: HTMLElement, url: string): HTMLIFrameElement;
    createPopoutWindow(id: number, contentHtml: string): Window | null; // Simulating popout or separate div
    // Legacy support for "Separate Chat" which creates a draggable div in current window
    createSeparatedDiv(id: number, contentHtml: string): HTMLElement;
    removeElement(id: string): void;
    showError(container: HTMLElement, message: string, showLink?: boolean): void;

    // UI State
    toggleVisibility(id: number, visible: boolean): void;
    setupResizer(id: number, callback: (width: number, height: number) => void): void;
}

export interface ChatUrlBuilderContract {
    buildTwitchUrl(channelId: string): string;
    buildYouTubeUrl(videoId: string): string;
    getTwitchParents(): string[];
    getParentDomain(): string;
}

export interface RecoveryStrategy {
    type: 'reload' | 'rebuild' | 'fallback';
    attempt: number;
}

export interface YouTubeWatchdogContract {
    start(iframe: HTMLIFrameElement, videoId: string, container: HTMLElement): void;
    stop(iframe?: HTMLIFrameElement): void;
    isHealthy(iframe: HTMLIFrameElement): boolean;
    // Observability
    onRecovering(callback: (strategy: RecoveryStrategy) => void): void;
    onGiveUp(callback: (reason: string) => void): void;
}

export interface ChatManagerContract {
    createChat(id: number, platform: string, channelId: string, videoId: string): void;
    toggleChat(id: number): void;
    separateChat(id: number): void;
    closeSeparatedChat(id: number): void;
    setupChatResizer(id: number): void;
}
