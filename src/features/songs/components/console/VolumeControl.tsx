import { useTranslation } from 'react-i18next';
import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Slider } from '../../../../components/ui/slider';
import type { SegmentPlayer } from '../../hooks/useSegmentPlayer';

/** 靜音鈕＋音量滑桿：手機寬度只留靜音鈕（滑桿佔位會擠掉歌名，系統音量鍵也能調） */
export function VolumeControl({ player }: { player: SegmentPlayer }) {
    const { t } = useTranslation('songs');
    const { volume, muted } = player;
    const silent = muted || volume === 0;
    const Icon = silent ? VolumeX : volume < 50 ? Volume1 : Volume2;
    const muteLabel = muted ? t('controls.unmute') : t('controls.mute');
    return (
        <div className="flex items-center gap-1.5 sm:ml-1">
            <Button variant="ghost" size="icon" className="size-10" onClick={player.toggleMute} aria-pressed={muted} aria-label={muteLabel} title={muteLabel}>
                <Icon className="size-5" aria-hidden="true" />
            </Button>
            <div role="group" aria-label={t('controls.volume')} title={`${t('controls.volume')} ${muted ? 0 : volume}`} className="hidden w-24 sm:block">
                <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[muted ? 0 : volume]}
                    onValueChange={(v) => player.setVolume(v[0] ?? 0)}
                    thumbLabel={t('controls.volume')}
                />
            </div>
        </div>
    );
}
