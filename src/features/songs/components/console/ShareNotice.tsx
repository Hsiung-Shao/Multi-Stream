/** 分享連結載入提示：載入幾首、略過幾首，可另存為歌單或關閉 */
import { useTranslation } from 'react-i18next';
import { ListPlus, X } from 'lucide-react';
import { Button } from '../../../../components/ui/button';

export interface ShareNoticeState {
    found: string[];
    missing: number;
    saved: boolean;
}

export function ShareNotice({ notice, onSave, onDismiss }: { notice: ShareNoticeState; onSave: () => void; onDismiss: () => void }) {
    const { t } = useTranslation('songs');
    return (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.07] px-4 py-3 text-sm">
            <span className="min-w-0 flex-1">
                {notice.found.length > 0 ? t('share.loaded', { count: notice.found.length }) : t('share.none')}
                {notice.missing > 0 && notice.found.length > 0 && <>{' '}{t('share.missing', { count: notice.missing })}</>}
            </span>
            {notice.found.length > 0 && (
                <Button size="sm" variant="outline" className="h-8 bg-transparent" onClick={onSave} disabled={notice.saved}>
                    <ListPlus className="size-3.5" aria-hidden="true" />
                    {notice.saved ? t('share.saved') : t('share.saveAs')}
                </Button>
            )}
            <Button size="icon" variant="ghost" className="size-8" onClick={onDismiss} aria-label={t('share.dismiss')} title={t('share.dismiss')}>
                <X className="size-3.5" aria-hidden="true" />
            </Button>
        </div>
    );
}
