import { useTranslation } from 'react-i18next';
import { MessageSquare, ArrowLeftRight } from 'lucide-react';
import { BlockComponentProps } from '../BlockRegistry';
import { ChatBox } from '../ChatBox';
import { useStreamStore } from '../../../store/useStreamStore';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';

export function ChatBlock({ item, onUpdate }: BlockComponentProps) {
    const { t } = useTranslation('common');
    const streams = useStreamStore(s => s.streams);

    // If no content, show Empty State
    if (!item.contentId) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/80 gap-3 p-4">
                <div className="flex flex-col items-center gap-1 opacity-50">
                    <MessageSquare className="w-8 h-8" />
                    <span className="text-xs font-medium">
                        {t('layout.waiting_chat')}
                    </span>
                </div>

                <div className="flex flex-col gap-2 w-full max-w-[180px] z-20">
                    <Select
                        onValueChange={(value: string) => {
                            if (value) {
                                onUpdate({ contentId: Number(value) });
                            }
                        }}
                    >
                        <SelectTrigger
                            className="w-full h-8 text-xs bg-background/80 border rounded-md"
                            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                            {/* @ts-ignore */}
                            <SelectValue placeholder={t('layout.select_stream') || "Select Stream"} />
                        </SelectTrigger>
                        <SelectContent>
                            {streams.map(s => (
                                <SelectItem key={s.id} value={String(s.id)}>
                                    {s.displayName || s.name || `Stream ${s.id}`}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-2 w-full bg-background/50"
                        onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            onUpdate({ type: 'stream' });
                        }}
                        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                        <ArrowLeftRight className="w-3 h-3" />
                        Switch to Stream
                    </Button>
                </div>
            </div>
        );
    }

    return <ChatBox streamId={item.contentId} />;
}
