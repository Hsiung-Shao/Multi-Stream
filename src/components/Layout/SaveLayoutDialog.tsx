import React, { useState } from 'react';
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
                    <DialogTitle>儲存目前布局</DialogTitle>
                    <DialogDescription>
                        將目前的視窗排列方式儲存為模板，以便日後快速套用。
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">
                            名稱
                        </Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="col-span-3"
                            placeholder="例如：FPS 觀戰模式"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button onClick={handleSave} disabled={!name.trim()}>儲存</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
