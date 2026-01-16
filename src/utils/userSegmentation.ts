/**
 * 使用者分群系統
 * 
 * 提供多維度的使用者分群功能，用於 GA4 追蹤和使用者行為分析。
 * 
 * 維度：
 * 1. visitor_type - 新使用者 / 回訪使用者
 * 2. visit_frequency - 訪問頻率 (first_time / occasional / regular / power_user)
 * 3. feature_depth - 功能使用深度 (viewer / basic_user / advanced_user / expert)
 * 4. session_length - 工作階段長度 (quick_visit / short_session / medium_session / long_session)
 */

import { setUserProperties, logEvent } from './analytics';

// ===== 類型定義 =====

export type VisitorType = 'new' | 'returning';

export type VisitFrequency =
    | 'first_time'    // 首次訪問
    | 'occasional'    // 偶爾訪問 (7 天內 1-2 次)
    | 'regular'       // 定期訪問 (7 天內 3-6 次)
    | 'power_user';   // 重度使用者 (7 天內 7 次以上)

export type FeatureDepth =
    | 'viewer'        // 僅瀏覽
    | 'basic_user'    // 使用過布局切換
    | 'advanced_user' // 使用過自訂布局或收藏功能
    | 'expert';       // 使用過多項進階功能

export type SessionLength =
    | 'quick_visit'    // < 1 分鐘
    | 'short_session'  // 1-5 分鐘
    | 'medium_session' // 5-15 分鐘
    | 'long_session';  // > 15 分鐘

export interface UserSegment {
    visitor_type: VisitorType;
    visit_frequency: VisitFrequency;
    feature_depth: FeatureDepth;
    session_length: SessionLength;
}

// ===== 常數定義 =====

const STORAGE_KEYS = {
    VISIT_HISTORY: 'ms_visit_history',        // 訪問歷史記錄
    FEATURE_USAGE: 'ms_feature_usage',        // 功能使用記錄
    CURRENT_SEGMENT: 'ms_user_segment',       // 當前使用者分群
    SESSION_START: 'ms_session_start',        // 工作階段開始時間
} as const;

// 功能使用標記
export const FEATURE_FLAGS = {
    LAYOUT_SWITCH: 'layout_switch',           // 布局切換
    CUSTOM_LAYOUT: 'custom_layout',           // 自訂布局
    FAVORITES: 'favorites',                   // 收藏功能
    HOTKEYS: 'hotkeys',                       // 快捷鍵使用
    MULTI_STREAM: 'multi_stream',             // 多串流同時播放 (2+)
    THEATER_MODE: 'theater_mode',             // 劇院模式
    VOLUME_CONTROL: 'volume_control',         // 音量控制
} as const;

type FeatureFlag = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS];

// ===== 工具函式 =====

const safeGetItem = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

const safeSetItem = (key: string, value: string): boolean => {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
};

// ===== 使用者分群管理器 =====

export class UserSegmentationManager {
    private sessionStartTime: number;
    private isInitialized: boolean = false;

    constructor() {
        this.sessionStartTime = Date.now();
    }

    /**
     * 初始化分群管理器
     */
    public init(): UserSegment {
        if (this.isInitialized) {
            return this.getCurrentSegment();
        }

        // 記錄本次訪問
        this.recordVisit();

        // 記錄工作階段開始時間
        safeSetItem(STORAGE_KEYS.SESSION_START, this.sessionStartTime.toString());

        this.isInitialized = true;

        // 計算並返回當前分群
        return this.updateSegment();
    }

    /**
     * 取得當前使用者分群
     */
    public getCurrentSegment(): UserSegment {
        const stored = safeGetItem(STORAGE_KEYS.CURRENT_SEGMENT);
        if (stored) {
            try {
                return JSON.parse(stored) as UserSegment;
            } catch {
                // 解析失敗，重新計算
            }
        }

        return this.calculateSegment();
    }

    /**
     * 計算使用者分群
     */
    private calculateSegment(): UserSegment {
        return {
            visitor_type: this.calculateVisitorType(),
            visit_frequency: this.calculateVisitFrequency(),
            feature_depth: this.calculateFeatureDepth(),
            session_length: this.calculateSessionLength(),
        };
    }

    /**
     * 更新使用者分群並發送到 GA4
     */
    public updateSegment(): UserSegment {
        const segment = this.calculateSegment();

        // 儲存到 localStorage
        safeSetItem(STORAGE_KEYS.CURRENT_SEGMENT, JSON.stringify(segment));

        // 發送到 GA4 (設定 User Properties)
        setUserProperties({
            user_properties: {
                visitor_type: segment.visitor_type,
                visit_frequency: segment.visit_frequency,
                feature_depth: segment.feature_depth,
                session_length: segment.session_length,
            }
        });

        return segment;
    }

    /**
     * 記錄功能使用
     */
    public recordFeatureUsage(feature: FeatureFlag): void {
        const usage = this.getFeatureUsage();
        if (!usage.includes(feature)) {
            usage.push(feature);
            safeSetItem(STORAGE_KEYS.FEATURE_USAGE, JSON.stringify(usage));

            // 發送 GA4 事件
            logEvent('UserSegment', 'feature_used', feature);

            // 重新計算分群
            this.updateSegment();
        }
    }

    /**
     * 更新工作階段長度分群
     * 應在 heartbeat 事件中呼叫
     */
    public updateSessionLength(): void {
        const oldSegment = this.getCurrentSegment();
        const newSessionLength = this.calculateSessionLength();

        if (oldSegment.session_length !== newSessionLength) {
            // 分群有變化，發送更新事件
            logEvent('UserSegment', 'segment_update', `session_length: ${newSessionLength}`);
            this.updateSegment();
        }
    }

    // ===== 私有方法：計算各維度 =====

    /**
     * 計算訪問者類型
     */
    private calculateVisitorType(): VisitorType {
        const history = this.getVisitHistory();
        return history.length <= 1 ? 'new' : 'returning';
    }

    /**
     * 計算訪問頻率
     */
    private calculateVisitFrequency(): VisitFrequency {
        const history = this.getVisitHistory();
        const now = Date.now();
        const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

        // 計算過去 7 天的訪問次數
        const recentVisits = history.filter(timestamp => timestamp > sevenDaysAgo);
        const visitCount = recentVisits.length;

        if (visitCount <= 1) return 'first_time';
        if (visitCount <= 2) return 'occasional';
        if (visitCount <= 6) return 'regular';
        return 'power_user';
    }

    /**
     * 計算功能使用深度
     */
    private calculateFeatureDepth(): FeatureDepth {
        const usage = this.getFeatureUsage();

        // 進階功能列表
        const advancedFeatures = [
            FEATURE_FLAGS.CUSTOM_LAYOUT,
            FEATURE_FLAGS.FAVORITES,
        ];

        // 專家功能列表
        const expertFeatures = [
            FEATURE_FLAGS.HOTKEYS,
            FEATURE_FLAGS.THEATER_MODE,
            FEATURE_FLAGS.MULTI_STREAM,
        ];

        const hasAdvanced = advancedFeatures.some(f => usage.includes(f));
        const expertCount = expertFeatures.filter(f => usage.includes(f)).length;

        if (hasAdvanced && expertCount >= 2) return 'expert';
        if (hasAdvanced) return 'advanced_user';
        if (usage.includes(FEATURE_FLAGS.LAYOUT_SWITCH)) return 'basic_user';
        return 'viewer';
    }

    /**
     * 計算工作階段長度
     */
    private calculateSessionLength(): SessionLength {
        const sessionStart = parseInt(safeGetItem(STORAGE_KEYS.SESSION_START) || '0', 10);
        const now = Date.now();
        const durationMinutes = (now - sessionStart) / (1000 * 60);

        if (durationMinutes < 1) return 'quick_visit';
        if (durationMinutes < 5) return 'short_session';
        if (durationMinutes < 15) return 'medium_session';
        return 'long_session';
    }

    // ===== 私有方法：資料存取 =====

    /**
     * 取得訪問歷史記錄
     */
    private getVisitHistory(): number[] {
        const stored = safeGetItem(STORAGE_KEYS.VISIT_HISTORY);
        if (stored) {
            try {
                return JSON.parse(stored) as number[];
            } catch {
                return [];
            }
        }
        return [];
    }

    /**
     * 記錄本次訪問
     */
    private recordVisit(): void {
        const history = this.getVisitHistory();
        history.push(Date.now());

        // 只保留過去 30 天的記錄
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const filtered = history.filter(timestamp => timestamp > thirtyDaysAgo);

        safeSetItem(STORAGE_KEYS.VISIT_HISTORY, JSON.stringify(filtered));
    }

    /**
     * 取得功能使用記錄
     */
    private getFeatureUsage(): FeatureFlag[] {
        const stored = safeGetItem(STORAGE_KEYS.FEATURE_USAGE);
        if (stored) {
            try {
                return JSON.parse(stored) as FeatureFlag[];
            } catch {
                return [];
            }
        }
        return [];
    }
}

// ===== 單例實例 =====

export const userSegmentationManager = new UserSegmentationManager();
