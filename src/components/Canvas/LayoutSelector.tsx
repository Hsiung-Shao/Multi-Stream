import { useState } from 'react';
import { useStreamStore } from '../../store/useStreamStore';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Card } from '../ui/card';
import { Trash2, Play, Layout } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';

export function LayoutSelector() {
    const presets = useStreamStore(s => s.presets);
    const applyLayout = useStreamStore(s => s.applyLayout);
    const deleteLayout = useStreamStore(s => s.deleteLayout);
    const [open, setOpen] = useState(false);

    const handleApply = (id: string) => {
        applyLayout(id);
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <Layout className="w-4 h-4 mr-2" />
                    載入佈局
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>已儲存的佈局</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-2">
                        {presets.length === 0 ? (
                            <div className="text-center text-muted-foreground py-8">
                                尚未儲存任何佈局
                            </div>
                        ) : (
                            presets.map(preset => (
                                <Card key={preset.id} className="p-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                                    <div className="flex flex-col">
                                        <span className="font-medium">{preset.name}</span>
                                        <span className="text-xs text-muted-foreground">{preset.items.length} 個視窗</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleApply(preset.id)}
                                            title="套用佈局"
                                        >
                                            <Play className="w-4 h-4 text-green-500" />
                                        </Button>
                                        {preset.type === 'user' && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => deleteLayout(preset.id)}
                                                title="刪除"
                                            >
                                                <Trash2 className="w-4 h-4 text-destructive" />
                                            </Button>
                                        )}
                                    </div>
                                </Card>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
