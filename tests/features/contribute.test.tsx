// 新增 VTuber 與資料回報（前端）：
//   路由 /schedule/submit、頻道輸入判斷、預填、回報對象欄位、預覽卡、個人頁簡介／社群／回報、
//   個人頁查詢指名外鍵（vtubers 到 vtuber_groups 有多條關聯，不指名 PostgREST 回 300）與舊資料庫退回
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '../../src/i18n/i18n';
import { pathToPage, pageToPath, PAGE_PATHS } from '../../src/config/routes';
import { looksLikeChannelInput } from '../../src/features/contribute/useChannelLookup';
import { setContributePrefill, consumeContributePrefill } from '../../src/features/contribute/prefill';
import { targetFields } from '../../src/features/report/ReportDialog';
import { ContributePreviewCard } from '../../src/features/contribute/ContributePreviewCard';
import { ReportDialogProvider, useReportDialog } from '../../src/features/report/ReportDialogProvider';
import { REPORT_REASONS } from '../../src/features/contribute/api';
import { fetchPerson, resetPersonSourceCache } from '../../src/features/schedule/personSource';

beforeEach(async () => {
    await i18n.changeLanguage('zh-TW');
});

describe('路由與輸入', () => {
    it('/schedule/submit 是投稿頁，不是 slug 為 submit 的個人頁', () => {
        expect(pathToPage('/schedule/submit')).toBe('scheduleSubmit');
        expect(pageToPath('scheduleSubmit')).toBe('/schedule/submit');
        expect(PAGE_PATHS.scheduleSubmit).toBe('/schedule/submit');
        expect(pathToPage('/schedule/someone')).toBe('schedule:someone');
    });

    it('只有像 YouTube 頻道的輸入才查詢', () => {
        expect(looksLikeChannelInput('@abc')).toBe(true);
        expect(looksLikeChannelInput('https://www.youtube.com/@abc')).toBe(true);
        expect(looksLikeChannelInput('UC' + 'a'.repeat(22))).toBe(true);
        expect(looksLikeChannelInput('https://www.youtube.com/channel/UC' + 'a'.repeat(22))).toBe(true);
        expect(looksLikeChannelInput('h')).toBe(false);
        expect(looksLikeChannelInput('https://www.youtube.com/watch?v=abc')).toBe(false);
    });

    it('預填只取用一次', () => {
        setContributePrefill('  浠Mizuki  ');
        expect(consumeContributePrefill()).toBe('浠Mizuki');
        expect(consumeContributePrefill()).toBeNull();
    });
});

describe('回報', () => {
    it('對象欄位與後端 validateReport 對應', () => {
        expect(targetFields({ kind: 'vtuber_info', vtuberId: 'v', name: 'n' })).toEqual({ kind: 'vtuber_info', vtuberId: 'v' });
        expect(targetFields({ kind: 'roster', groupId: 'g', groupName: 'G' })).toEqual({ kind: 'roster', groupId: 'g' });
        expect(targetFields({ kind: 'stream', vtuberId: 'v', platform: 'youtube', externalId: 'abc' })).toEqual({
            kind: 'stream',
            vtuberId: 'v',
            stream: { platform: 'youtube', externalId: 'abc' },
        });
        expect(targetFields({ kind: 'missing_vtuber' })).toEqual({ kind: 'missing_vtuber' });
    });

    it('每個原因都有文案（5 語的 zh-TW 型別來源）', () => {
        for (const r of new Set(Object.values(REPORT_REASONS).flat())) {
            expect(i18n.t(`schedule:report.reason.${r}`)).not.toBe(`report.reason.${r}`);
        }
    });

    it('Provider：openReport 打開對話框（lazy 載入），標題依對象', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, siteKey: null, enforced: false }))));
        function Opener() {
            const r = useReportDialog();
            return <button onClick={() => r?.openReport({ kind: 'vtuber_info', vtuberId: 'v1', name: '台一' })}>open</button>;
        }
        render(
            <ReportDialogProvider>
                <Opener />
            </ReportDialogProvider>,
        );
        fireEvent.click(screen.getByText('open'));
        expect(await screen.findByText('回報 台一 的資料錯誤')).toBeTruthy();
        expect(screen.getByText('地區錯誤')).toBeTruthy();
        vi.unstubAllGlobals();
    });

    it('沒有 Provider 時 useReportDialog 回 null（按鈕不顯示）', () => {
        let api: unknown = 'unset';
        function Probe() {
            api = useReportDialog();
            return null;
        }
        render(<Probe />);
        expect(api).toBeNull();
    });
});

describe('預覽卡', () => {
    const base = { name: '新人', avatarUrl: '', groupLabel: '個人勢', nationality: 'TW', bio: '', subscribers: '', hasYoutube: true, socials: { x: false, facebook: false, instagram: false, twitch: false } };

    it('頭像只載入 YouTube 圖床；顯示名稱、所屬、地區、訂閱數', () => {
        const { container, rerender } = render(<ContributePreviewCard data={{ ...base, avatarUrl: 'https://evil.example/a.png', subscribers: '21.8萬' }} />);
        expect(container.querySelector('img')).toBeNull();
        expect(screen.getByText('新人')).toBeTruthy();
        expect(screen.getByText('個人勢 · 台灣')).toBeTruthy();
        expect(screen.getByText('21.8萬 位訂閱者')).toBeTruthy();
        rerender(<ContributePreviewCard data={{ ...base, avatarUrl: 'https://yt3.googleusercontent.com/a=s900' }} />);
        expect(container.querySelector('img')?.getAttribute('src')).toBe('https://yt3.googleusercontent.com/a=s900');
    });
});

describe('個人頁查詢', () => {
    beforeEach(() => resetPersonSourceCache());
    const env = { envUrl: 'http://127.0.0.1:57321/', envAnonKey: 'anon-test', now: Date.parse('2026-10-01T00:00:00Z') };
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    const vt = { id: 'v1', name: '台一', img_url: null, nationality: 'TW', youtube_channel_id: null, twitch_channel_id: null, slug: 'taione', schedule_indexable: true, vtuber_groups: null };

    it('指名 group_id 外鍵；讀到簡介與社群', async () => {
        const urls: string[] = [];
        const fetchFn = vi.fn(async (url: string) => {
            urls.push(decodeURIComponent(url));
            return url.includes('/vtubers?') ? json([{ ...vt, bio: ' 簡介 ', x_url: 'https://x.com/a', facebook_url: null, instagram_url: 'https://www.instagram.com/a' }]) : json([]);
        });
        const p = await fetchPerson('taione', { ...env, fetchFn: fetchFn as unknown as typeof fetch });
        expect(urls[0]).toContain('vtuber_groups!vtubers_group_id_fkey(');
        expect(urls[0]).toContain('bio,x_url,facebook_url,instagram_url');
        expect(p?.profile).toEqual({ bio: '簡介', x: 'https://x.com/a', instagram: 'https://www.instagram.com/a' });
    });

    it('資料庫還沒有新欄位（400）→ 退回不含個人資料的查詢', async () => {
        const urls: string[] = [];
        const fetchFn = vi.fn(async (url: string) => {
            urls.push(decodeURIComponent(url));
            if (url.includes('/vtubers?') && decodeURIComponent(url).includes('bio,')) return json({ message: 'column vtubers.bio does not exist' }, 400);
            return url.includes('/vtubers?') ? json([vt]) : json([]);
        });
        const p = await fetchPerson('taione', { ...env, fetchFn: fetchFn as unknown as typeof fetch });
        expect(p?.channel.name).toBe('台一');
        expect(p?.profile).toEqual({});
        expect(urls.filter((u) => u.includes('/vtubers?'))).toHaveLength(2);
    });
});
