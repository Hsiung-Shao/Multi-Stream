import i18n from './i18n';

/**
 * 使用者在語言選單「明確選擇」語言：切換介面並寫入長期偏好。
 * 網址命中 /zh-TW 不會改偏好（見 i18n.ts），所以偏好是 en 的人開到中文頁時，選單顯示的是繁體中文；
 * 此時他再點「繁體中文」，Radix Select 因為值相同不會觸發 onValueChange，得靠 SelectItem 的 onPointerUp 也呼叫這裡，
 * 才能把 zh-TW 存成偏好。語言相同時 changeLanguage 是 no-op，重複呼叫無副作用。
 */
export function switchLanguage(lang: string): void {
    void i18n.changeLanguage(lang);
    try {
        window.localStorage.setItem('i18nextLng', lang);
    } catch {
        // 儲存被封鎖：介面仍切換，只是偏好存不下來
    }
}
