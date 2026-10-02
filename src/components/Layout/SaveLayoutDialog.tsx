import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useStreamStore } from '../../store/useStreamStore';

interface SaveLayoutDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const SaveLayoutDialog: React.FC<SaveLayoutDialogProps> = ({ open, onOpenChange }) => {
    const { t } = useTranslation('common');
    const [name, setName] = useState('');
    const saveCustomLayout = useStreamStore(state => state.saveCustomLayout);

    const handleSave = async () => {
        if (!name.trim()) return;
        await saveCustomLayout(name.trim());
        setName('');
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t('common.save_layout')}</DialogTitle>
                    <DialogDescription>
                        {t('layout.save_dialog_desc')}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">
                            {t('layout.save_dialog_name')}
                        </Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="col-span-3"
                            placeholder={t('layout.save_dialog_placeholder')}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                    <Button onClick={handleSave} disabled={!name.trim()}>{t('common.save')}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
