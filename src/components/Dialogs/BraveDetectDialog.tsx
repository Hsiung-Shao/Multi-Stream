import { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/useUIStore';

const BRAVE_DISMISS_KEY = 'brave_twitch_dismissed';

function isBraveBrowser(): boolean {
    return !!(navigator as any).brave;
}

export function BraveDetectDialog() {
    const { t } = useTranslation();
    const setPage = useUIStore(s => s.setPage);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!isBraveBrowser()) return;
        const dismissed = localStorage.getItem(BRAVE_DISMISS_KEY);
        if (dismissed) return;
        setOpen(true);
    }, []);

    const handleClose = () => {
        setOpen(false);
    };

    const handleDontRemind = () => {
        localStorage.setItem(BRAVE_DISMISS_KEY, 'true');
        setOpen(false);
    };

    const handleGoToFAQ = () => {
        setOpen(false);
        setPage('faq');
    };

    return (
        <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
            <DialogContent className="sm:max-w-[480px] border-t-[6px] border-t-yellow-500 gap-4">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <AlertTriangle className="text-yellow-500" />
                        {t('braveDetect.title')}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-3 py-2 text-base text-muted-foreground">
                    <p>{t('braveDetect.body')}</p>
                    <p className="text-sm">{t('braveDetect.hint')}</p>
                </div>

                <DialogFooter className="flex-col sm:flex-col gap-3 items-stretch">
                    <div className="flex justify-end gap-2 w-full">
                        <Button variant="outline" onClick={handleClose}>
                            {t('braveDetect.close')}
                        </Button>
                        <Button onClick={handleGoToFAQ} className="gap-2">
                            <ExternalLink className="w-4 h-4" />
                            {t('braveDetect.goToFAQ')}
                        </Button>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDontRemind}
                        className="text-xs text-muted-foreground self-center h-auto py-1"
                    >
                        {t('braveDetect.dontRemind')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
