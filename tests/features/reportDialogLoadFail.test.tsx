// 回報對話框 chunk 載入失敗（離線、發版後舊 chunk 已刪）：提示錯誤並關閉，下次打開會重新載入。
// 獨立一檔：要讓 ReportDialog 模組本身載入失敗。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '../../src/i18n/i18n';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }));

let loads = 0;
vi.mock('../../src/features/report/ReportDialog', () => {
    loads += 1;
    throw new Error('chunk load failed');
});

import { ReportDialogProvider, useReportDialog } from '../../src/features/report/ReportDialogProvider';

beforeEach(async () => {
    await i18n.changeLanguage('zh-TW');
});

describe('ReportDialogProvider', () => {
    it('載入失敗時提示並關閉，不卡住', async () => {
        function Opener() {
            const r = useReportDialog();
            return <button onClick={() => r?.openReport({ kind: 'missing_vtuber' })}>open</button>;
        }
        render(
            <ReportDialogProvider>
                <Opener />
            </ReportDialogProvider>,
        );
        fireEvent.click(screen.getByText('open'));
        await waitFor(() => expect(toastError).toHaveBeenCalledWith('回報表單載入失敗，請重新整理頁面後再試', expect.anything()));
        expect(loads).toBeGreaterThan(0);
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
