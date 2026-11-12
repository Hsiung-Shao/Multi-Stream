import 'i18next';
import type { defaultNS } from './i18n/i18n';
import type zhTW from './i18n/locales/zh-TW';

declare module 'i18next' {
    interface CustomTypeOptions {
        defaultNS: typeof defaultNS;
        resources: typeof zhTW;
    }
}
