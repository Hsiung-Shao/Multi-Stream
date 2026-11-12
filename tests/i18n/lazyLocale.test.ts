// i18n 語言包懶載入：zh-TW 與 en 不再靜態打包，改由 ensureLanguageLoaded 動態載入。
// 每條測試都用全新 i18next 實例隔離（tests/setup.ts 之後會預載 zh-TW／en，不能共用單例）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type I18nModule = typeof import('../../src/i18n/i18n');

const ZH_COMMON_CANCEL = '取消'; // locales/zh-TW/common.ts 的 'common.cancel'
const EN_COMMON_CANCEL = 'Cancel'; // locales/en/common.ts 的 'common.cancel'
const KEY = 'common.cancel';

/** 取得乾淨的 i18n 模組：i18next 是 externalized，單例要靠 createInstance 換掉 */
async function freshI18n(): Promise<I18nModule> {
    vi.resetModules();
    vi.doMock('i18next', async (importOriginal) => {
        const m: any = await importOriginal();
        return { ...m, default: m.default.createInstance() };
    });
    return import('../../src/i18n/i18n');
}

describe('i18n 語言包懶載入', () => {
    beforeEach(() => {
        vi.doUnmock('../../src/i18n/locales/en/index');
        vi.doUnmock('../../src/i18n/locales/ja/index');
    });
    afterEach(() => {
        vi.doUnmock('i18next');
        vi.doUnmock('../../src/i18n/locales/en/index');
        vi.doUnmock('../../src/i18n/locales/ja/index');
    });

    it('T0 初始化後尚未含繁中與英文資源', async () => {
        const { default: i18n } = await freshI18n();
        expect(i18n.hasResourceBundle('zh-TW', 'common')).toBe(false);
        expect(i18n.hasResourceBundle('en', 'common')).toBe(false);
    });

    it('T1 載入繁中後 t 回繁中字串', async () => {
        const { default: i18n, ensureLanguageLoaded } = await freshI18n();
        await ensureLanguageLoaded('zh-TW');
        await i18n.changeLanguage('zh-TW');
        expect(i18n.t(KEY, { ns: 'common' })).toBe(ZH_COMMON_CANCEL);
    });

    it('T2 en-US 會載入英文', async () => {
        const { default: i18n, ensureLanguageLoaded } = await freshI18n();
        await ensureLanguageLoaded('en-US');
        await i18n.changeLanguage('en-US');
        expect(i18n.t(KEY, { ns: 'common' })).toBe(EN_COMMON_CANCEL);
    });

    it('T3 不支援語言 zh-HK 退回英文而非顯示 key', async () => {
        const { default: i18n, ensureLanguageLoaded } = await freshI18n();
        await ensureLanguageLoaded('zh-HK');
        await i18n.changeLanguage('zh-HK');
        const v = i18n.t(KEY, { ns: 'common' });
        expect(v).not.toBe(KEY);
        expect(v).toBe(EN_COMMON_CANCEL);
    });

    it('T4 日文缺 key 時退回英文', async () => {
        // 真實 ja 與 en 的 key 目前一致，沒有天然缺漏；只在載入邊界把 ja 的 common.cancel 拿掉來模擬
        vi.doMock('../../src/i18n/locales/ja/index', async (importOriginal) => {
            const m: any = await importOriginal();
            const { [KEY]: _drop, ...commonRest } = m.default.common;
            return { ...m, default: { ...m.default, common: commonRest } };
        });
        const { default: i18n, ensureLanguageLoaded } = await freshI18n();
        await ensureLanguageLoaded('ja');
        await i18n.changeLanguage('ja');
        expect(i18n.t('common.loading', { ns: 'common' })).toBe('読み込み中...'); // 日文本身確實載入
        expect(i18n.t(KEY, { ns: 'common' })).toBe(EN_COMMON_CANCEL);
    });

    it('T5 執行中切換到未載入的語言會自動補載', async () => {
        const { default: i18n, ensureLanguageLoaded } = await freshI18n();
        await ensureLanguageLoaded('zh-TW');
        await i18n.changeLanguage('zh-TW');
        await i18n.changeLanguage('en');
        await vi.waitFor(() => expect(i18n.hasResourceBundle('en', 'common')).toBe(true));
        expect(i18n.t(KEY, { ns: 'common' })).toBe(EN_COMMON_CANCEL);
    });

    it('T6 繁中不等英文載完', async () => {
        // en 彙整檔永遠載不完
        vi.doMock('../../src/i18n/locales/en/index', () => new Promise(() => {}));
        const { ensureLanguageLoaded } = await freshI18n();
        const result = await Promise.race([
            ensureLanguageLoaded('zh-TW').then(() => 'resolved'),
            new Promise((r) => setTimeout(() => r('timeout'), 1500)),
        ]);
        expect(result).toBe('resolved');
    });

    it('T7 選單切到未載入語言時，語言切換當下翻譯已就緒', async () => {
        const { default: i18n, ensureLanguageLoaded } = await freshI18n();
        await ensureLanguageLoaded('en');
        await i18n.changeLanguage('en');
        const seen: Array<{ lng: string; ready: boolean }> = [];
        i18n.on('languageChanged', (lng: string) => {
            seen.push({ lng, ready: i18n.hasResourceBundle('zh-TW', 'common') });
        });
        const { switchLanguage } = await import('../../src/i18n/switchLanguage');
        switchLanguage('zh-TW');
        await vi.waitFor(() => expect(i18n.language).toBe('zh-TW'));
        const first = seen.find((e) => e.lng === 'zh-TW');
        expect(first?.ready).toBe(true);
    });

    it('T8 語言包載入失敗後再呼叫會重試', async () => {
        let calls = 0;
        vi.doMock('../../src/i18n/locales/ja/index', async (importOriginal) => {
            calls += 1;
            if (calls === 1) throw new Error('chunk 載入失敗');
            return importOriginal();
        });
        const { default: i18n, ensureLanguageLoaded } = await freshI18n();
        await ensureLanguageLoaded('ja').catch(() => {});
        expect(i18n.hasResourceBundle('ja', 'common')).toBe(false);
        await ensureLanguageLoaded('ja').catch(() => {});
        expect(i18n.hasResourceBundle('ja', 'common')).toBe(true);
    });
});
