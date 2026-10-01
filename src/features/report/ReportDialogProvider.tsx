// 資料回報對話框的 Provider：全頁只掛一個對話框，第一次打開時才載入（不增加週表首屏 JS）。
// 卡片、個人頁、名冊上的回報按鈕只呼叫 useReportDialog().openReport(target)。

import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ReportTarget } from './reportTarget';

interface DialogProps {
    target: ReportTarget;
    onClose: () => void;
}

/** chunk 載不到（離線、發版後舊 chunk 已刪）：提示「重新整理」後關閉，不讓按鈕看起來沒反應 */
function LoadFailed({ onClose }: DialogProps) {
    const { t } = useTranslation('schedule');
    useEffect(() => {
        // 固定 id：StrictMode 的 effect 跑兩次也只顯示一則
        toast.error(t('report.loadFailed'), { id: 'report-load-failed' });
        onClose();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
}

function makeLazyDialog() {
    return lazy<ComponentType<DialogProps>>(() =>
        import('./ReportDialog').catch(() => {
            // React.lazy 會記住結果：換一個新的 lazy，下次打開會再試一次 import（瀏覽器可能沿用失敗的 module，
            // 所以文案請使用者重新整理；這裡只保證每次打開都有回應、不會一直轉圈）
            ReportDialog = makeLazyDialog();
            return { default: LoadFailed as ComponentType<DialogProps> };
        }),
    );
}

let ReportDialog = makeLazyDialog();

interface ReportDialogApi {
    openReport: (target: ReportTarget) => void;
}

const ReportDialogContext = createContext<ReportDialogApi | null>(null);

export function ReportDialogProvider({ children }: { children: ReactNode }) {
    const [target, setTarget] = useState<ReportTarget | null>(null);
    const openReport = useCallback((t: ReportTarget) => setTarget(t), []);
    const close = useCallback(() => setTarget(null), []);
    const api = useMemo(() => ({ openReport }), [openReport]);
    return (
        <ReportDialogContext.Provider value={api}>
            {children}
            {target && (
                <Suspense fallback={null}>
                    <ReportDialog target={target} onClose={close} />
                </Suspense>
            )}
        </ReportDialogContext.Provider>
    );
}

/** 沒有包在 Provider 裡時回 null（呼叫端就不顯示回報按鈕） */
export function useReportDialog(): ReportDialogApi | null {
    return useContext(ReportDialogContext);
}
