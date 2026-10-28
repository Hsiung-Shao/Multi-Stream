// 隱私權政策：歌回播放計次告知（第 2.5 節第 8 項）、更新日期、五語 key 一致
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { PrivacyPage } from '../../src/components/PrivacyPage';
import { useUIStore } from '../../src/store/useUIStore';
import i18n from '../../src/i18n/i18n';
import zhTW from '../../src/i18n/locales/zh-TW/privacy';
import zhCN from '../../src/i18n/locales/zh-CN/privacy';
import en from '../../src/i18n/locales/en/privacy';
import ja from '../../src/i18n/locales/ja/privacy';
import ko from '../../src/i18n/locales/ko/privacy';

// 真 i18n 鎖 zh-TW（jsdom 預設 en-US），對著實際文案斷言
beforeAll(async () => {
    await i18n.changeLanguage('zh-TW');
});

vi.mock('../../src/store/useUIStore');
vi.mock('../../src/utils/analytics', () => ({ logEvent: vi.fn() }));

beforeEach(() => {
    (useUIStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (selector: (s: { openModal: () => void; setPage: () => void }) => unknown) =>
            selector({ openModal: vi.fn(), setPage: vi.fn() }),
    );
});

describe('PrivacyPage 歌回播放計次告知（zh-TW）', () => {
    it('B1 第 2.5 節出現歌回播放計次那一項，含「播放次數」與「雜湊」', () => {
        render(<PrivacyPage theme="light" onThemeToggle={() => {}} />);
        const item = screen.getByText((_, el) => el?.tagName === 'LI' && /播放次數/.test(el.textContent ?? '') && /雜湊/.test(el.textContent ?? ''));
        expect(item).toBeInTheDocument();
        expect(item.textContent).toContain('歌');
    });

    it('B1 item8 說明播放次數不含身分、暫存雜湊 IP 與所聽歌曲的對應、約 2 小時後陸續刪除', () => {
        const text = (zhTW as Record<string, string>)['section2_5.item8'];
        expect(text).toBeTruthy();
        expect(text).toContain('播放次數');
        expect(text).toContain('雜湊');
        expect(text).not.toMatch(/不記錄是誰/);
        expect(text).toMatch(/不含任何身分/);
        expect(text).toMatch(/歌曲編號的對應/);
        expect(text).toMatch(/2 小時|兩小時/);
    });

    it('B2 最新更新日期是 2026 年 10 月 28 日', () => {
        expect((zhTW as Record<string, string>)['lastUpdatedValue']).toBe('2026 年 10 月 28 日');
        render(<PrivacyPage theme="light" onThemeToggle={() => {}} />);
        expect(screen.getByText(/2026 年 10 月 28 日/)).toBeInTheDocument();
    });
});

describe('privacy 五語系 key 一致', () => {
    const base = new Set(Object.keys(zhTW));
    const locales = { 'zh-CN': zhCN, en, ja, ko } as const;

    it.each(Object.entries(locales))('%s 與 zh-TW 的 key 集合相同，且含 section2_5.item8', (_name, dict) => {
        const keys = new Set(Object.keys(dict));
        const missing = [...base].filter((k) => !keys.has(k));
        const extra = [...keys].filter((k) => !base.has(k));
        expect({ missing, extra }).toEqual({ missing: [], extra: [] });
        expect(keys.has('section2_5.item8')).toBe(true);
    });

    it('section2_5.item8 五語都是非空字串', () => {
        for (const dict of [zhTW, ...Object.values(locales)]) {
            const v = (dict as Record<string, string>)['section2_5.item8'];
            expect(typeof v === 'string' && v.trim().length > 0).toBe(true);
        }
    });
});
