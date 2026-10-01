// 收藏管理的「版本資訊」：最新版在最上面；副標題原本顯示原始字串 "description"（缺 key），2026-09 補上
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../src/i18n/i18n';
import { VersionHistorySection } from '../../src/features/favorites/components/VersionHistorySection';
import { versionHistoryData } from '../../src/config/versionHistoryData';
import pkg from '../../package.json';

// 最新條目必須等於 package.json 版號：發版時改了版號卻忘了寫版本資訊（或反過來）就會失敗
const LATEST = `v${pkg.version}`;

describe('VersionHistorySection', () => {
    beforeEach(async () => { await i18n.changeLanguage('zh-TW'); });

    it('副標題有實際文字，不是原始 key', () => {
        render(<VersionHistorySection theme="dark" />);
        expect(screen.getByText('查看所有功能更新與修正紀錄')).toBeInTheDocument();
        expect(screen.queryByText('description')).toBeNull();
    });

    it('最新版本（= package.json 版號）排在最上面，每條都有翻譯（沒有漏 key）', () => {
        expect(versionHistoryData[0].version).toBe(LATEST);
        render(<VersionHistorySection theme="dark" />);
        expect(screen.getByText(LATEST)).toBeInTheDocument();
        for (const key of versionHistoryData[0].changeKeys) {
            const text = i18n.t(key as any);
            expect(text, key).not.toBe(key.split(':')[1]);
            expect(screen.getByText(text)).toBeInTheDocument();
        }
    });

    it('5 種語言的最新版本條目都齊全', async () => {
        for (const lng of ['zh-TW', 'zh-CN', 'en', 'ja', 'ko']) {
            await i18n.changeLanguage(lng);
            for (const key of [versionHistoryData[0].dateKey, ...versionHistoryData[0].changeKeys, 'versionHistory:description']) {
                expect(i18n.exists(key), `${lng} ${key}`).toBe(true);
            }
        }
    });
});
