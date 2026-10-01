// 資料回報對話框的 Provider：全頁只掛一個對話框，第一次打開時才載入（不增加週表首屏 JS）。
// 卡片、個人頁、名冊上的回報按鈕只呼叫 useReportDialog().openReport(target)。

import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ReportTarget } from './reportTarget';

const ReportDialog = lazy(() => import('./ReportDialog'));

interface ReportDialogApi {
    openReport: (target: ReportTarget) => void;
}

const ReportDialogContext = createContext<ReportDialogApi | null>(null);

export function ReportDialogProvider({ children }: { children: ReactNode }) {
    const [target, setTarget] = useState<ReportTarget | null>(null);
    const openReport = useCallback((t: ReportTarget) => setTarget(t), []);
    const api = useMemo(() => ({ openReport }), [openReport]);
    return (
        <ReportDialogContext.Provider value={api}>
            {children}
            {target && (
                <Suspense fallback={null}>
                    <ReportDialog target={target} onClose={() => setTarget(null)} />
                </Suspense>
            )}
        </ReportDialogContext.Provider>
    );
}

/** 沒有包在 Provider 裡時回 null（呼叫端就不顯示回報按鈕） */
export function useReportDialog(): ReportDialogApi | null {
    return useContext(ReportDialogContext);
}
