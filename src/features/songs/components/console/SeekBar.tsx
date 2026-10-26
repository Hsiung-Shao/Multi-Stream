import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Slider } from '../../../../components/ui/slider';
import { cn } from '../../../../components/ui/utils';
import { formatTimecode } from '../../lib/timecode';
import type { SegmentPlayer } from '../../hooks/useSegmentPlayer';

/** 本首進度：拖曳中顯示拖曳位置，放開（或鍵盤調整）才 seek，免得輪詢更新和手指互搶 */
export function SeekBar({ player, className }: { player: SegmentPlayer; className?: string }) {
    const { t } = useTranslation('songs');
    const { elapsed, total } = player.progress;
    const [dragging, setDragging] = useState<number | null>(null);
    const shown = dragging ?? elapsed;
    // 還沒開始播（分享連結只 cue）時停用：cued 狀態 seekTo 會讓 YouTube 直接開播，佇列卻不會追蹤、播到結尾也不切歌
    const disabled = !player.current || total <= 0 || player.queue.status !== 'playing';
    return (
        <div className={cn('flex items-center gap-2.5 text-[11px] tabular-nums text-muted-foreground', className)}>
            <span className="w-11 shrink-0 text-right">{formatTimecode(shown)}</span>
            <div role="group" aria-label={t('controls.seek')} className="min-w-0 flex-1">
                <Slider
                    min={0}
                    max={Math.max(total, 1)}
                    step={1}
                    value={[Math.min(shown, total)]}
                    disabled={disabled}
                    onValueChange={(v) => setDragging(v[0] ?? 0)}
                    onValueCommit={(v) => {
                        setDragging(null);
                        player.seek(v[0] ?? 0);
                    }}
                    thumbLabel={t('controls.seek')}
                />
            </div>
            <span className="w-11 shrink-0">{formatTimecode(total)}</span>
        </div>
    );
}
