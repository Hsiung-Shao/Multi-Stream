import ReactGA from 'react-ga4';
import { identityManager } from '../features/analytics/IdentityManager';

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

/**
 * 初始化 Google Analytics 4
 */
export const initGA = () => {
    if (!GA_MEASUREMENT_ID) {
        console.warn('GA4 Measurement ID not found. Analytics disabled.');
        return;
    }

    ReactGA.initialize(GA_MEASUREMENT_ID);

    // 初始化 IdentityManager 以取得/生成 UUID
    identityManager.init().then(({ uuid, isNew }) => {
        // 設定 User ID
        ReactGA.set({ userId: uuid });

        // 設定使用者屬性 (User Properties)
        ReactGA.set({
            user_properties: {
                visitor_type: isNew ? 'new' : 'returning',
                // GA4 自動收集 language 和 page_location，此處可不重複設定
            }
        });

        // 也可以選擇在這個時間點發送一個特定事件來標記識別完成，但通常 init 整合即可
    }).catch(err => {
        console.warn('IdentityManager init failed:', err);
    });
};

/**
 * 記錄頁面瀏覽 (Page View)
 * 注意：GA4 預設是 SPA 自動追蹤，但在某些路由變化下可能需要手動觸發
 */
export const logPageView = () => {
    if (!GA_MEASUREMENT_ID) return;

    ReactGA.send({
        hitType: "pageview",
        page: window.location.pathname + window.location.search
    });
};

/**
 * 記錄自定義事件 (Custom Event)
 * @param category 事件類別 (例如：'ControlPanel', 'Favorites')
 * @param action 事件動作 (例如：'toggle_layout', 'add_favorite')
 * @param label 事件標籤 (選填，用於補充說明)
 * @param value 事件數值 (選填，必須是數字)
 */
export const logEvent = (category: string, action: string, label?: string, value?: number) => {
    if (!GA_MEASUREMENT_ID) return;

    ReactGA.event({
        category,
        action,
        label,
        value
    });
};

/**
 * 特別為使用者屬性設定 (雖 GA4 自動收集國家，但若有自定義屬性可擴充)
 */
export const setUserProperties = (properties: any) => {
    if (!GA_MEASUREMENT_ID) return;
    ReactGA.set(properties);
};
