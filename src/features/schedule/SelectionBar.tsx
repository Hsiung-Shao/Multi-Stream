import { useTranslation } from 'react-i18next';
import { MonitorPlay, X } from 'lucide-react';
import { Button } from '../../components/ui/button';

interface SelectionBarProps {
    count: number;
    /** 畫布還能加幾路 */
    room: number;
    busy: boolean;
    onOpen: () => void;
    onClear: () => void;
}

/** 勾選後浮在畫面底部的操作列 */
export function SelectionBar({ count, room, busy, onOpen, onClear }: SelectionBarProps) {
    const { t } = useTranslation('schedule');
    if (count === 0) return null;
    return (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4" role="region" aria-live="polite" aria-label={t('selection.count', { count })}>
            <div className="flex w-full max-w-xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-background/95 px-4 py-3 shadow-2xl backdrop-blur">
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{t('selection.count', { count })}</div>
                    {count > room && <div className="text-xs text-amber-500">{t('selection.limit', { count: room })}</div>}
                </div>
                <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>
                    <X size={15} aria-hidden="true" />
                    {t('selection.clear')}
                </Button>
                <Button size="sm" onClick={onOpen} disabled={busy || room === 0} className="rounded-full px-4">
                    <MonitorPlay size={15} aria-hidden="true" />
                    {t('selection.open')}
                </Button>
            </div>
        </div>
    );
}
