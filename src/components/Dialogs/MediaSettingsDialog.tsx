
import { useTranslation } from 'react-i18next';
import { Volume2, VolumeX, Tv } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { useUIStore } from '../../store/useUIStore';

interface MediaSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function MediaSettingsDialog({ open, onOpenChange }: MediaSettingsDialogProps) {
    const { t } = useTranslation('common');

    // Stores
    const {
        theme,
        masterVolume,
        masterMuted,
        setMasterVolume,
        setMasterMuted
    } = useUIStore();

    const handleVolumeChange = (value: number[]) => {
        setMasterVolume(value[0]);
        if (value[0] > 0 && masterMuted) {
            setMasterMuted(false);
        }
    };

    const toggleMute = () => {
        setMasterMuted(!masterMuted);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={`sm:max-w-[425px] ${theme === 'dark' ? 'bg-zinc-950 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'}`}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Tv className="w-5 h-5" />
                        {t('media.title') || '媒體控制'}
                    </DialogTitle>
                    <DialogDescription>
                        {t('media.description') || '管理全局音量與媒體設定。'}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {/* Master Volume */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 min-w-[80px]">
                            {masterMuted || masterVolume === 0 ? (
                                <VolumeX className="w-5 h-5 text-muted-foreground" />
                            ) : (
                                <Volume2 className="w-5 h-5 text-purple-500" />
                            )}
                            <Label>{t('media.master_volume') || '主音量'}</Label>
                        </div>
                        <Slider
                            value={[masterMuted ? 0 : masterVolume]}
                            max={100}
                            step={1}
                            onValueChange={handleVolumeChange}
                            className="flex-1"
                        />
                        <span className="w-8 text-right text-sm text-muted-foreground">
                            {masterMuted ? 0 : masterVolume}%
                        </span>
                    </div>

                    {/* Mute Toggle */}
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col space-y-1">
                            <Label>{t('media.mute_all') || '靜音所有'}</Label>
                            <span className="text-xs text-muted-foreground">
                                {t('media.mute_desc') || '快速靜音所有串流音訊。'}
                            </span>
                        </div>
                        <Switch
                            checked={masterMuted}
                            onCheckedChange={toggleMute}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)} variant="outline">
                        {t('common.close') || '關閉'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
