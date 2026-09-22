/**
 * SwapHint —— 拖曳換位的落點提示（覆蓋在視窗內容上方，不攔截指標事件）。
 * active=false：有視窗正在拖曳，這裡「可放在這裡交換」；active=true：放開就會互換。
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight } from 'lucide-react';
import { cn } from '../ui/utils';

export const SwapHint = memo(function SwapHint({ active }: { active: boolean }) {
    const { t } = useTranslation('common');
    return (
        <div
            data-swap-hint={active ? 'target' : 'candidate'}
            className={cn(
                'absolute inset-0 z-[70] flex items-center justify-center rounded-lg border-2 border-dashed pointer-events-none',
                active
                    ? 'border-green-400/90 bg-green-500/20 text-green-100'
                    : 'border-white/25 bg-white/[0.04] text-white/70',
            )}
        >
            <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-medium">
                <ArrowLeftRight size={12} />
                {active ? t('canvas.swap_release') : t('canvas.swap_candidate')}
            </span>
        </div>
    );
});
