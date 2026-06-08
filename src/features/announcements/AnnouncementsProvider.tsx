/**
 * 公告系統根元件(進站偵測 + 統籌渲染)
 *
 * Lifecycle:
 *   1. mount 後等 1.5s(同 CookieConsent 慣例,避免干擾首次載入)
 *   2. 拉 /api/announcements/active(身份由 supabase session 自動帶)
 *   3. 對每個公告依 type 路由:
 *      - announcement: 過濾 dismissed 後 sonner toast
 *      - poll       : 過濾 voted/dismissed 後彈一次 modal(同時間僅一個)
 *      - survey     : 過濾 voted/dismissed 後右下角顯示 chip(可同時多個,
 *                     priority desc,但實際上採「只顯示最高 priority 一個」避免擠)
 *   4. 公告陣列由 backend 已按 priority desc 排序,我們直接用該順序
 *
 * 重新拉:目前不做 polling(/api/announcements/active 已有 30s CDN cache);
 *        進到下一個 SPA 頁面也不重抓。下次完整 reload 才會更新。
 *        若日後要做 realtime 通知,可在這層加 visibility/focus 觸發 refetch。
 *
 * Prerender 跳過:puppeteer 注入 __PRERENDER__ 時不執行(避免 prerender HTML 含 toast / device id)
 */

import { useEffect, useRef, useState } from 'react';
import { fetchActiveAnnouncements } from './api';
import { isFlagSet } from './storage';
import { AnnouncementToast } from './AnnouncementToast';
import { AnnouncementPollModal } from './AnnouncementPollModal';
import { AnnouncementSurveyChip } from './AnnouncementSurveyChip';
import type { Announcement } from './types';

const SHOW_DELAY_MS = 1500;

function isPrerender(): boolean {
    if (typeof window === 'undefined') return true;
    return Boolean((window as Window & { __PRERENDER__?: boolean }).__PRERENDER__);
}

export function AnnouncementsProvider() {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [ready, setReady] = useState(false);
    // poll modal 開啟狀態(同一時間只彈一個)
    const [openPollId, setOpenPollId] = useState<string | null>(null);
    // 已處理過(關閉 / 完成)的 announcement id — 避免關掉後 setState 又重彈
    const handledRef = useRef<Set<string>>(new Set());
    // chip 顯示中的 id 集合(可能有複數,但 UX 上只顯示最高 priority 一個)
    const [visibleChipIds, setVisibleChipIds] = useState<Set<string>>(new Set());

    // 拉公告
    useEffect(() => {
        if (isPrerender()) return;
        let cancelled = false;
        const timer = window.setTimeout(async () => {
            const list = await fetchActiveAnnouncements();
            if (cancelled) return;
            setAnnouncements(list);
            setReady(true);
        }, SHOW_DELAY_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, []);

    // 進站偵測:挑出第一個未投/未關的 poll 自動彈;chip 一律顯示(但過濾旗標)
    useEffect(() => {
        if (!ready || announcements.length === 0) return;

        // poll:依 priority(陣列已排好)挑第一個未處理的
        if (!openPollId) {
            const nextPoll = announcements.find((a) => {
                if (a.type !== 'poll') return false;
                if (handledRef.current.has(a.id)) return false;
                if (isFlagSet('voted', a.id)) return false;
                if (isFlagSet('dismissed', a.id)) return false;
                return true;
            });
            if (nextPoll) {
                setOpenPollId(nextPoll.id);
            }
        }

        // survey:把所有未 voted/dismissed 的 id 收進 visibleChipIds
        // (UX 上只 render 第一個,避免擠;但保留集合方便日後切換)
        const surveysToShow = new Set<string>();
        for (const a of announcements) {
            if (a.type !== 'survey') continue;
            if (handledRef.current.has(a.id)) continue;
            if (isFlagSet('voted', a.id)) continue;
            if (isFlagSet('dismissed', a.id)) continue;
            surveysToShow.add(a.id);
        }
        // 用函式更新避免 stale closure
        setVisibleChipIds((prev) => {
            // 只在差異時更新(避免 re-render 風暴)
            if (prev.size === surveysToShow.size && [...prev].every((id) => surveysToShow.has(id))) {
                return prev;
            }
            return surveysToShow;
        });
    }, [ready, announcements, openPollId]);

    if (isPrerender()) return null;
    if (!ready) return null;

    // 過濾:announcement type → 沒被 dismiss 的全部丟給 ToastSpawner
    const toasts = announcements.filter(
        (a) => a.type === 'announcement' && !isFlagSet('dismissed', a.id),
    );

    // chip:UX 上只顯示「priority 最高」那一個 survey(陣列已 priority desc)
    const surveyToShow = announcements.find(
        (a) => a.type === 'survey' && visibleChipIds.has(a.id),
    );

    // 找當前要彈的 poll(若有)
    const pollToShow = openPollId
        ? announcements.find((a) => a.id === openPollId && a.type === 'poll')
        : null;

    return (
        <>
            {toasts.map((a) => (
                <AnnouncementToast key={a.id} announcement={a} />
            ))}

            {pollToShow && (
                <AnnouncementPollModal
                    announcement={pollToShow}
                    open={true}
                    onClose={() => {
                        if (openPollId) handledRef.current.add(openPollId);
                        setOpenPollId(null);
                    }}
                />
            )}

            {surveyToShow && (
                <AnnouncementSurveyChip
                    key={surveyToShow.id}
                    announcement={surveyToShow}
                    onDismiss={() => {
                        handledRef.current.add(surveyToShow.id);
                        setVisibleChipIds((prev) => {
                            if (!prev.has(surveyToShow.id)) return prev;
                            const next = new Set(prev);
                            next.delete(surveyToShow.id);
                            return next;
                        });
                    }}
                />
            )}
        </>
    );
}
