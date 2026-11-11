/** 目錄還沒到時的中欄提示：載入中，或載入失敗加「重試」（列表、單場、個人頁、單曲頁共用） */
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../components/ui/utils';

export function CatalogPending({ isError, retrying, onRetry }: { isError: boolean; retrying: boolean; onRetry: () => void }) {
    const { t } = useTranslation('songs');
    if (isError) {
        return (
            <div className="flex flex-wrap items-center gap-4 rounded-xl bg-popover p-6">
                <p role="alert" className="flex-1 font-bold">{t('catalog.loadError')}</p>
                <Button variant="outline" onClick={onRetry} disabled={retrying}>
                    <RefreshCw className={cn('size-3.5', retrying && 'animate-spin')} aria-hidden="true" />
                    {t('catalog.retry')}
                </Button>
            </div>
        );
    }
    // 至少一個視窗高：載入後的清單遠超一屏，下方說明／頁尾一開始就在畫面外，換成清單時不算位移（CLS）
    return (
        <p role="status" className="flex min-h-svh items-start justify-center gap-2 rounded-xl bg-popover pt-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t('catalog.loading')}
        </p>
    );
}
