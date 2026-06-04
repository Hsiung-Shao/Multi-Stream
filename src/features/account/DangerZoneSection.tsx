import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { DeleteAccountDialog } from '../../components/Dialogs/DeleteAccountDialog';
import { AcctSection } from './AcctSection';

/**
 * 危險區域卡：永久刪除帳號入口。
 *
 * 按鈕直接開既有 DeleteAccountDialog（複用，不含任何刪帳號邏輯）。
 */
export function DangerZoneSection() {
    const { t } = useTranslation('account');
    const [open, setOpen] = useState(false);

    return (
        <AcctSection
            tone="destructive"
            icon={<AlertTriangle className="size-4 text-destructive" />}
            title={t('danger.title', '危險區域')}
            description={t(
                'danger.description',
                '刪除帳號會永久移除所有雲端資料：登入方式、收藏、分類、標籤與布局。本機資料仍會留在你的瀏覽器裡。',
            )}
        >
            <div className="flex justify-end">
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive dark:bg-destructive/10"
                    onClick={() => setOpen(true)}
                >
                    <Trash2 className="size-3.5" />
                    {t('danger.deleteButton', '刪除帳號')}
                </Button>
            </div>

            <DeleteAccountDialog open={open} onClose={() => setOpen(false)} />
        </AcctSection>
    );
}
