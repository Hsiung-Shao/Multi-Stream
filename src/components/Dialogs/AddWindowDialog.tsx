import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { useStreamStore } from '../../store/useStreamStore';
import { Plus, MonitorPlay, MessageSquare, LayoutTemplate } from 'lucide-react';

interface AddWindowDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type WindowMode = 'auto' | 'stream' | 'chat';

export function AddWindowDialog({ open, onOpenChange }: AddWindowDialogProps) {
    const [url, setUrl] = useState('');
    const [mode, setMode] = useState<WindowMode>('auto');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const addStream = useStreamStore(s => s.addStream);

    const handleAdd = async () => {
        if (!url.trim()) return;
        setIsLoading(true);
        setError('');

        try {
            // Map mode to options
            const options = {
                withChat: mode === 'auto' || mode === 'chat',
                withStream: mode === 'auto' || mode === 'stream'
            };

            const result = await addStream(url, options);

            if (result.success) {
                setUrl('');
                onOpenChange(false);
            } else {
                setError(result.message || '無法加入');
            }
        } catch (e) {
            setError('發生錯誤');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] bg-zinc-950 text-white border-zinc-800">
                <DialogHeader>
                    <DialogTitle>新增視窗</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        選擇視窗類型並輸入頻道網址。
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="auto" value={mode} onValueChange={(v: string) => setMode(v as WindowMode)} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 bg-zinc-900">
                        <TabsTrigger value="auto" className="flex items-center gap-2">
                            <LayoutTemplate size={16} />
                            標準組合
                        </TabsTrigger>
                        <TabsTrigger value="stream" className="flex items-center gap-2">
                            <MonitorPlay size={16} />
                            僅畫面
                        </TabsTrigger>
                        <TabsTrigger value="chat" className="flex items-center gap-2">
                            <MessageSquare size={16} />
                            僅聊天
                        </TabsTrigger>
                    </TabsList>

                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="url">直播網址 / 頻道 ID</Label>
                            <Input
                                id="url"
                                placeholder="例如: shroud 或 https://twitch.tv/shroud"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500"
                            />
                            {error && <p className="text-sm text-red-400">{error}</p>}
                        </div>

                        <div className="text-xs text-zinc-500">
                            {mode === 'auto' && "自動建立 20:4 的畫面與聊天室組合。"}
                            {mode === 'stream' && "僅建立直播畫面視窗。"}
                            {mode === 'chat' && "僅建立聊天室視窗 (適合監控聊天)。"}
                        </div>
                    </div>
                </Tabs>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-zinc-400 hover:text-white">取消</Button>
                    <Button onClick={handleAdd} disabled={isLoading || !url.trim()} className="bg-purple-600 hover:bg-purple-700 text-white">
                        <Plus className="mr-2 h-4 w-4" />
                        加入
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
