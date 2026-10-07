// 「提供週表」對話框的 Provider：全頁只掛一個對話框，第一次打開時才載入（不增加個人頁首屏 JS）。
// 個人頁上的按鈕只呼叫 useScheduleEntriesDialog().openScheduleEntries(target)。
// lazy／載入失敗的處理與 src/features/report/ReportDialogProvider.tsx 相同。

import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ScheduleEntriesTarget } from './ScheduleEntriesDialog';

interface DialogProps {
    target: ScheduleEntriesTarget;
    onClose: () => void;
}

/** chunk 載不到（離線、發版後舊 chunk 已刪）：提示「重新整理」後關閉，不讓按鈕看起來沒反應 */
function LoadFailed({ onClose }: DialogProps) {
    const { t } = useTranslation('schedule');
    useEffect(() => {
        // 固定 id：StrictMode 的 effect 跑兩次也只顯示一則
        toast.error(t('scheduleEntries.loadFailed'), { id: 'schedule-entries-load-failed' });
        onClose();
        // 掛載時只做一次：t 與 onClose 換參照不該再跳一次提示
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
}

function makeLazyDialog() {
    return lazy<ComponentType<DialogProps>>(() =>
        import('./ScheduleEntriesDialog').catch(() => {
            // React.lazy 會記住結果：換一個新的 lazy，下次打開會再試一次 import
            ScheduleEntriesDialog = makeLazyDialog();
            return { default: LoadFailed as ComponentType<DialogProps> };
        }),
    );
}

let ScheduleEntriesDialog = makeLazyDialog();

interface ScheduleEntriesDialogApi {
    openScheduleEntries: (target: ScheduleEntriesTarget) => void;
}

const ScheduleEntriesDialogContext = createContext<ScheduleEntriesDialogApi | null>(null);

export function ScheduleEntriesDialogProvider({ children }: { children: ReactNode }) {
    const [target, setTarget] = useState<ScheduleEntriesTarget | null>(null);
    const openScheduleEntries = useCallback((t: ScheduleEntriesTarget) => setTarget(t), []);
    const close = useCallback(() => setTarget(null), []);
    const api = useMemo(() => ({ openScheduleEntries }), [openScheduleEntries]);
    return (
        <ScheduleEntriesDialogContext.Provider value={api}>
            {children}
            {target && (
                <Suspense fallback={null}>
                    <ScheduleEntriesDialog target={target} onClose={close} />
                </Suspense>
            )}
        </ScheduleEntriesDialogContext.Provider>
    );
}

/** 沒有包在 Provider 裡時回 null（呼叫端就不顯示按鈕） */
export function useScheduleEntriesDialog(): ScheduleEntriesDialogApi | null {
    return useContext(ScheduleEntriesDialogContext);
}
