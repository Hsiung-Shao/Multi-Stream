import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { AlertTriangle, Info, AlertOctagon } from 'lucide-react';
import { useI18n } from '../i18n/index';

interface YouTubeRiskDialogProps {
    open: boolean;
    streamCount: number;
    onClose: () => void;
    onPauseOthers?: () => void;
    onDontRemind: () => void;
}

export const YouTubeRiskDialog: React.FC<YouTubeRiskDialogProps> = ({
    open,
    streamCount,
    onClose,
    onPauseOthers,
    onDontRemind
}) => {
    const { t } = useI18n();

    const isStrongWarning = streamCount >= 4;

    // Custom interpolation helper since the basic I18nContext might not support it
    const formatText = (key: any, replacements: Record<string, string | number>) => {
        let text = t(key);
        Object.keys(replacements).forEach(placeholder => {
            text = text.replace(`{${placeholder}}`, String(replacements[placeholder]));
        });
        return text;
    };

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className={`sm:max-w-[500px] border-t-[6px] ${isStrongWarning ? 'border-t-red-500' : 'border-t-yellow-500'} gap-4`}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        {isStrongWarning ? (
                            <AlertOctagon className="text-red-500" />
                        ) : (
                            <AlertTriangle className="text-yellow-500" />
                        )}
                        {t('youtubeRisk.title' as any)}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="text-base">
                        {formatText('youtubeRisk.body' as any, { n: streamCount })}
                    </div>

                    <div className="bg-muted/50 p-4 rounded-lg text-sm border">
                        <h4 className="flex items-center gap-2 font-semibold mb-2">
                            <Info size={16} className="text-blue-500" />
                            {t('youtubeRisk.disclaimer.title' as any)}
                        </h4>
                        <ul className="space-y-2 list-none m-0 p-0 text-muted-foreground">
                            <li>{t('youtubeRisk.disclaimer.item1' as any)}</li>
                            <li>{t('youtubeRisk.disclaimer.item2' as any)}</li>
                            <li>{t('youtubeRisk.disclaimer.item3' as any)}</li>
                        </ul>
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-col gap-3 items-stretch">
                    <div className="flex justify-end gap-2 w-full">
                        {onPauseOthers && (
                            <Button
                                variant="outline"
                                onClick={onPauseOthers}
                                className="border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                {t('youtubeRisk.pauseOthers' as any)}
                            </Button>
                        )}
                        <Button onClick={onClose}>
                            {t('youtubeRisk.confirm' as any)}
                        </Button>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onDontRemind}
                        className="text-xs text-muted-foreground self-center h-auto py-1"
                    >
                        {t('youtubeRisk.sessionIgnore' as any)}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
