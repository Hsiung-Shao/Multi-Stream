import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useStreamStore } from '../../store/useStreamStore';
import { Plus, BoxSelect } from 'lucide-react';

interface AddStreamDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AddStreamDialog({ open, onOpenChange }: AddStreamDialogProps) {
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const addStream = useStreamStore(s => s.addStream);
    const addEmptyGroup = useStreamStore(s => s.addEmptyGroup);

    const handleAdd = async () => {
        if (!url.trim()) return;
        setIsLoading(true);
        setError('');

        try {
            const result = await addStream(url);
            if (result.success) {
                setUrl('');
                onOpenChange(false);
            } else {
                setError(result.message || '無法加入串流');
            }
        } catch (e) {
            setError('發生未知錯誤');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddEmpty = () => {
        addEmptyGroup();
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] bg-slate-900 text-white border-white/10">
                <DialogHeader>
                    <DialogTitle>新增視窗</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        輸入 Twitch/YouTube 網址或頻道名稱，或新增空白區塊。
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="url">直播網址 / 頻道 ID</Label>
                        <Input
                            id="url"
                            placeholder="例如: shroud 或 https://twitch.tv/shroud"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                            className="bg-slate-800 border-white/10 text-white placeholder:text-slate-500"
                        />
                        {error && <p className="text-sm text-red-400">{error}</p>}
                    </div>

                    <div className="flex flex-col gap-2 mt-2">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-white/10" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-slate-900 px-2 text-slate-500">或是</span>
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            onClick={handleAddEmpty}
                            className="w-full border-dashed border-white/20 hover:bg-white/5 hover:text-white text-slate-400"
                        >
                            <BoxSelect className="mr-2 h-4 w-4" />
                            新增空白群組 (測試用)
                        </Button>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-white">取消</Button>
                    <Button onClick={handleAdd} disabled={isLoading || !url.trim()} className="bg-purple-600 hover:bg-purple-700 text-white">
                        <Plus className="mr-2 h-4 w-4" />
                        {isLoading ? '處理中...' : '加入串流'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
