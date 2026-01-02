import { useState } from 'react';
import { useStreamStore } from '../../store/useStreamStore';
import { useUIStore } from '../../store/useUIStore';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Card } from '../ui/card';
import { Label } from '../ui/label';
import { ScrollArea } from '../ui/scroll-area';
import { Plus, Trash2, LayoutGrid } from 'lucide-react';
import { CanvasItemType } from '../../types/canvas';

export function LayoutEditor() {
    const theme = useUIStore(s => s.theme);
    const streams = useStreamStore(s => s.streams);
    const canvasItems = useStreamStore(s => s.canvasItems);
    const addCanvasItem = useStreamStore(s => s.addCanvasItem);
    const removeCanvasItem = useStreamStore(s => s.removeCanvasItem);

    const [selectedType, setSelectedType] = useState<CanvasItemType>('chat');
    const [selectedStreamId, setSelectedStreamId] = useState<string>('');
    const [open, setOpen] = useState(false);

    const handleAdd = () => {
        if (!selectedStreamId) return;
        const streamId = parseInt(selectedStreamId);
        if (isNaN(streamId)) return;

        addCanvasItem(selectedType, streamId);
        // Optional: Close dialog or keep open for more adding
    };

    const getStreamName = (id: number) => {
        const s = streams.find(st => st.id === id);
        return s ? (s.displayName || s.name || `Stream ${s.id}`) : `Unknown (${id})`;
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className={theme === 'dark' ? 'border-gray-700 text-gray-300' : ''}>
                    <LayoutGrid className="w-4 h-4 mr-2" />
                    編輯畫布
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>畫布編輯器</DialogTitle>
                    <DialogDescription>
                        新增或移除畫布上的視窗。您可以自由拖曳視窗位置。
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {/* Add New Item Section */}
                    <Card className="p-4 space-y-4">
                        <Label>新增視窗</Label>
                        <div className="flex gap-2">
                            <Select value={selectedType} onValueChange={(v: CanvasItemType) => setSelectedType(v)}>
                                <SelectTrigger className="w-[120px]">
                                    <SelectValue placeholder="類型" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="stream">串流畫面</SelectItem>
                                    <SelectItem value="chat">聊天室</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={selectedStreamId} onValueChange={setSelectedStreamId}>
                                <SelectTrigger className="flex-1">
                                    <SelectValue placeholder="選擇來源" />
                                </SelectTrigger>
                                <SelectContent>
                                    {streams.map(s => (
                                        <SelectItem key={s.id} value={s.id.toString()}>
                                            {s.displayName || s.name || `Stream ${s.id}`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button className="w-full" onClick={handleAdd} disabled={!selectedStreamId}>
                            <Plus className="w-4 h-4 mr-2" /> 新增至畫布
                        </Button>
                    </Card>

                    {/* Current Items List */}
                    <div className="space-y-2">
                        <Label>目前視窗 ({canvasItems.length})</Label>
                        <ScrollArea className="h-[200px] border rounded-md p-2">
                            <div className="space-y-2">
                                {canvasItems.map(item => (
                                    <div key={item.i} className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm">
                                        <div className="flex flex-col">
                                            <span className="font-medium">
                                                {item.type === 'stream' ? '📺 串流' : '💬 聊天室'}
                                            </span>
                                            <span className="text-muted-foreground text-xs">
                                                {getStreamName(item.contentId)}
                                            </span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                            onClick={() => removeCanvasItem(item.i)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                                {canvasItems.length === 0 && (
                                    <div className="text-center text-muted-foreground text-xs py-4">
                                        畫布上沒有任何視窗
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
