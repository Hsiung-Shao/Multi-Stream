import type React from 'react';
import i18n, { ensureLanguageLoaded } from './i18n';

/**
 * 使用者在語言選單「明確選擇」語言：切換介面並寫入長期偏好。
 * 網址命中 /zh-TW 不會改偏好（見 i18n.ts），所以偏好是 en 的人開到中文頁時，選單顯示的是繁體中文；
 * 此時他再點「繁體中文」，Radix Select 因為值相同不會觸發 onValueChange，得靠 SelectItem 的 onPointerUp 也呼叫這裡，
 * 才能把 zh-TW 存成偏好。語言相同時 changeLanguage 是 no-op，重複呼叫無副作用。
 */
let pendingLang: string | null = null;

export function switchLanguage(lang: string): void {
    // 先載好翻譯再切：以 i18n.language 為依賴的 memo（如教學頁文章）在切換當下就算完，資源晚到不會重算。
    // 連點兩種語言只切最後選的；載入失敗就維持原語言（切過去只會顯示 key）。
    pendingLang = lang;
    void ensureLanguageLoaded(lang).then(() => {
        if (pendingLang === lang && i18n.hasResourceBundle(lang, 'common')) void i18n.changeLanguage(lang);
    });
    try {
        window.localStorage.setItem('i18nextLng', lang);
    } catch {
        // 儲存被封鎖：介面仍切換，只是偏好存不下來
    }
}

/**
 * 語言選單 SelectItem 的共用事件：補上 Radix 不會回報的「選到同一個值」。
 * - pointerup：Radix 在 trigger 按下後游標移動不到 10px 就放開時會 preventDefault 故意不選，這裡跟著跳過。
 * - 鍵盤 Enter／Space：鍵盤選取不經過 pointerup，另外處理。
 * 值不同時 Radix 自己的 onValueChange 也會呼叫 switchLanguage，重複一次是同語言的 no-op。
 */
export function languageItemHandlers(lang: string): {
    onPointerUp: (e: React.PointerEvent) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
} {
    return {
        onPointerUp: (e) => {
            if (!e.defaultPrevented) switchLanguage(lang);
        },
        onKeyDown: (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !e.defaultPrevented) switchLanguage(lang);
        },
    };
}
