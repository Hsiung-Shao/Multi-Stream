export type StreamPlatform = 'twitch' | 'youtube';

/**
 * 代表一個單一的串流實體
 * 對應 legacy 當中 window.streamData[id] 的結構
 */
export interface StreamItem {
    /** 唯一識別碼 (對應 legacy window.streamCount) */
    id: number;

    /** 平台類型 */
    platform: StreamPlatform;

    /** 
     * 核心識別資訊
     * Twitch: channelId (login name)
     * YouTube: videoId
     */
    identifier: string;

    /** 輔助識別 (YouTube 頻道 ID，非必須) */
    channelId?: string;

    /** 原始輸入網址 */
    originalUrl: string;

    /** 音量 (0-100) */
    volume: number;

    /** 靜音狀態 (Legacy 使用 volume=0 或個別 muted flag，此處標準化) */
    muted: boolean;

    /** 聊天室是否顯示 */
    chatVisible: boolean;

    /** 自訂名稱 (顯示在 Header) */
    title?: string;

    /** 建立時間 (Timestamp) */
    createdAt: number;
}

/**
 * 定義 Legacy window.players 的結構
 * 用於與舊版播放器控制碼互動
 */
export interface PlayerAdapterContract {
    /** 播放器類型 */
    type: StreamPlatform;

    /** 原始 Player 實體 (Twitch.Player 或 YT.Player) */
    player: any;

    /** 銷毀播放器 */
    destroy(): void;

    /** 設定音量 */
    setVolume(volume: number): void;

    /** 靜音 */
    setMuted(muted: boolean): void;

    /** 暫停 */
    pause(): void;

    /** 播放 */
    play(): void;
}

/**
 * 定義 Stream Manager 的行為契約
 * 這是 React 與 Legacy 系統互動的標準介面
 */
export interface StreamManagerContract {
    /**
     * 新增串流
     * @param url Twitch/YouTube URL 或 Channel Name
     */
    addStream(url: string): Promise<void>;

    /**
     * 移除特定串流
     * @param id Stream ID
     */
    removeStream(id: number): void;

    /**
     * 重整串流 (只重載 Player，保留 Layout)
     * @param id Stream ID
     */
    reloadStream(id: number): void;

    /**
     * 清空所有串流
     */
    clearAll(): void;

    /**
     * 獲取當前所有串流
     */
    getStreams(): StreamItem[];

    /**
     * 獲取特定串流
     */
    getStream(id: number): StreamItem | undefined;
}

/**
 * 定義掛載在 window 上的 Legacy API 介面
 * 用於型別檢查 global.d.ts
 */
export interface LegacyWindowStreamApi {
    streamCount: number;
    players: Record<number, { type: string; player: any }>;
    streamData: Record<number, any>; // Legacy raw data object

    // Core Functions
    addStream(url?: string | null): Promise<void>;
    removeBox(id: number): void;
    reloadStream(id: number): void;
    clearAll(): void;

    // Layout
    saveLayout(): void;
    loadLayout(): void;

    // Fallback storage for original function when hooking
    _legacyAddStream?: (url?: string | null) => Promise<void>;
}
