// songs 命名空間五語系 key 集合必須完全一致，避免新增文案漏翻
import { describe, it, expect } from 'vitest';
import zhTW from '../../src/i18n/locales/zh-TW/songs';
import zhCN from '../../src/i18n/locales/zh-CN/songs';
import en from '../../src/i18n/locales/en/songs';
import ja from '../../src/i18n/locales/ja/songs';
import ko from '../../src/i18n/locales/ko/songs';

const base = new Set(Object.keys(zhTW));
const locales = { 'zh-CN': zhCN, en, ja, ko } as const;

describe('songs 五語系 key 一致', () => {
    it.each(Object.entries(locales))('%s 與 zh-TW 的 key 集合相同', (_name, dict) => {
        const keys = new Set(Object.keys(dict));
        const missing = [...base].filter((k) => !keys.has(k));
        const extra = [...keys].filter((k) => !base.has(k));
        expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });

    it('每個 key 的值都是非空字串', () => {
        for (const dict of [zhTW, ...Object.values(locales)]) {
            for (const [k, v] of Object.entries(dict)) {
                expect(typeof v === 'string' && v.trim().length > 0, k).toBe(true);
            }
        }
    });
});
