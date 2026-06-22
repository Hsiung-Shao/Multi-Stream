/**
 * DeferredGlobals — 集中「全站常駐、但非首屏首次繪製所需」的全域元件，
 * 以單一 lazy chunk 在首屏渲染後才載入，縮小初始 entry 體積（改善 FCP/LCP）。
 *
 * 收錄條件：無需由 App 傳入 props（自行透過 store 取得狀態）、且延後數百毫秒掛載不影響正確性
 * （多為 overlay / 提示 / 背景輪詢，初始皆 render null 或延遲顯示）。
 *
 * 需由 App 傳 props 或與 App 狀態強耦合者（YouTubeRiskDialog、RestoreSessionPrompt、各 Modal）
 * 仍保留在 App.tsx。
 */
import { useUIStore } from '../store/useUIStore';
import { Toaster } from './ui/sonner';
import { PerformanceOverlay } from './Navigation/PerformanceOverlay';
import { GlobalLiveStatusChecker } from '../features/favorites/components/GlobalLiveStatusChecker';
import { HotkeyHelpDialog } from './Dialogs/HotkeyHelpDialog';
import { CookieConsent } from './CookieConsent';
import { AnnouncementsProvider } from '../features/announcements/AnnouncementsProvider';
import { FeedbackFAB } from './Navigation/FeedbackFAB';
import { BraveDetectDialog } from './Dialogs/BraveDetectDialog';

export default function DeferredGlobals() {
    const currentPage = useUIStore(s => s.page);
    // 全站浮動意見回饋按鈕 — admin / canvas 沉浸頁略過避免擋畫面
    const showFeedbackFab = currentPage !== 'admin' && currentPage !== 'canvas';

    return (
        <>
            <HotkeyHelpDialog />
            <PerformanceOverlay />
            <GlobalLiveStatusChecker />
            <Toaster />
            <CookieConsent />
            <AnnouncementsProvider />
            <BraveDetectDialog />
            {showFeedbackFab && <FeedbackFAB />}
        </>
    );
}
